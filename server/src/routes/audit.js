import { Router } from 'express';
import { rows } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireAdmin);

/* The audit trail is append-only and readable by the HR Admin alone. */
router.get('/', handler(async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  const params = [limit, offset];
  const parts = [];
  if (req.query.entity) { params.push(req.query.entity); parts.push(`entity = $${params.length}`); }
  if (req.query.action) { params.push(`%${req.query.action}%`); parts.push(`action LIKE $${params.length}`); }
  if (req.query.actor) { params.push(`%${req.query.actor}%`); parts.push(`actor_name ILIKE $${params.length}`); }

  const items = await rows(
    `SELECT id, occurred_at, actor_name, action, entity, entity_id, before_data, after_data, ip
       FROM audit_log ${parts.length ? `WHERE ${parts.join(' AND ')}` : ''}
      ORDER BY occurred_at DESC, id DESC LIMIT $1 OFFSET $2`,
    params,
  );
  res.json({
    items: items.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      actorName: row.actor_name,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      before: row.before_data,
      after: row.after_data,
      ip: row.ip,
    })),
  });
}));

export default router;
