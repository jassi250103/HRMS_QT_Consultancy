import { one, rows } from '../db.js';
import { ApiError } from '../errors.js';

export const ROLES = ['recruiter', 'manager', 'hr_admin'];
export const ROLE_LABELS = { recruiter: 'Recruiter', manager: 'Manager', hr_admin: 'HR Admin' };

export const isAdmin = (actor) => actor.role === 'hr_admin';
export const isManager = (actor) => actor.role === 'manager';

export async function loadActor(staffId) {
  const actor = await one(
    'SELECT id, name, role, employee_code, manager_id FROM staff WHERE id = $1 AND active',
    [staffId],
  );
  if (!actor) throw ApiError.unauthorized('This session is no longer valid');
  return actor;
}

/* The slice of the workforce a person may read: own rows, the line below them, or everything. */
export async function visibleStaffIds(actor) {
  if (isAdmin(actor)) return (await rows('SELECT id FROM staff')).map((r) => r.id);
  if (!isManager(actor)) return [actor.id];
  return (await rows('SELECT staff_id AS id FROM staff_descendants($1)', [actor.id])).map((r) => r.id);
}

export async function seesStaff(actor, staffId) {
  if (staffId === actor.id || isAdmin(actor)) return true;
  if (!isManager(actor)) return false;
  const hit = await one('SELECT 1 FROM staff_descendants($1) WHERE staff_id = $2', [actor.id, staffId]);
  return !!hit;
}

/* Only the direct manager decides for someone, and nobody decides their own requests. */
export async function canDecide(actor, targetId) {
  if (targetId === actor.id) return false;
  if (isAdmin(actor)) return true;
  const target = await one('SELECT manager_id FROM staff WHERE id = $1', [targetId]);
  return !!target && target.manager_id === actor.id;
}

export function decisionSignature(actor) {
  return isAdmin(actor) ? `${actor.name} · override` : actor.name;
}

export function requireDecision(actor, targetId, allowed) {
  if (allowed) return;
  throw ApiError.forbidden(
    targetId === actor.id ? 'You cannot decide your own request' : 'Only the direct manager or the HR Admin may decide',
  );
}
