import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import request from 'supertest';
import { api, app, guardFields, loginAs, prepareAttendanceGuards, useDatabase } from './helpers.js';

useDatabase();
before(prepareAttendanceGuards);

const month = () => new Date().toISOString().slice(0, 7);

test('health reports the connected database', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.match(res.body.database, /^18/);
});

test('master values carry their usage count', async () => {
  const meera = await loginAs('meera.krishnan');
  const res = await api(meera).get('/api/master');
  const companies = res.body.items.companies;
  assert.ok(companies.length >= 5);
  const aster = companies.find((row) => row.value === 'Aster Logistics LLP');
  assert.ok(aster.useCount > 0);
});

test('renaming a master value follows through to every recruit that uses it', async () => {
  const meera = await loginAs('meera.krishnan');
  const list = await api(meera).get('/api/master');
  const target = list.body.items.hubs.find((row) => row.useCount > 0);
  const before = await api(meera).get(`/api/recruits?hub=${encodeURIComponent(target.value)}&pageSize=200`);
  assert.ok(before.body.items.length > 0);

  const renamed = await api(meera).patch(`/api/master/${target.id}`).send({ value: `${target.value} (renamed)` });
  assert.equal(renamed.status, 200);

  const after = await api(meera).get(`/api/recruits?hub=${encodeURIComponent(`${target.value} (renamed)`)}&pageSize=200`);
  assert.equal(after.body.items.length, before.body.items.length);

  const gone = await api(meera).get(`/api/recruits?hub=${encodeURIComponent(target.value)}&pageSize=200`);
  assert.equal(gone.body.total, 0);

  await api(meera).patch(`/api/master/${renamed.body.item.id}`).send({ value: target.value });
});

test('a value in use is retired, never deleted', async () => {
  const meera = await loginAs('meera.krishnan');
  const list = await api(meera).get('/api/master');
  const target = list.body.items.hrs.find((row) => row.useCount > 0);

  const retired = await api(meera).post(`/api/master/${target.id}/status`).send({ active: false });
  assert.equal(retired.status, 200);
  assert.equal(retired.body.item.active, false);

  const active = await api(meera).get('/api/master/active');
  assert.ok(!active.body.hrs.includes(target.value), 'retired values disappear from the picklist');

  const still = await api(meera).get('/api/master');
  assert.ok(still.body.items.hrs.some((row) => row.value === target.value && row.active === false), 'history is preserved');

  await api(meera).post(`/api/master/${target.id}/status`).send({ active: true });
});

test('an unused master value can be deleted outright', async () => {
  const meera = await loginAs('meera.krishnan');
  const created = await api(meera).post('/api/master').send({ kind: 'companies', value: 'Temp Delete Me' });
  assert.equal(created.status, 201);
  const id = created.body.item.id;

  const gone = await api(meera).del(`/api/master/${id}`);
  assert.equal(gone.status, 200);

  const after = await api(meera).get('/api/master');
  assert.ok(!after.body.items.companies.some((row) => row.value === 'Temp Delete Me'), 'deleted value is gone');
});

test('deleting a master value that records use is refused', async () => {
  const meera = await loginAs('meera.krishnan');
  const list = await api(meera).get('/api/master');
  const target = list.body.items.companies.find((row) => row.useCount > 0);

  const res = await api(meera).del(`/api/master/${target.id}`);
  assert.equal(res.status, 409);
});

test('only the HR Admin edits master data', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).post('/api/master').send({ kind: 'companies', value: 'Should Not Exist' });
  assert.equal(res.status, 403);
});

test('policy drives the lateness threshold used by attendance', async () => {
  const meera = await loginAs('meera.krishnan');
  const read = await api(meera).get('/api/policy');
  assert.equal(read.status, 200);
  assert.equal(read.body.lateAfter, '09:30');
  assert.equal(read.body.noticeDays, 7);

  const moved = await api(meera).put('/api/policy').send({ ...read.body, lateAfter: '10:30' });
  assert.equal(moved.status, 200);

  const ananya = await loginAs('ananya.rao');
  const late = await api(ananya).post('/api/attendance').send({ workDate: '2026-11-19', status: 'present', loginTime: '10:05', ...guardFields() });
  assert.equal(late.status, 201, JSON.stringify(late.body.error ?? ''));
  assert.equal(late.body.item.late, false, '10:05 is on time once the cut-off moves to 10:30');

  await api(meera).put('/api/policy').send({ ...moved.body.item, lateAfter: '09:30' });
  const back = await api(ananya).post('/api/attendance').send({ workDate: '2026-11-19', status: 'present', loginTime: '10:05', ...guardFields() });
  assert.equal(back.body.item.late, true);
});

test('a recruiter cannot change policy', async () => {
  const ananya = await loginAs('ananya.rao');
  const current = await api(ananya).get('/api/policy');
  const res = await api(ananya).put('/api/policy').send(current.body);
  assert.equal(res.status, 403);
});

test('targets are assigned by the HR Admin and rolled up, never stored for managers', async () => {
  const meera = await loginAs('meera.krishnan');
  const staff = await api(meera).get('/api/staff');
  const ananyaRow = staff.body.items.find((row) => row.loginId === 'ananya.rao');
  const set = await api(meera).put('/api/targets').send({ staffId: ananyaRow.id, month: month(), target: 26 });
  assert.equal(set.status, 200);
  assert.equal(set.body.item.target, 26);

  const ananya = await loginAs('ananya.rao');
  const mine = await api(ananya).get(`/api/targets?month=${month()}`);
  assert.equal(mine.body.self.target, 26);

  const sanjay = await loginAs('sanjay.iyer');
  const team = await api(sanjay).get(`/api/targets?month=${month()}`);
  assert.equal(team.body.items.length, 3, 'the three recruiters on the team');
  assert.ok(team.body.rollup.target >= 26);
  assert.ok(!team.body.items.some((row) => row.role === 'manager'), 'a manager has no target row of their own');
});

test('the HR Admin may assign a target to a manager but not to nobody', async () => {
  const meera = await loginAs('meera.krishnan');
  const staff = await api(meera).get('/api/staff');
  const manager = staff.body.items.find((row) => row.role === 'manager');
  const res = await api(meera).put('/api/targets').send({ staffId: manager.id, month: month(), target: 10 });
  assert.equal(res.status, 404);
});

test('provisioning an account returns a temporary password once', async () => {
  const meera = await loginAs('meera.krishnan');
  const created = await api(meera).post('/api/staff').send({ name: 'Priya Nambiar', designation: 'Recruiter', role: 'recruiter', city: 'Bengaluru' });
  assert.equal(created.status, 201);
  assert.match(created.body.item.employeeCode, /^EMP-\d{4}$/);

  const account = await api(meera).post(`/api/staff/${created.body.item.id}/account`).send({ loginId: 'priya.nambiar' });
  assert.equal(account.status, 201);
  assert.match(account.body.tempPassword, /^Hrms@\d{6}$/);

  const repeat = await api(meera).post(`/api/staff/${created.body.item.id}/account`).send({ loginId: 'priya.two' });
  assert.equal(repeat.status, 409);

  const signedIn = await request(app).post('/api/auth/login').send({ loginId: 'priya.nambiar', password: account.body.tempPassword });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.body.actor.mustChange, true);

  const changed = await api({ token: signedIn.body.token, cookie: '' }).post('/api/auth/change-password')
    .send({ currentPassword: account.body.tempPassword, newPassword: 'Nambiar@2026' });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.actor.mustChange, false);
});

test('a manager cannot provision accounts or read the audit trail', async () => {
  const sanjay = await loginAs('sanjay.iyer');
  const meera = await loginAs('meera.krishnan');
  const staff = await api(meera).get('/api/staff');
  const row = staff.body.items.find((item) => !item.hasAccount);
  const provision = await api(sanjay).post(`/api/staff/${row.id}/account`).send({ loginId: 'not.allowed' });
  assert.equal(provision.status, 403);

  const audit = await api(sanjay).get('/api/audit');
  assert.equal(audit.status, 403);
});

test('every decision is written to the audit trail with the actor', async () => {
  const meera = await loginAs('meera.krishnan');
  const created = await api(meera).post('/api/recruits').send({ code: 'AUDIT-001', name: 'Audit Trail Candidate', doj: '2026-10-01' });
  const deactivated = await api(meera).post(`/api/recruits/${created.body.item.uuid}/deactivate`).send({ reason: 'Not reachable' });
  assert.equal(deactivated.status, 200);

  for (const action of ['recruit_created', 'recruit_deactivated', 'attendance_accepted', 'leave_applied', 'password_changed', 'database_seeded']) {
    const res = await api(meera).get(`/api/audit?action=${action}&limit=20`);
    assert.equal(res.status, 200);
    assert.ok(res.body.items.length > 0, `${action} is missing from the trail`);
    assert.ok(res.body.items.every((row) => row.action === action), `${action} filter returned other actions`);
    assert.ok(res.body.items.every((row) => row.actorName), `${action} entry has no actor`);
  }

  const mine = await api(meera).get('/api/audit?action=recruit_deactivated&limit=1');
  assert.equal(mine.body.items[0].actorName, 'Meera Krishnan');
  assert.equal(mine.body.items[0].entityId, created.body.item.uuid);
});

test('the dashboard reports the month counted from joining dates', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).get('/api/dashboard');
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.month, month());
  assert.equal(res.body.kpis.joinedToday, res.body.todayJoined.length);
  assert.equal(res.body.summary.achieved, res.body.kpis.joinedThisMonth);
  assert.ok(res.body.byCompany.length > 0);
});

test('the CSV export carries the filtered rows', async () => {
  const meera = await loginAs('meera.krishnan');
  const res = await api(meera).get('/api/recruits/export.csv?status=Active');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  const lines = res.text.replace(/^[\uFEFF]/, '').split('\r\n');
  assert.equal(lines[0].startsWith('"Code","Name"'), true);
  assert.ok(lines.length > 1);
});
