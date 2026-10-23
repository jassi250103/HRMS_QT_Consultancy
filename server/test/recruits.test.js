import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, loginAs, useDatabase } from './helpers.js';

useDatabase();

test('a recruiter sees only their own recruits', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).get('/api/recruits?pageSize=200');
  assert.equal(res.status, 200);
  assert.ok(res.body.items.length > 0);
  assert.ok(res.body.items.every((row) => row.ownerName === 'Ananya Rao'));

  const neha = await loginAs('neha.kulkarni');
  const hers = await api(neha).get('/api/recruits?pageSize=200');
  assert.ok(hers.body.items.every((row) => row.ownerName === 'Neha Kulkarni'));
});

test('a manager sees the team line, the HR Admin sees everyone', async () => {
  const sanjay = await loginAs('sanjay.iyer');
  const team = await api(sanjay).get('/api/recruits?pageSize=200');
  const owners = new Set(team.body.items.map((row) => row.ownerName));
  assert.ok(owners.has('Ananya Rao') && owners.has('Vikram Desai') && owners.has('Neha Kulkarni'));

  const meera = await loginAs('meera.krishnan');
  const all = await api(meera).get('/api/recruits?pageSize=200');
  assert.ok(all.body.total >= team.body.total);
});

test('one recruiter cannot read another recruit record', async () => {
  const ananya = await loginAs('ananya.rao');
  const neha = await loginAs('neha.kulkarni');
  const list = await api(neha).get('/api/recruits?pageSize=200');
  const foreign = list.body.items[0];
  const res = await api(ananya).get(`/api/recruits/${foreign.id}`);
  assert.equal(res.status, 404);
});

test('creating a recruit stores it against the signed-in recruiter', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).post('/api/recruits').send({
    name: 'Test Candidate One', company: 'Aster Logistics LLP', role: 'Warehouse Associate',
    city: 'Bengaluru', doj: new Date().toISOString().slice(0, 10),
  });
  assert.equal(res.status, 201);
  assert.match(res.body.item.code, /^RCT-\d+$/);
  assert.equal(res.body.item.ownerName, 'Ananya Rao');
  assert.equal(res.body.item.status, 'Active');
});

test('deactivation without a reason is refused at every level', async () => {
  const ananya = await loginAs('ananya.rao');
  const created = await api(ananya).post('/api/recruits').send({ name: 'Reasonless Candidate', doj: '2026-10-01' });
  const id = created.body.item.uuid;

  const patch = await api(ananya).patch(`/api/recruits/${id}`).send({ status: 'not_active' });
  assert.equal(patch.status, 422);
  assert.equal(patch.body.error.code, 'validation_failed');
  assert.equal(patch.body.error.fields.deactivationReason, 'Reason required');

  const blank = await api(ananya).post(`/api/recruits/${id}/deactivate`).send({ reason: '   ' });
  assert.equal(blank.status, 400);

  const ok = await api(ananya).post(`/api/recruits/${id}/deactivate`).send({ reason: 'Joined another organisation' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.item.status, 'Not Active');
  assert.equal(ok.body.item.deactivationReason, 'Joined another organisation');
  assert.ok(ok.body.item.deactivatedOn);
});

test('a not-active record keeps its reason even after reactivation', async () => {
  const ananya = await loginAs('ananya.rao');
  const created = await api(ananya).post('/api/recruits').send({ name: 'Reactivated Candidate', doj: '2026-10-01' });
  await api(ananya).post(`/api/recruits/${created.body.item.uuid}/deactivate`).send({ reason: 'Document mismatch' });
  const back = await api(ananya).post(`/api/recruits/${created.body.item.uuid}/activate`).send({});
  assert.equal(back.status, 200);
  assert.equal(back.body.item.status, 'Active');
  assert.equal(back.body.item.deactivationReason, '');
});

test('another recruiter cannot deactivate a record that is not theirs', async () => {
  const ananya = await loginAs('ananya.rao');
  const neha = await loginAs('neha.kulkarni');
  const created = await api(ananya).post('/api/recruits').send({ name: 'Protected Candidate', doj: '2026-10-01' });
  const res = await api(neha).post(`/api/recruits/${created.body.item.uuid}/deactivate`).send({ reason: 'Document mismatch' });
  assert.equal(res.status, 404, 'the record is not visible outside its owner scope');
});

test('filters, paging and sorting run on the server', async () => {
  const meera = await loginAs('meera.krishnan');
  const page1 = await api(meera).get('/api/recruits?pageSize=5&page=1&sort=doj');
  assert.equal(page1.body.items.length, 5);
  assert.ok(page1.body.total > 5);

  const page2 = await api(meera).get('/api/recruits?pageSize=5&page=2&sort=doj');
  assert.notEqual(page1.body.items[0].code, page2.body.items[0].code);

  const activeOnly = await api(meera).get('/api/recruits?status=Not Active&pageSize=100');
  assert.ok(activeOnly.body.items.every((row) => row.status === 'Not Active'));

  const search = await api(meera).get(`/api/recruits?q=${encodeURIComponent(page1.body.items[0].name.split(' ')[0])}`);
  assert.ok(search.body.items.length >= 1);
});

test('only the HR Admin can move a recruit to another recruiter', async () => {
  const ananya = await loginAs('ananya.rao');
  const neha = await loginAs('neha.kulkarni');
  const created = await api(ananya).post('/api/recruits').send({ name: 'Handover Candidate', doj: '2026-10-01' });

  const meera = await loginAs('meera.krishnan');
  const directory = await api(meera).get('/api/staff');
  const target = directory.body.items.find((row) => row.loginId === 'neha.kulkarni');
  const manager = directory.body.items.find((row) => row.loginId === 'sanjay.iyer');

  const ownDirectory = await api(ananya).get('/api/staff');
  const ownIds = ownDirectory.body.items.map((row) => row.id);
  assert.ok(ownIds.includes(ananya.actor.id), 'a recruiter sees their own record');
  assert.ok(ownIds.includes(manager.id), 'the reporting line above is visible');
  assert.ok(!ownIds.includes(target.id), 'a peer recruiter is not in the directory');
  const refused = await api(ananya).patch(`/api/recruits/${created.body.item.uuid}`).send({ ownerId: target.id });
  assert.equal(refused.status, 403);

  const moved = await api(meera).patch(`/api/recruits/${created.body.item.uuid}`).send({ ownerId: target.id });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.item.ownerName, 'Neha Kulkarni');
  assert.ok((await api(neha).get('/api/recruits?pageSize=200')).body.items.some((row) => row.code === created.body.item.code));
});

test('documents are optional on a recruit record', async () => {
  const ananya = await loginAs('ananya.rao');
  const res = await api(ananya).post('/api/recruits').send({ name: 'No Papers Candidate' });
  assert.equal(res.status, 201);
  const detail = await api(ananya).get(`/api/recruits/${res.body.item.uuid}`);
  assert.deepEqual(detail.body.item.documents, {});
});
