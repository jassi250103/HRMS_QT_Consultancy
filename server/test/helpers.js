import { after, before } from 'node:test';
import request from 'supertest';

/* The suite logs in far more often than a real user, so the login throttle is raised before src/config.js
   is evaluated, which means db.js and app.js are loaded dynamically. */
process.env.LOGIN_RATE_MAX ||= '200';
const [{ closePool, query }, { createApp }] = await Promise.all([import('../src/db.js'), import('../src/app.js')]);

export const app = createApp();
export const PASSWORD = 'Staffing@2026';

export async function loginAs(loginId, password = PASSWORD) {
  const res = await request(app).post('/api/auth/login').send({ loginId, password });
  if (res.status !== 200) throw new Error(`login failed for ${loginId}: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  return { token: res.body.token, cookie, actor: res.body.actor, res };
}

export function api(session) {
  return {
    get: (url) => withAuth(request(app).get(url), session),
    post: (url) => withAuth(request(app).post(url), session),
    patch: (url) => withAuth(request(app).patch(url), session),
    put: (url) => withAuth(request(app).put(url), session),
    delete: (url) => withAuth(request(app).delete(url), session),
    del: (url) => withAuth(request(app).delete(url), session),
  };
}

function withAuth(call, session) {
  return call.set('Authorization', `Bearer ${session.token}`).set('Cookie', session.cookie);
}

export async function truncateAll() {
  await query('TRUNCATE audit_log, recruit_document, recruit, attendance, leave_request, resignation, placement_target, master_item, refresh_session, password_history, staff_account, staff RESTART IDENTITY CASCADE');
}

/* Password rules refuse to reuse a recent value, so a test that changed a password cannot change it
   back through the API. Rewrite the row instead of leaving the rest of the suite locked out. */
export async function restoreSeedPassword(loginId) {
  const { hashPassword } = await import('../src/security/passwords.js');
  const hash = await hashPassword(PASSWORD);
  await query(
    `UPDATE staff_account SET password_hash = $2, must_change = false, locked = false,
            failed_attempts = 0, locked_until = NULL, password_updated_at = now()
     WHERE lower(login_id) = lower($1)`,
    [loginId, hash],
  );
  await query(
    'DELETE FROM password_history WHERE staff_id IN (SELECT staff_id FROM staff_account WHERE lower(login_id) = lower($1))',
    [loginId],
  );
}

export function useDatabase() {
  before(async () => {
    const hit = await query('SELECT count(*)::int AS n FROM staff');
    if (!hit.rows[0].n) throw new Error('The test database is empty — run: npm run migrate && npm run seed');
  });
  after(async () => {
    await closePool();
  });
}

/* ---------- Attendance guards (geofence + face) ---------- */

export const OFFICE = { latitude: 12.9716, longitude: 77.5946, radiusMeters: 200 };

/* A deterministic, non-degenerate 128-d vector standing in for a face-api.js descriptor. */
export function syntheticDescriptor(seed = 0) {
  return Array.from({ length: 128 }, (_, i) => Math.sin(i / 7 + seed * 3.1) * 0.3 + 0.5);
}

/* Configure the office geofence and enroll a synthetic face for every staff member
   that holds an account, so self-marked attendance passes the mandatory guards. */
export async function prepareAttendanceGuards() {
  const { getPolicy, putPolicy } = await import('../src/services/policy.js');
  const policy = await getPolicy();
  await putPolicy({ ...policy, officeLatitude: OFFICE.latitude, officeLongitude: OFFICE.longitude, geofenceRadiusMeters: OFFICE.radiusMeters });

  const vectors = [syntheticDescriptor(0)];
  await query(
    'UPDATE staff SET face_embedding = $1, face_enrolled_at = now() WHERE face_embedding IS NULL',
    [JSON.stringify(vectors)],
  );
}

/* The fields a self-mark must carry to satisfy the geofence + face guards. */
export function guardFields() {
  return { latitude: OFFICE.latitude, longitude: OFFICE.longitude, faceDescriptor: syntheticDescriptor(0) };
}
