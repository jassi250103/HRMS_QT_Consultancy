import { Router } from 'express';
import { one, query, rows } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { authenticate, scopeStaff } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { canDecide, decisionSignature, requireDecision, seesStaff } from '../services/scope.js';
import { decision as decisionSchema, leaveApply } from '../validation/schemas.js';
import { expirePendingLeaves } from '../services/leaveAutoExpire.js';

const router = Router();
router.use(authenticate, scopeStaff);

const SELECT = `
  SELECT l.*, s.name AS staff_name, s.employee_code, a.name AS decided_by_name
    FROM leave_request l
    JOIN staff s ON s.id = l.staff_id
    LEFT JOIN staff a ON a.id = l.decided_by`;

const shape = (row) => ({
  id: row.id,
  staffId: row.staff_id,
  staffName: row.staff_name,
  employeeCode: row.employee_code,
  leaveDate: row.leave_date,
  reason: row.reason,
  status: row.status,
  appliedAt: row.applied_at,
  decidedBy: row.decided_by_name,
  decidedAt: row.decided_at,
  remarks: row.remarks,
});

router.get('/', handler(async (req, res) => {
  const staffId = req.query.staffId;
  if (staffId && !(await seesStaff(req.actor, staffId))) throw ApiError.forbidden('Outside your scope');
  const ids = staffId ? [staffId] : req.scope;
  const items = await rows(`${SELECT} WHERE l.staff_id = ANY($1::uuid[]) ORDER BY l.leave_date DESC`, [ids]);
  res.json({ items: items.map(shape) });
}));

router.get('/pending', handler(async (req, res) => {
  // Auto-expire pending leaves before returning
  await expirePendingLeaves();
  
  const items = await rows(
    `${SELECT} JOIN staff_descendants($1) line ON line.staff_id = l.staff_id WHERE l.status = 'applied' ORDER BY l.leave_date DESC`,
    [req.actor.id],
  );
  res.json({ items: items.map(shape) });
}));

router.post('/', handler(async (req, res) => {
  const input = leaveApply.parse(req.body);
  const staffId = input.staffId || req.actor.id;
  if (staffId !== req.actor.id) requireDecision(req.actor, staffId, await canDecide(req.actor, staffId));

  const row = await one(
    `INSERT INTO leave_request (staff_id, leave_date, reason, remarks) VALUES ($1, $2, $3, $4) RETURNING *`,
    [staffId, input.leaveDate, input.reason, input.remarks || ''],
  );
  await writeAudit(query, { actor: req.actor, action: 'leave_applied', entity: 'leave_request', entityId: row.id, after: row, req });

  const full = await one(`${SELECT} WHERE l.id = $1`, [row.id]);
  res.status(201).json({ item: shape(full), message: 'Application submitted' });
}));

router.post('/:id/decision', handler(async (req, res) => {
  const { decision, remarks } = decisionSchema.parse(req.body);
  const target = await one('SELECT l.*, s.manager_id FROM leave_request l JOIN staff s ON s.id = l.staff_id WHERE l.id = $1', [req.params.id]);
  if (!target) throw ApiError.notFound('No such leave application');
  if (target.status !== 'applied') throw ApiError.conflict('This application is already decided');
  requireDecision(req.actor, target.staff_id, await canDecide(req.actor, target.staff_id));

  const row = await one(
    `UPDATE leave_request SET status = $2, decided_by = $3, decided_at = now(), remarks = $4 WHERE id = $1 RETURNING *`,
    [req.params.id, decision === 'accepted' ? 'accepted' : 'rejected', req.actor.id, remarks || ''],
  );
  await writeAudit(query, {
    actor: req.actor, action: `leave_${decision}`, entity: 'leave_request', entityId: row.id,
    before: { status: target.status }, after: { status: row.status, remarks }, req,
  });

  const full = await one(`${SELECT} WHERE l.id = $1`, [row.id]);
  res.json({ item: { ...shape(full), signature: decisionSignature(req.actor) }, message: `Application ${decision}` });
}));

export default router;
