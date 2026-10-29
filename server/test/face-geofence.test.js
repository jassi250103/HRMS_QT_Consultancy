import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { query } from '../src/db.js';
import { api, guardFields, loginAs, OFFICE, prepareAttendanceGuards, syntheticDescriptor, useDatabase } from './helpers.js';

useDatabase();

const today = () => new Date().toISOString().slice(0, 10);

before(async () => {
  await prepareAttendanceGuards();
  await query('DELETE FROM attendance WHERE work_date = $1', [today()]);
});

const clearFace = (loginId) => query(
  'UPDATE staff SET face_embedding = NULL, face_enrolled_at = NULL FROM staff_account a WHERE a.login_id = $1 AND a.staff_id = staff.id',
  [loginId],
);
const enrollFace = (loginId, vectors) => query(
  "UPDATE staff SET face_embedding = $2, face_enrolled_at = now() FROM staff_account a WHERE a.login_id = $1 AND a.staff_id = staff.id",
  [loginId, JSON.stringify(vectors)],
);

test('a self-mark without a face enrollment is refused', async () => {
  await clearFace('vikram.desai');
  try {
    const vikram = await loginAs('vikram.desai');
    const res = await api(vikram).post('/api/attendance').send({
      workDate: today(), status: 'present', loginTime: '09:10',
      latitude: OFFICE.latitude, longitude: OFFICE.longitude, faceDescriptor: syntheticDescriptor(0),
    });
    assert.equal(res.status, 403);
    assert.match(res.body.error.message, /not enrolled/i);
  } finally {
    await enrollFace('vikram.desai', [syntheticDescriptor(0)]);
  }
});

test('a self-mark with a face that does not match is refused', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).post('/api/attendance').send({
    workDate: today(), status: 'present', loginTime: '09:10',
    latitude: OFFICE.latitude, longitude: OFFICE.longitude,
    faceDescriptor: syntheticDescriptor(42), // a different face
  });
  assert.equal(res.status, 403);
  assert.match(res.body.error.message, /does not match the enrolled template/i);
});

test('a self-mark from outside the office geofence is refused', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).post('/api/attendance').send({
    workDate: today(), status: 'present', loginTime: '09:10',
    latitude: OFFICE.latitude + 0.05, longitude: OFFICE.longitude, // ~5.5km away
    faceDescriptor: syntheticDescriptor(0),
  });
  assert.equal(res.status, 403);
  assert.match(res.body.error.message, /outside office geofence/i);
});

test('a present self-mark without location coordinates is refused', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).post('/api/attendance').send({
    workDate: today(), status: 'present', loginTime: '09:10',
    faceDescriptor: syntheticDescriptor(0),
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /location/i);
});

test('a matching face inside the geofence records the mark as verified', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).post('/api/attendance').send({
    workDate: today(), status: 'present', loginTime: '09:10', ...guardFields(),
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.item.faceVerified, true);
});

test('a manager marking a report Present needs an override reason, which is then recorded', async () => {
  const sanjay = await loginAs('sanjay.iyer');
  const directory = await api(sanjay).get('/api/staff');
  const report = directory.body.items.find((row) => row.loginId === 'neha.kulkarni');

  const noReason = await api(sanjay).post('/api/attendance').send({
    staffId: report.id, workDate: today(), status: 'present', loginTime: '09:05',
  });
  assert.equal(noReason.status, 400);
  assert.match(noReason.body.error.message, /override reason/i);

  const withReason = await api(sanjay).post('/api/attendance').send({
    staffId: report.id, workDate: today(), status: 'present', loginTime: '09:05',
    overrideReason: 'Camera or device not working',
  });
  assert.equal(withReason.status, 201, 'the manager path skips face and geofence checks');
  assert.equal(withReason.body.item.manualOverride, true);
  assert.equal(withReason.body.item.overrideReason, 'Camera or device not working');
});

test('an absent mark for a report does not require a reason', async () => {
  const sanjay = await loginAs('sanjay.iyer');
  const directory = await api(sanjay).get('/api/staff');
  const report = directory.body.items.find((row) => row.loginId === 'neha.kulkarni');
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const res = await api(sanjay).post('/api/attendance').send({
    staffId: report.id, workDate: yesterday, status: 'absent',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.item.manualOverride, false);

  await query('DELETE FROM attendance WHERE staff_id = $1 AND work_date = $2', [report.id, yesterday]);
});

test('a self-mark can never smuggle an override reason past the face guard', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).post('/api/attendance').send({
    workDate: today(), status: 'present', loginTime: '09:10',
    latitude: OFFICE.latitude, longitude: OFFICE.longitude,
    overrideReason: 'Camera or device not working', // no faceDescriptor on purpose
  });
  assert.equal(res.status, 400, 'the reason is ignored for self-marks; the face capture is still required');
  assert.match(res.body.error.message, /face capture required/i);
});

test('enrollment rejects low-confidence samples and double enrollment', async () => {
  await clearFace('vikram.desai');
  try {
    const vikram = await loginAs('vikram.desai');

    const weak = await api(vikram).post('/api/face-enrollment').send({
      descriptors: [{ descriptor: syntheticDescriptor(1), confidence: 0.2 }],
    });
    assert.equal(weak.status, 400);
    assert.match(weak.body.error.message, /confidence too low/i);

    const ok = await api(vikram).post('/api/face-enrollment').send({
      descriptors: [
        { descriptor: syntheticDescriptor(1), confidence: 0.9 },
        { descriptor: syntheticDescriptor(2), confidence: 0.85 },
      ],
    });
    assert.equal(ok.status, 200);

    const twice = await api(vikram).post('/api/face-enrollment').send({
      descriptors: [{ descriptor: syntheticDescriptor(3), confidence: 0.9 }],
    });
    assert.equal(twice.status, 409, 'enrollment is one-time');
  } finally {
    await enrollFace('vikram.desai', [syntheticDescriptor(0)]);
  }
});

test('only an admin can remove a face enrollment', async () => {
  await clearFace('vikram.desai');
  await enrollFace('vikram.desai', [syntheticDescriptor(0)]);

  const vikram = await loginAs('vikram.desai');
  const self = await api(vikram).del('/api/face-enrollment');
  assert.equal(self.status, 403);

  const meera = await loginAs('meera.krishnan');
  const staff = await api(meera).get('/api/staff');
  const row = staff.body.items.find((item) => item.loginId === 'vikram.desai');
  const byAdmin = await api(meera).del(`/api/face-enrollment?staffId=${row.id}`);
  assert.equal(byAdmin.status, 200);

  const cleared = await api(vikram).get('/api/face-enrollment/me');
  assert.equal(cleared.body.enrolled, false);

  await enrollFace('vikram.desai', [syntheticDescriptor(0)]);
});
