import { one, pool, query, rows, transaction } from '../db.js';
import { ApiError } from '../errors.js';
import { hashPassword, passwordProblems, verifyPassword } from '../security/passwords.js';
import { hashToken, newRefreshToken, refreshExpiry } from '../security/tokens.js';
import { writeAudit } from './audit.js';
import { getPolicy } from './policy.js';

const BASE = `lower(a.login_id) AS login_id, a.password_hash, a.must_change, a.locked,
       a.failed_attempts, a.locked_until, a.last_login_at,
       s.id AS staff_id, s.name, s.role, s.employee_code, s.manager_id, s.active AS staff_active`;

export function findAccountByLogin(loginId) {
  return one(
    `SELECT ${BASE} FROM staff_account a JOIN staff s ON s.id = a.staff_id WHERE lower(a.login_id) = lower($1)`,
    [loginId],
  );
}

export function findAccountByStaff(staffId) {
  return one(`SELECT ${BASE} FROM staff_account a JOIN staff s ON s.id = a.staff_id WHERE a.staff_id = $1`, [staffId]);
}

/* A wrong password and a locked account never reveal which one happened. */
export async function assertCredential(account, plain, policy, req) {
  if (!account || account.staff_active === false) throw ApiError.unauthorized('Invalid login ID or password');
  if (account.locked) throw ApiError.forbidden('Account locked. Contact the HR Admin.');
  if (account.locked_until && new Date(account.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(account.locked_until) - Date.now()) / 60_000);
    throw ApiError.forbidden(`Invalid login ID or password. Account locked, try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }

  if (await verifyPassword(plain, account.password_hash)) {
    await query('UPDATE staff_account SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE staff_id = $1', [account.staff_id]);
    return;
  }

  const attempts = account.failed_attempts + 1;
  const lockout = attempts >= policy.maxFailedAttempts;
  await query(
    lockout
      ? `UPDATE staff_account SET failed_attempts = $2, locked_until = now() + make_interval(mins => $3::int) WHERE staff_id = $1`
      : 'UPDATE staff_account SET failed_attempts = $2 WHERE staff_id = $1',
    lockout ? [account.staff_id, attempts, policy.lockMinutes] : [account.staff_id, attempts],
  );
  await writeAudit(query, {
    actor: { id: account.staff_id, name: account.name },
    action: 'login_failed',
    entity: 'staff_account',
    entityId: account.staff_id,
    req,
  });
  throw ApiError.unauthorized(
    lockout ? `Invalid login ID or password. Account locked for ${policy.lockMinutes} minutes.` : 'Invalid login ID or password',
  );
}

export async function createRefreshSession(db, staffId, req, { actingId = null } = {}) {
  const token = newRefreshToken();
  const result = await db.query(
    `INSERT INTO refresh_session (staff_id, acting_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, expires_at`,
    [staffId, actingId, hashToken(token), refreshExpiry(), req?.ip ?? '', req?.get?.('user-agent') ?? ''],
  );
  return { id: result.rows[0].id, token, expires: result.rows[0].expires_at };
}

export async function readRefreshSession(token) {
  if (!token) return null;
  return one(
    `SELECT r.id, r.staff_id, r.acting_id, r.expires_at, r.revoked_at, s.active AS staff_active
     FROM refresh_session r JOIN staff s ON s.id = r.staff_id WHERE r.token_hash = $1`,
    [hashToken(token)],
  );
}

/* One refresh token is single use: the old row is marked revoked and points at its replacement. */
export async function rotateRefreshSession(oldId, staffId, req, { actingId = null } = {}) {
  return transaction(async (client) => {
    const session = await createRefreshSession(client, staffId, req, { actingId });
    await client.query('UPDATE refresh_session SET revoked_at = now(), replaced_by = $2 WHERE id = $1', [oldId, session.id]);
    return session;
  });
}

export function revokeRefreshToken(token) {
  if (!token) return Promise.resolve();
  return query('UPDATE refresh_session SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hashToken(token)]);
}

export async function revokeAllSessions(staffId, exceptId = null) {
  await query(
    exceptId
      ? 'UPDATE refresh_session SET revoked_at = now() WHERE staff_id = $1 AND revoked_at IS NULL AND id <> $2'
      : 'UPDATE refresh_session SET revoked_at = now() WHERE staff_id = $1 AND revoked_at IS NULL',
    exceptId ? [staffId, exceptId] : [staffId],
  );
}

export async function passwordReused(staffId, plain) {
  const keep = (await getPolicy()).passwordHistory;
  if (keep <= 0) return false;
  const past = await rows('SELECT password_hash FROM password_history WHERE staff_id = $1 ORDER BY created_at DESC LIMIT $2', [staffId, keep]);
  for (const row of past) {
    if (await verifyPassword(plain, row.password_hash)) return true;
  }
  return false;
}

export async function assertNewPasswordAllowed(plain, policy, staffId, currentPlain = '') {
  const problems = passwordProblems(plain, policy, currentPlain);
  if (problems.length) throw ApiError.badRequest(problems[0], { newPassword: problems.join('. ') });
  if (await passwordReused(staffId, plain)) throw ApiError.conflict('You have used this password recently. Choose a new one.');
}

/* Provisioning creates the row; every later change goes through setPassword. */
export async function createAccount(staffId, loginId, plain, { actor = null, req = null, client = null } = {}) {
  const hash = await hashPassword(plain);
  const db = client ?? pool;
  await db.query(
    `INSERT INTO staff_account (staff_id, login_id, password_hash, must_change, created_by)
     VALUES ($1, lower($2), $3, true, $4)`,
    [staffId, loginId, hash, actor?.id ?? null],
  );
  await writeAudit(db, {
    actor, action: 'account_provisioned', entity: 'staff_account', entityId: staffId, after: { loginId: loginId.toLowerCase() }, req,
  });
}

export async function setPassword(staffId, plain, { mustChange = false, actor = null, req = null, client = null } = {}) {
  const hash = await hashPassword(plain);
  const db = client ?? pool;
  const previous = await db.query('SELECT password_hash FROM staff_account WHERE staff_id = $1', [staffId]);
  const old = previous.rows[0]?.password_hash;
  await db.query(
    `UPDATE staff_account SET password_hash = $2, must_change = $3, password_updated_at = now(), failed_attempts = 0, locked_until = NULL
     WHERE staff_id = $1`,
    [staffId, hash, mustChange],
  );
  if (old) await db.query('INSERT INTO password_history (staff_id, password_hash) VALUES ($1, $2)', [staffId, old]);
  await writeAudit(db, {
    actor,
    action: mustChange ? 'password_admin_reset' : 'password_changed',
    entity: 'staff_account',
    entityId: staffId,
    after: { mustChange },
    req,
  });
  return hash;
}
