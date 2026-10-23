import { Router } from 'express';
import { config } from '../config.js';
import { pool } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  assertCredential, assertNewPasswordAllowed, createRefreshSession, findAccountByLogin,
  findAccountByStaff, readRefreshSession, revokeAllSessions, revokeRefreshToken, rotateRefreshSession, setPassword,
} from '../services/accounts.js';
import { getPolicy } from '../services/policy.js';
import { ROLE_LABELS } from '../services/scope.js';
import { REFRESH_COOKIE, refreshCookieOptions, signAccess } from '../security/tokens.js';
import { login as loginSchema, passwordChange } from '../validation/schemas.js';

const router = Router();

const sessionPayload = (account) => ({
  id: account.staff_id,
  name: account.name,
  role: account.role,
  roleLabel: ROLE_LABELS[account.role],
  employeeCode: account.employee_code,
  loginId: account.login_id,
  mustChange: account.must_change,
});

async function issue(req, res, account, status = 200) {
  const session = await createRefreshSession(pool, account.staff_id, req);
  res.cookie(REFRESH_COOKIE, session.token, refreshCookieOptions());
  return res.status(status).json({
    token: await signAccess({ id: account.staff_id, name: account.name, role: account.role }),
    actor: sessionPayload(account),
  });
}

const loginGuard = rateLimit({ windowMs: 60_000, max: config.loginRateMax, keyOf: (req) => `${req.ip}:${req.body?.loginId || ''}` });

router.post('/login', loginGuard, handler(async (req, res) => {
  const { loginId, password } = loginSchema.parse(req.body);
  const policy = await getPolicy();
  const account = await findAccountByLogin(loginId);
  await assertCredential(account, password, policy, req);
  return issue(req, res, account);
}));

router.post('/refresh', handler(async (req, res) => {
  const stored = req.cookies?.[REFRESH_COOKIE];
  const session = await readRefreshSession(stored);
  if (!session || session.revoked_at || new Date(session.expires_at) <= new Date() || !session.staff_active) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    throw ApiError.unauthorized('Session expired. Sign in again.');
  }
  const rotated = await rotateRefreshSession(session.id, session.staff_id, req);
  res.cookie(REFRESH_COOKIE, rotated.token, refreshCookieOptions());
  const account = await findAccountByStaff(session.staff_id);
  if (!account) throw ApiError.unauthorized('Session expired. Sign in again.');
  return res.json({
    token: await signAccess({ id: account.staff_id, name: account.name, role: account.role }),
    actor: sessionPayload(account),
  });
}));

router.post('/logout', handler(async (req, res) => {
  await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  return res.status(204).end();
}));

router.get('/me', authenticate, handler(async (req, res) => {
  const account = await findAccountByStaff(req.actor.id);
  if (!account) throw ApiError.unauthorized('This account is no longer provisioned');
  return res.json({
    actor: sessionPayload(account),
  });
}));

/* Changing your own password keeps the current device signed in and logs the others out. */
router.post('/change-password', authenticate, handler(async (req, res) => {
  const { currentPassword, newPassword } = passwordChange.parse(req.body);
  const policy = await getPolicy();
  const account = await findAccountByStaff(req.actor.id);
  if (!account) throw ApiError.unauthorized('This account is no longer provisioned');
  await assertCredential({ ...account, staff_active: true }, currentPassword, policy, req);
  await assertNewPasswordAllowed(newPassword, policy, req.actor.id, currentPassword);

  const stored = req.cookies?.[REFRESH_COOKIE];
  const current = await readRefreshSession(stored);
  await setPassword(req.actor.id, newPassword, { mustChange: false, actor: req.actor, req });
  await revokeAllSessions(req.actor.id, current?.id ?? null);

  return res.json({ message: 'Password updated', actor: { ...sessionPayload(account), mustChange: false } });
}));

export default router;
