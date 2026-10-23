import { ApiError, handler } from '../errors.js';
import { verifyAccess } from '../security/tokens.js';
import { isAdmin, loadActor, visibleStaffIds } from '../services/scope.js';

const bearer = (req) => {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

export const authenticate = handler(async (req, _res, next) => {
  const token = bearer(req);
  if (!token) throw ApiError.unauthorized();
  let payload;
  try {
    payload = await verifyAccess(token);
  } catch {
    throw ApiError.unauthorized('Session expired. Sign in again.');
  }
  req.actor = await loadActor(payload.sub);
  next();
});

export function requireRole(...roles) {
  const wanted = roles.flat();
  return (req, _res, next) => {
    if (!wanted.includes(req.actor.role)) return next(ApiError.forbidden('Not allowed for your role'));
    return next();
  };
}

export const requireAdmin = requireRole('hr_admin');

/* List endpoints filter by this: own rows for a recruiter, the line below for a manager, all for an admin. */
export const scopeStaff = handler(async (req, _res, next) => {
  req.scope = await visibleStaffIds(req.actor);
  next();
});

export function clientIp(req) {
  const forwarded = req.get('x-forwarded-for');
  return (forwarded ? forwarded.split(',')[0].trim() : req.ip) || '';
}

export { isAdmin };
