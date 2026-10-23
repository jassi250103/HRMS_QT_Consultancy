import express, { Router } from 'express';
import documents from './documents.js';
import { one, query, rows, transaction } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { authenticate, scopeStaff } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { canDecide, isAdmin, requireDecision, seesStaff } from '../services/scope.js';
import { recruitCreate, recruitUpdate } from '../validation/schemas.js';
import { assignOwner, recruitFilters, shapeRecruit } from '../services/recruits.js';

const router = Router();

router.use(authenticate, scopeStaff);

router.use('/:id/documents', express.raw({ type: () => true, limit: '6mb' }), documents);

async function loadRecruit(id, scope) {
  const row = await one(
    `SELECT r.*, o.name AS owner_name, o.employee_code AS owner_code, c.name AS closed_by_name
     FROM recruit r JOIN staff o ON o.id = r.owner_id LEFT JOIN staff c ON c.id = r.closed_by
     WHERE (r.id::text = $1 OR r.code = $1) AND r.owner_id = ANY($2::uuid[])`,
    [id, scope],
  );
  if (!row) throw ApiError.notFound('No such recruit');
  return row;
}

router.get('/', handler(async (req, res) => {
  const { where, params, countSql, pageSql } = recruitFilters(req.query, req.scope);
  const total = await one(countSql(where), params);
  const items = await rows(pageSql(where, req.query.sort), params);
  res.json({
    items: items.map((row) => shapeRecruit(row)),
    total: total.total,
    page: Math.max(1, Number.parseInt(req.query.page, 10) || 1),
    pageSize: Math.min(200, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25)),
  });
}));

/* Server-side CSV so a full filtered list never has to be paged through by the browser. */
router.get('/export.csv', handler(async (req, res) => {
  const { where, params, pageSql } = recruitFilters({ ...req.query, page: 1, pageSize: 100000 }, req.scope);
  const items = (await rows(pageSql(where, req.query.sort), params)).map(shapeRecruit);
  const columns = [
    ['code', 'Code'], ['name', 'Name'], ['gender', 'Gender'], ['dob', 'DOB'], ['mobile', 'Mobile'], ['email', 'Email'],
    ['status', 'Status'], ['role', 'Role'], ['company', 'Client company'], ['city', 'City'], ['hub', 'Hub'],
    ['hrContact', 'HR contact'], ['doj', 'Date of joining'], ['ownerName', 'Recruiter'], ['deactivationReason', 'Reason'],
    ['remarks', 'Remarks'], ['address', 'Address'],
  ];
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.map(([, label]) => cell(label)).join(',')];
  for (const item of items) lines.push(columns.map(([key]) => cell(item[key])).join(','));
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="recruits-${new Date().toISOString().slice(0, 10)}.csv"`);
  // Excel on Windows only reads UTF-8 correctly when the file opens with a BOM.
  res.send(`\uFEFF${lines.join('\r\n')}`);
}));

/* Join-from-call checks globally: a mobile may already belong to another recruiter's recruit. */
router.get('/exists', handler(async (req, res) => {
  const digits = String(req.query.mobile || '').replace(/\D/g, '');
  if (digits.length < 8) throw ApiError.badRequest('Enter a valid mobile number');
  const row = await one(
    `SELECT id, code, name FROM recruit WHERE regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g') = $1 LIMIT 1`,
    [digits],
  );
  res.json({ found: !!row, code: row ? row.code : null, id: row ? row.id : null, name: row ? row.name : null });
}));

router.get('/:id', handler(async (req, res) => {
  const row = await loadRecruit(req.params.id, req.scope);
  const docs = await rows('SELECT kind, file_name, size_bytes, content_type, uploaded_at FROM recruit_document WHERE recruit_id = $1', [row.id]);
  res.json({ item: { ...shapeRecruit(row), documents: Object.fromEntries(docs.map((d) => [d.kind, {
    name: d.file_name, size: Number(d.size_bytes), contentType: d.content_type, uploadedOn: d.uploaded_at,
  }])) } });
}));

router.post('/', handler(async (req, res) => {
  const input = recruitCreate.parse(req.body);
  const ownerId = await assignOwner(req.actor, req.scope, input.ownerId);
  const created = await transaction(async (client) => {
    // The company-assigned Recruiter ID is the main identifier; the RCT system reference is auto-filled by the column default.
    const code = input.code.trim();
    const existing = await client.query('SELECT id FROM recruit WHERE code = $1', [code]);
    if (existing.rows.length > 0) {
      throw ApiError.conflict(`Recruiter ID "${code}" is already assigned to another recruit.`);
    }

    const inserted = await client.query(
      `INSERT INTO recruit (code, name, gender, dob, mobile, email, address, status, role, company, city, hub,
              hr_contact, doj, owner_id, deactivation_reason, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [code, input.name, input.gender || '', input.dob || null, input.mobile || '', input.email || '',
        input.address || '', input.status || 'active', input.role || '', input.company || '', input.city || '',
        input.hub || '', input.hrContact || '', input.doj || null, ownerId, input.deactivationReason || '', input.remarks || ''],
    );
    const id = inserted.rows[0].id;
    await writeAudit(client, { actor: req.actor, action: 'recruit_created', entity: 'recruit', entityId: id, after: input });
    return id;
  });
  const row = await loadRecruit(created, req.scope);
  res.status(201).json({ item: shapeRecruit(row), message: 'Record saved' });
}));

router.patch('/:id', handler(async (req, res) => {
  const existing = await loadRecruit(req.params.id, req.scope);
  const input = recruitUpdate.parse(req.body);
  if (!(await canEdit(req.actor, existing))) throw ApiError.forbidden('This recruit belongs to another recruiter');

  const patch = {
    name: input.name, gender: input.gender, dob: input.dob, mobile: input.mobile, email: input.email,
    address: input.address, status: input.status, role: input.role, company: input.company, city: input.city,
    hub: input.hub, hr_contact: input.hrContact, doj: input.doj, deactivation_reason: input.deactivationReason,
    remarks: input.remarks,
  };
  if (input.ownerId && input.ownerId !== existing.owner_id) {
    if (!isAdmin(req.actor)) throw ApiError.forbidden('Only the HR Admin can move a recruit to another recruiter');
    patch.owner_id = input.ownerId;
  }
  // HR can correct the company Recruiter ID; enforce uniqueness against everyone else.
  const nextCode = input.code && input.code.trim();
  if (nextCode && nextCode !== existing.code) {
    const clash = await one('SELECT id FROM recruit WHERE code = $1 AND id <> $2', [nextCode, existing.id]);
    if (clash) throw ApiError.conflict(`Recruiter ID "${nextCode}" is already assigned to another recruit.`);
    patch.code = nextCode;
  }

  await transaction(async (client) => {
    for (const [column, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      await client.query(`UPDATE recruit SET ${column} = $2 WHERE id = $1`, [existing.id, value]);
    }
    if (patch.status === 'not_active' && existing.status === 'active') {
      await client.query('UPDATE recruit SET closed_by = $2, closed_at = now() WHERE id = $1', [existing.id, req.actor.id]);
    }
    if (patch.status === 'active') await client.query('UPDATE recruit SET closed_by = NULL, closed_at = NULL WHERE id = $1', [existing.id]);
    await writeAudit(client, { actor: req.actor, action: 'recruit_updated', entity: 'recruit', entityId: existing.id, before: existing, after: input });
  });

  const row = await loadRecruit(existing.id, req.scope);
  res.json({ item: shapeRecruit(row), message: 'Record saved' });
}));

/* The mandatory reason is enforced here in words and again by a database CHECK, so no path can skip it. */
router.post('/:id/deactivate', handler(async (req, res) => {
  const existing = await loadRecruit(req.params.id, req.scope);
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw ApiError.badRequest('Reason required', { reason: 'Reason required' });
  if (!(await canEdit(req.actor, existing))) throw ApiError.forbidden('This recruit belongs to another recruiter');

  await transaction(async (client) => {
    await client.query(
      `UPDATE recruit SET status = 'not_active', deactivation_reason = $2, closed_by = $3, closed_at = now() WHERE id = $1`,
      [existing.id, reason, req.actor.id],
    );
    await writeAudit(client, {
      actor: req.actor, action: 'recruit_deactivated', entity: 'recruit', entityId: existing.id,
      before: { status: existing.status, reason: existing.deactivation_reason }, after: { status: 'not_active', reason },
    });
  });
  res.json({ item: shapeRecruit(await loadRecruit(existing.id, req.scope)), message: 'Record saved' });
}));

router.post('/:id/activate', handler(async (req, res) => {
  const existing = await loadRecruit(req.params.id, req.scope);
  const allowed = req.actor.id === existing.owner_id || isAdmin(req.actor) || (await canDecide(req.actor, existing.owner_id));
  requireDecision(req.actor, existing.owner_id, allowed);

  await transaction(async (client) => {
    await client.query(`UPDATE recruit SET status = 'active', deactivation_reason = '', closed_by = NULL, closed_at = NULL WHERE id = $1`, [existing.id]);
    await writeAudit(client, {
      actor: req.actor, action: 'recruit_reactivated', entity: 'recruit', entityId: existing.id,
      before: { status: existing.status, reason: existing.deactivation_reason }, after: { status: 'active' },
    });
  });
  res.json({ item: shapeRecruit(await loadRecruit(existing.id, req.scope)), message: 'Record saved' });
}));

async function canEdit(actor, recruit) {
  return recruit.owner_id === actor.id || isAdmin(actor) || seesStaff(actor, recruit.owner_id);
}

export default router;
