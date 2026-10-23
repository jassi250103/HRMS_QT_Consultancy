import { Router } from 'express';
import { one, query, rows } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { authenticate, requireAdmin, scopeStaff } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { getPolicy } from '../services/policy.js';
import { targetSet } from '../validation/schemas.js';

const router = Router();
router.use(authenticate, scopeStaff);

const monthRange = (month) => {
  const [year, num] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = `${String(year + Math.floor(num / 12)).padStart(4, '0')}-${String((num % 12) + 1).padStart(2, '0')}-01`;
  return [start, end];
};

const ACHIEVED = `
  SELECT o.id AS staff_id, count(r.id)::int AS achieved
    FROM staff o LEFT JOIN recruit r ON r.owner_id = o.id AND r.doj >= $1 AND r.doj < $2
   GROUP BY o.id`;

/* Managers and the HR Admin see sums of the line below them; those sums are computed, never stored. */
router.get('/', handler(async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const [start, end] = monthRange(month);
  const policy = await getPolicy();

  const people = await rows(
    `SELECT s.id, s.name, s.role, s.employee_code, COALESCE(t.target, $3)::int AS target
       FROM staff s LEFT JOIN placement_target t ON t.staff_id = s.id AND t.month = $1
      WHERE s.active AND s.role = 'recruiter' AND s.id = ANY($2::uuid[]) ORDER BY s.name`,
    [month, req.scope, policy.targetDefault],
  );
  const achieved = await rows(ACHIEVED, [start, end]);
  const byStaff = new Map(achieved.map((row) => [row.staff_id, row.achieved]));

  const items = people.map((row) => ({
    staffId: row.id,
    name: row.name,
    role: row.role,
    employeeCode: row.employee_code,
    target: row.target,
    achieved: byStaff.get(row.id) || 0,
    assigned: row.target !== policy.targetDefault,
  }));

  const mine = items.filter((row) => row.staffId === req.actor.id);
  const team = items.filter((row) => row.staffId !== req.actor.id);
  res.json({
    month,
    items,
    self: mine[0] || { staffId: req.actor.id, target: policy.targetDefault, achieved: byStaff.get(req.actor.id) || 0 },
    rollup: {
      target: items.reduce((sum, row) => sum + row.target, 0),
      achieved: items.reduce((sum, row) => sum + row.achieved, 0),
      members: items.length,
    },
    team: team,
  });
}));

router.put('/', requireAdmin, handler(async (req, res) => {
  const input = targetSet.parse(req.body);
  const staff = await one("SELECT id, name, role FROM staff WHERE id = $1 AND active AND role = 'recruiter'", [input.staffId]);
  if (!staff) throw ApiError.notFound('Targets are assigned to recruiters only');

  const [start, end] = monthRange(input.month);
  const row = await one(
    `INSERT INTO placement_target (staff_id, month, target, assigned_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (staff_id, month) DO UPDATE SET target = EXCLUDED.target, assigned_by = EXCLUDED.assigned_by
     RETURNING *`,
    [staff.id, input.month, input.target, req.actor.id],
  );
  const achieved = await one('SELECT count(*)::int AS achieved FROM recruit WHERE owner_id = $1 AND doj >= $2 AND doj < $3', [staff.id, start, end]);
  await writeAudit(query, {
    actor: req.actor, action: 'target_assigned', entity: 'placement_target', entityId: `${staff.id}:${input.month}`,
    after: { target: row.target, month: input.month }, req,
  });
  res.json({ item: { staffId: staff.id, name: staff.name, month: input.month, target: row.target, achieved: achieved.achieved }, message: 'Target saved' });
}));

export default router;
