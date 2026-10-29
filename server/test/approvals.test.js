import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { api, guardFields, loginAs, prepareAttendanceGuards, useDatabase } from './helpers.js';

useDatabase();
before(prepareAttendanceGuards);

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/* Self-marks must carry geofence coordinates and a matching face descriptor. */
const selfMark = (payload) => ({ ...payload, ...guardFields() });

test('a late self-marked attendance day waits for the manager instead of being accepted', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).post('/api/attendance').send(selfMark({ workDate: inDays(1), status: 'present', loginTime: '10:12' }));
  assert.equal(res.status, 201);
  assert.equal(res.body.item.late, true);
  assert.equal(res.body.item.decision, 'pending');
});

test('a mark before the policy cut-off needs no approval', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).post('/api/attendance').send(selfMark({ workDate: inDays(2), status: 'present', loginTime: '09:05' }));
  assert.equal(res.body.item.late, false);
  assert.equal(res.body.item.decision, 'n/a');
});

test('a manager marks a report and the record is not pending', async () => {
  const sanjay = await loginAs('sanjay.iyer');
  const directory = await api(sanjay).get('/api/staff');
  const report = directory.body.items.find((row) => row.loginId === 'vikram.desai');
  const res = await api(sanjay).post('/api/attendance').send({ staffId: report.id, workDate: inDays(3), status: 'present', loginTime: '10:40', overrideReason: 'Face verification failing' });
  assert.equal(res.status, 201);
  assert.equal(res.body.item.decision, 'n/a', 'a manager marking is final, not a request');
});

test('a recruiter cannot decide their own pending mark', async () => {
  const ananya = await loginAs('ananya.rao');
  const marked = await api(ananya).post('/api/attendance').send(selfMark({ workDate: inDays(4), status: 'present', loginTime: '10:55' }));
  const res = await api(ananya).post(`/api/attendance/${marked.body.item.id}/decision`).send({ decision: 'accepted' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.message, 'You cannot decide your own request');
});

test('the direct manager accepts a late mark and signs the decision', async () => {
  const ananya = await loginAs('ananya.rao');
  const marked = await api(ananya).post('/api/attendance').send(selfMark({ workDate: inDays(5), status: 'present', loginTime: '11:20' }));
  const sanjay = await loginAs('sanjay.iyer');
  const res = await api(sanjay).post(`/api/attendance/${marked.body.item.id}/decision`).send({ decision: 'accepted', remarks: 'Client site delay' });
  assert.equal(res.status, 200);
  assert.equal(res.body.item.decision, 'accepted');
  assert.equal(res.body.item.signature, 'Sanjay Iyer');

  const twice = await api(sanjay).post(`/api/attendance/${marked.body.item.id}/decision`).send({ decision: 'rejected' });
  assert.equal(twice.status, 409);
});

test('a rejected mark withdraws the claim and leaves the day absent', async () => {
  const ananya = await loginAs('ananya.rao');
  const marked = await api(ananya).post('/api/attendance').send(selfMark({ workDate: inDays(10), status: 'present', loginTime: '11:05' }));
  const sanjay = await loginAs('sanjay.iyer');
  const res = await api(sanjay).post(`/api/attendance/${marked.body.item.id}/decision`).send({ decision: 'rejected' });
  assert.equal(res.status, 200);
  assert.equal(res.body.item.status, 'absent');
  assert.equal(res.body.item.loginTime, null);
  assert.equal(res.body.item.late, false);

  const again = await api(ananya).post('/api/attendance').send(selfMark({ workDate: inDays(10), status: 'present', loginTime: '09:10' }));
  assert.equal(again.status, 201);
  assert.equal(again.body.item.decision, 'n/a', 'a corrected mark is no longer a request');
});

test('a peer recruiter cannot decide another recruiter day', async () => {
  const ananya = await loginAs('ananya.rao');
  const marked = await api(ananya).post('/api/attendance').send(selfMark({ workDate: inDays(6), status: 'present', loginTime: '11:40' }));
  const vikram = await loginAs('vikram.desai');
  const res = await api(vikram).post(`/api/attendance/${marked.body.item.id}/decision`).send({ decision: 'accepted' });
  assert.equal(res.status, 403);
});

test('the HR Admin decides for anyone and the decision is marked as an override', async () => {
  const ananya = await loginAs('ananya.rao');
  const marked = await api(ananya).post('/api/attendance').send(selfMark({ workDate: inDays(7), status: 'present', loginTime: '12:02' }));
  const meera = await loginAs('meera.krishnan');
  const res = await api(meera).post(`/api/attendance/${marked.body.item.id}/decision`).send({ decision: 'accepted' });
  assert.equal(res.status, 200);
  assert.equal(res.body.item.signature, 'Meera Krishnan · override');
});

test('leave is applied for one date and decided by the manager', async () => {
  const ananya = await loginAs('ananya.rao');
  const applied = await api(ananya).post('/api/leave').send({ leaveDate: inDays(8), reason: 'Personal work' });
  assert.equal(applied.status, 201);
  assert.equal(applied.body.item.status, 'applied');

  const self = await api(ananya).post(`/api/leave/${applied.body.item.id}/decision`).send({ decision: 'accepted' });
  assert.equal(self.status, 403);

  const sanjay = await loginAs('sanjay.iyer');
  const queue = await api(sanjay).get('/api/leave/pending');
  assert.ok(queue.body.items.some((row) => row.id === applied.body.item.id));

  const decided = await api(sanjay).post(`/api/leave/${applied.body.item.id}/decision`).send({ decision: 'accepted', remarks: 'Cover arranged' });
  assert.equal(decided.status, 200);
  assert.equal(decided.body.item.status, 'accepted');

  const again = await api(sanjay).post(`/api/leave/${applied.body.item.id}/decision`).send({ decision: 'rejected' });
  assert.equal(again.status, 409);
});

test('a leave reason that is empty is refused', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).post('/api/leave').send({ leaveDate: inDays(9), reason: '  ' });
  assert.equal(res.status, 422);
});

test('a filing can be withdrawn by the person who filed it', async () => {
  const ananya = await loginAs('ananya.rao');
  const filed = await api(ananya).post('/api/resignations').send({ reason: 'Personal', noticeDate: today(), requestedLastDay: inDays(45) });
  assert.equal(filed.status, 201);
  const sanjay = await loginAs('sanjay.iyer');
  const wrongHands = await api(sanjay).post(`/api/resignations/${filed.body.item.id}/withdraw`).send({});
  assert.equal(wrongHands.status, 403);
  const withdrawn = await api(ananya).post(`/api/resignations/${filed.body.item.id}/withdraw`).send({});
  assert.equal(withdrawn.status, 200);
  assert.equal(withdrawn.body.item.status, 'withdrawn');
});

test('a resignation cannot be approved before the notice is accepted', async () => {
  const ananya = await loginAs('ananya.rao');
  const filed = await api(ananya).post('/api/resignations').send({ reason: 'Career change', noticeDate: today(), requestedLastDay: inDays(30) });
  assert.equal(filed.status, 201);

  const sanjay = await loginAs('sanjay.iyer');
  const early = await api(sanjay).post(`/api/resignations/${filed.body.item.id}/decision`).send({ decision: 'accepted', lastDay: inDays(30) });
  assert.equal(early.status, 400);
  assert.match(early.body.error.message, /notice period/i);

  const notice = await api(sanjay).post(`/api/resignations/${filed.body.item.id}/decision`).send({ decision: 'notice_accepted' });
  assert.equal(notice.status, 200);
  assert.equal(notice.body.item.status, 'notice_accepted');

  const approved = await api(sanjay).post(`/api/resignations/${filed.body.item.id}/decision`).send({ decision: 'accepted', lastDay: inDays(30) });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.item.status, 'accepted');
});

test('the 7-day notice rule blocks a last day that is too soon', async () => {
  const neha = await loginAs('neha.kulkarni');
  const filed = await api(neha).post('/api/resignations').send({ reason: 'Relocating', noticeDate: today(), requestedLastDay: inDays(3) });
  assert.equal(filed.status, 201, 'filing is never blocked, only the approval is');

  const sanjay = await loginAs('sanjay.iyer');
  await api(sanjay).post(`/api/resignations/${filed.body.item.id}/decision`).send({ decision: 'notice_accepted' });
  const res = await api(sanjay).post(`/api/resignations/${filed.body.item.id}/decision`).send({ decision: 'accepted', lastDay: inDays(3) });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /less than 7 days/i);
});

test('only one resignation may be open per person', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).post('/api/resignations').send({ reason: 'Another attempt', noticeDate: today(), requestedLastDay: inDays(40) });
  assert.equal(res.status, 409);
});
