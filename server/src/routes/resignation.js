import { Router } from 'express';
import { one, query, rows } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { authenticate, scopeStaff } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { canDecide, decisionSignature, requireDecision, seesStaff } from '../services/scope.js';
import { getPolicy } from '../services/policy.js';
import { resignationDecision, resignationFile } from '../validation/schemas.js';

const router = Router();
router.use(authenticate, scopeStaff);

const SELECT = `
  SELECT r.*, s.name AS staff_name, s.employee_code, d.name AS decided_by_name
    FROM resignation r
    JOIN staff s ON s.id = r.staff_id
    LEFT JOIN staff d ON d.id = r.decided_by`;

const shape = (row) => ({
  id: row.id,
  staffId: row.staff_id,
  staffName: row.staff_name,
  employeeCode: row.employee_code,
  reason: row.reason,
  noticeDate: row.notice_date,
  requestedLastDay: row.requested_last_day,
  lastDay: row.last_day,
  status: row.status,
  filedAt: row.filed_at,
  decidedBy: row.decided_by_name,
  decidedAt: row.decided_at,
  remarks: row.remarks,
});

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000);

router.get('/', handler(async (req, res) => {
  const staffId = req.query.staffId;
  if (staffId && !(await seesStaff(req.actor, staffId))) throw ApiError.forbidden('Outside your scope');
  const ids = staffId ? [staffId] : req.scope;
  const items = await rows(`${SELECT} WHERE r.staff_id = ANY($1::uuid[]) ORDER BY r.filed_at DESC`, [ids]);
  res.json({ items: items.map(shape) });
}));

router.get('/pending', handler(async (req, res) => {
  const items = await rows(
    `${SELECT} JOIN staff_descendants($1) line ON line.staff_id = r.staff_id
     WHERE r.status IN ('filed', 'notice_accepted') ORDER BY r.filed_at DESC`,
    [req.actor.id],
  );
  res.json({ items: items.map(shape) });
}));

/* Filing is allowed whatever the dates say — the portal blocks the acceptance, not the paperwork. */
router.post('/', handler(async (req, res) => {
  const input = resignationFile.parse(req.body);
  const staffId = input.staffId || req.actor.id;
  if (staffId !== req.actor.id) requireDecision(req.actor, staffId, await canDecide(req.actor, staffId));

  const open = await one(
    `SELECT id FROM resignation WHERE staff_id = $1 AND status IN ('filed', 'notice_accepted', 'accepted')`,
    [staffId],
  );
  if (open) throw ApiError.conflict('A resignation is already on file for this person');

  const row = await one(
    `INSERT INTO resignation (staff_id, reason, notice_date, requested_last_day, remarks) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [staffId, input.reason, input.noticeDate, input.requestedLastDay, input.remarks || ''],
  );
  await writeAudit(query, { actor: req.actor, action: 'resignation_filed', entity: 'resignation', entityId: row.id, after: row, req });

  const full = await one(`${SELECT} WHERE r.id = $1`, [row.id]);
  res.status(201).json({ item: shape(full), message: 'Resignation filed' });
}));

router.post('/:id/withdraw', handler(async (req, res) => {
  const target = await one('SELECT * FROM resignation WHERE id = $1', [req.params.id]);
  if (!target) throw ApiError.notFound('No such resignation');
  if (target.staff_id !== req.actor.id) throw ApiError.forbidden('Only the person who filed it can withdraw it');
  if (!['filed', 'notice_accepted'].includes(target.status)) throw ApiError.conflict('This resignation can no longer be withdrawn');

  const row = await one(`UPDATE resignation SET status = 'withdrawn', decided_by = $2, decided_at = now() WHERE id = $1 RETURNING *`, [req.params.id, req.actor.id]);
  await writeAudit(query, {
    actor: req.actor, action: 'resignation_withdrawn', entity: 'resignation', entityId: row.id,
    before: { status: target.status }, after: { status: 'withdrawn' }, req,
  });
  res.json({ item: shape(await one(`${SELECT} WHERE r.id = $1`, [row.id])), message: 'Resignation withdrawn' });
}));

router.post('/:id/decision', handler(async (req, res) => {
  const input = resignationDecision.parse(req.body);
  const policy = await getPolicy();
  const target = await one('SELECT r.*, s.manager_id FROM resignation r JOIN staff s ON s.id = r.staff_id WHERE r.id = $1', [req.params.id]);
  if (!target) throw ApiError.notFound('No such resignation');
  requireDecision(req.actor, target.staff_id, await canDecide(req.actor, target.staff_id));
  if (!['filed', 'notice_accepted'].includes(target.status)) throw ApiError.conflict('This resignation is already closed');

  if (input.decision === 'accepted' && target.status !== 'notice_accepted') {
    throw ApiError.badRequest('Accept the notice period before approving the last working day');
  }
  if (input.decision === 'accepted') {
    const lastDay = input.lastDay || target.requested_last_day;
    if (daysBetween(target.notice_date, lastDay) < policy.noticeDays) {
      throw ApiError.badRequest(`The requested last day gives less than ${policy.noticeDays} days of notice`);
    }
  }

  const status = input.decision;
  const row = await one(
    `UPDATE resignation SET status = $2, last_day = $3, decided_by = $4, decided_at = now(), remarks = $5 WHERE id = $1 RETURNING *`,
    [req.params.id, status, status === 'accepted' ? (input.lastDay || target.requested_last_day) : target.last_day, req.actor.id, input.remarks || ''],
  );
  await writeAudit(query, {
    actor: req.actor, action: `resignation_${status}`, entity: 'resignation', entityId: row.id,
    before: { status: target.status }, after: { status, lastDay: row.last_day }, req,
  });

  const full = await one(`${SELECT} WHERE r.id = $1`, [row.id]);
  res.json({ item: { ...shape(full), signature: decisionSignature(req.actor) }, message: `Resignation ${status.replace('_', ' ')}` });
}));

export default router;
