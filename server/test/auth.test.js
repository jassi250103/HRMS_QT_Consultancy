import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { api, app, loginAs, restoreSeedPassword, useDatabase } from './helpers.js';

useDatabase();

test('sign-in issues a token and a refresh cookie', async () => {
  const res = await request(app).post('/api/auth/login').send({ loginId: 'ananya.rao', password: 'Staffing@2026' });
  assert.equal(res.status, 200);
  assert.equal(res.body.actor.roleLabel, 'Recruiter');
  assert.ok(res.body.token);
  assert.match(res.headers['set-cookie'].join(';'), /hrms_refresh=.*HttpOnly/);
  assert.ok(!JSON.stringify(res.body).includes('password_hash'));
});

test('a wrong password is rejected without revealing which part failed', async () => {
  const res = await request(app).post('/api/auth/login').send({ loginId: 'ananya.rao', password: 'wrong-pass-1' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.message, 'Invalid login ID or password');
});

test('an unknown login ID returns the same message', async () => {
  const res = await request(app).post('/api/auth/login').send({ loginId: 'nobody.here', password: 'whatever-1' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.message, 'Invalid login ID or password');
});

test('five failures lock the account and a correct password is then refused', async () => {
  const session = await loginAs('neha.kulkarni');
  assert.ok(session.token);

  for (let i = 0; i < 5; i += 1) {
    await request(app).post('/api/auth/login').send({ loginId: 'neha.kulkarni', password: `bad-pass-${i}` });
  }
  const locked = await request(app).post('/api/auth/login').send({ loginId: 'neha.kulkarni', password: 'Staffing@2026' });
  assert.equal(locked.status, 403);
  assert.match(locked.body.error.message, /locked/i);

  const admin = await loginAs('meera.krishnan');
  const directory = await api(admin).get('/api/staff');
  const neha = directory.body.items.find((row) => row.loginId === 'neha.kulkarni');
  assert.equal(neha.locked, true);

  const fixed = await api(admin).post(`/api/staff/${neha.id}/unlock`).send({});
  assert.equal(fixed.status, 200);

  const again = await request(app).post('/api/auth/login').send({ loginId: 'neha.kulkarni', password: 'Staffing@2026' });
  assert.equal(again.status, 200);
});

test('the refresh cookie rotates and the old value stops working', async () => {
  const res = await request(app).post('/api/auth/login').send({ loginId: 'ananya.rao', password: 'Staffing@2026' });
  const cookie = res.headers['set-cookie'][0].split(';')[0];
  const first = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
  assert.equal(first.status, 200);
  const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
  assert.equal(replay.status, 401);
});

test('logout revokes the session', async () => {
  const session = await loginAs('ananya.rao');
  const cookie = session.res.headers['set-cookie'][0].split(';')[0];
  await request(app).post('/api/auth/logout').set('Cookie', cookie);
  const reuse = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
  assert.equal(reuse.status, 401);
});

test('an expired or missing token cannot read records', async () => {
  const anonymous = await request(app).get('/api/recruits');
  assert.equal(anonymous.status, 401);
  const forged = await request(app).get('/api/recruits').set('Authorization', 'Bearer not-a-jwt');
  assert.equal(forged.status, 401);
});

test('a new password shorter than the policy minimum is refused', async () => {
  const session = await loginAs('ananya.rao');
  const res = await api(session).post('/api/auth/change-password').send({ currentPassword: 'Staffing@2026', newPassword: 'abc1' });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /characters/);
});

test('reusing the current password is refused', async () => {
  const session = await loginAs('ananya.rao');
  const res = await api(session).post('/api/auth/change-password').send({ currentPassword: 'Staffing@2026', newPassword: 'Staffing@2026' });
  assert.equal(res.status, 400);
});

test('changing the password works and the new one signs in', async () => {
  const session = await loginAs('vikram.desai');
  const changed = await api(session).post('/api/auth/change-password').send({ currentPassword: 'Staffing@2026', newPassword: 'Desai@2026new' });
  assert.equal(changed.status, 200);
  const bad = await request(app).post('/api/auth/login').send({ loginId: 'vikram.desai', password: 'Staffing@2026' });
  assert.equal(bad.status, 401);
  const good = await request(app).post('/api/auth/login').send({ loginId: 'vikram.desai', password: 'Desai@2026new' });
  assert.equal(good.status, 200);
  assert.equal(good.body.actor.mustChange, false);

  // The history rule blocks changing back to the seed value, so the row is rewritten for the rest of the suite.
  await restoreSeedPassword('vikram.desai');
  const back = await loginAs('vikram.desai');
  assert.equal(back.actor.loginId, 'vikram.desai');
});

test('the HR Admin resets a password and the member must change it at next sign-in', async () => {
  const admin = await loginAs('meera.krishnan');
  const directory = await api(admin).get('/api/staff');
  const row = directory.body.items.find((item) => item.loginId === 'neha.kulkarni');
  const reset = await api(admin).post(`/api/staff/${row.id}/reset-password`).send({});
  assert.equal(reset.status, 200);
  assert.match(reset.body.tempPassword, /^Hrms@\d{6}$/);

  const stale = await request(app).post('/api/auth/login').send({ loginId: 'neha.kulkarni', password: 'Staffing@2026' });
  assert.equal(stale.status, 401, 'the previous password stops working');

  const fresh = await request(app).post('/api/auth/login').send({ loginId: 'neha.kulkarni', password: reset.body.tempPassword });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.actor.mustChange, true);

  const session = { token: fresh.body.token, cookie: '' };
  const flagged = await api(session).get('/api/auth/me');
  assert.equal(flagged.body.actor.mustChange, true);

  // Put the shared seed password back so the rest of the suite can sign in as her.
  await restoreSeedPassword('neha.kulkarni');
  const ready = await loginAs('neha.kulkarni');
  assert.equal(ready.actor.mustChange, false);
});

test('the impersonation route no longer exists', async () => {
  const admin = await loginAs('meera.krishnan');
  const staff = await api(admin).get('/api/staff');
  const sanjay = staff.body.items.find((row) => row.loginId === 'sanjay.iyer');
  const gone = await api(admin).post('/api/auth/act-as').send({ staffId: sanjay.id });
  assert.equal(gone.status, 404);
  const exitGone = await api(admin).post('/api/auth/act-as/exit').send({});
  assert.equal(exitGone.status, 404);
});
