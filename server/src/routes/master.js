import { Router } from 'express';
import { one, query, rows, transaction } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { masterCreate, masterRename, masterRetire } from '../validation/schemas.js';

const router = Router();
router.use(authenticate);

/* Values in use are retired, never deleted, so historic records keep their meaning. */
const USAGE = {
  companies: 'SELECT count(*)::int AS n FROM recruit WHERE company = $1',
  roles: 'SELECT count(*)::int AS n FROM recruit WHERE role = $1',
  cities: 'SELECT count(*)::int AS n FROM recruit WHERE city = $1',
  hubs: 'SELECT count(*)::int AS n FROM recruit WHERE hub = $1',
  hrs: 'SELECT count(*)::int AS n FROM recruit WHERE hr_contact = $1',
  deactivation_reasons: "SELECT count(*)::int AS n FROM recruit WHERE status = 'not_active' AND deactivation_reason = $1",
  leave_reasons: 'SELECT count(*)::int AS n FROM leave_request WHERE reason = $1',
  resignation_reasons: 'SELECT count(*)::int AS n FROM resignation WHERE reason = $1',
};

const CASCADE = {
  companies: ['UPDATE recruit SET company = $2 WHERE company = $1'],
  roles: ['UPDATE recruit SET role = $2 WHERE role = $1'],
  cities: ['UPDATE recruit SET city = $2 WHERE city = $1'],
  hubs: ['UPDATE recruit SET hub = $2 WHERE hub = $1'],
  hrs: ['UPDATE recruit SET hr_contact = $2 WHERE hr_contact = $1'],
  deactivation_reasons: ["UPDATE recruit SET deactivation_reason = $2 WHERE status = 'not_active' AND deactivation_reason = $1"],
  leave_reasons: ['UPDATE leave_request SET reason = $2 WHERE reason = $1'],
  resignation_reasons: ['UPDATE resignation SET reason = $2 WHERE reason = $1'],
};

async function entries(kind) {
  const list = await rows(
    'SELECT id, kind, value, active, created_at, retired_at FROM master_item WHERE kind = $1 ORDER BY value',
    [kind],
  );
  const withUse = [];
  for (const row of list) {
    const hit = await one(USAGE[row.kind], [row.value]);
    withUse.push({ id: row.id, kind: row.kind, value: row.value, active: row.active, useCount: hit ? hit.n : 0 });
  }
  return withUse;
}

router.get('/', handler(async (req, res) => {
  const kinds = Object.keys(USAGE);
  const all = {};
  for (const kind of kinds) all[kind] = await entries(kind);
  res.json({ kinds, items: all });
}));

/* The picklists the portal offers are the active values only. */
router.get('/active', handler(async (req, res) => {
  const list = await rows('SELECT kind, value FROM master_item WHERE active ORDER BY kind, value');
  const out = {};
  for (const row of list) (out[row.kind] ||= []).push(row.value);
  res.json(out);
}));

router.post('/', requireAdmin, handler(async (req, res) => {
  const input = masterCreate.parse(req.body);
  const row = await one(
    `INSERT INTO master_item (kind, value) VALUES ($1, $2) RETURNING id, kind, value, active`,
    [input.kind, input.value],
  );
  await writeAudit(query, { actor: req.actor, action: 'master_added', entity: 'master_item', entityId: row.id, after: row, req });
  res.status(201).json({ item: { ...row, useCount: 0 }, message: 'Record saved' });
}));

router.patch('/:id', requireAdmin, handler(async (req, res) => {
  const { value } = masterRename.parse(req.body);
  const existing = await one('SELECT * FROM master_item WHERE id = $1', [req.params.id]);
  if (!existing) throw ApiError.notFound('No such master value');
  if (existing.value === value) return res.json({ item: existing, message: 'No change saved' });

  const statements = CASCADE[existing.kind];
  if (!statements) throw ApiError.badRequest('Unknown master data list');
  const row = await transaction(async (client) => {
    for (const text of statements) await client.query(text, [existing.value, value]);
    const updated = await client.query('UPDATE master_item SET value = $2 WHERE id = $1 RETURNING *', [req.params.id, value]);
    await writeAudit(client, {
      actor: req.actor, action: 'master_renamed', entity: 'master_item', entityId: req.params.id,
      before: { value: existing.value }, after: { value }, req,
    });
    return updated.rows[0];
  });
  res.json({ item: row, message: 'Record saved' });
}));

router.post('/:id/status', requireAdmin, handler(async (req, res) => {
  const { active } = masterRetire.parse(req.body);
  const existing = await one('SELECT * FROM master_item WHERE id = $1', [req.params.id]);
  if (!existing) throw ApiError.notFound('No such master value');
  const row = await one(
    'UPDATE master_item SET active = $2, retired_at = CASE WHEN $2 THEN NULL ELSE now() END WHERE id = $1 RETURNING *',
    [req.params.id, active],
  );
  await writeAudit(query, {
    actor: req.actor, action: active ? 'master_reactivated' : 'master_retired', entity: 'master_item', entityId: row.id,
    before: { active: existing.active }, after: { active: row.active }, req,
  });
  res.json({ item: row, message: active ? 'Value is active again' : 'Value retired' });
}));

/* A value leaves the list only while no record points at it; anything in use is retired instead. */
router.delete('/:id', requireAdmin, handler(async (req, res) => {
  const existing = await one('SELECT * FROM master_item WHERE id = $1', [req.params.id]);
  if (!existing) throw ApiError.notFound('No such master value');
  const hit = await one(USAGE[existing.kind], [existing.value]);
  const inUse = hit ? hit.n : 0;
  if (inUse) throw ApiError.conflict(`${inUse} record${inUse === 1 ? '' : 's'} still use this value`);

  await transaction(async (client) => {
    await client.query('DELETE FROM master_item WHERE id = $1', [req.params.id]);
    await writeAudit(client, {
      actor: req.actor, action: 'master_deleted', entity: 'master_item', entityId: req.params.id,
      before: { kind: existing.kind, value: existing.value }, req,
    });
  });
  res.json({ message: 'Value deleted' });
}));

export default router;
