import { Router } from 'express';
import { one, rows, transaction } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { authenticate, requireRole, scopeStaff } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { shapeRecruit } from '../services/recruits.js';
import {
  ENTRY_STATUSES, canManage, funnelMap, loadSheet, logActivity, normalizeMobile, requireManage,
} from '../services/sheets.js';
import {
  sheetAssign, sheetConvert, sheetCreate, sheetEntryUpdate, sheetRowsAppend, sheetStatusUpdate,
} from '../validation/schemas.js';

const router = Router();

router.use(authenticate, scopeStaff);

/* Validate a requested recruiter list: everyone must exist, be active, and be inside the actor's scope. */
async function checkRecruiters(scope, recruiterIds) {
  const found = await rows(
    "SELECT id, name FROM staff WHERE id = ANY($1::uuid[]) AND id = ANY($2::uuid[]) AND active AND role = 'recruiter' ORDER BY name",
    [recruiterIds, scope],
  );
  if (found.length !== new Set(recruiterIds).size) {
    throw ApiError.forbidden('One of the selected recruiters is not available to you');
  }
  return found;
}

async function importRows(client, sheetId, inputRows, actor) {
  const seen = new Set();
  const invalid = [];
  const accepted = [];
  let inBatchDuplicates = 0;
  for (const item of inputRows) {
    const mobile = normalizeMobile(item.mobile);
    if (!mobile) {
      invalid.push({ name: item.name, mobile: item.mobile });
      continue;
    }
    if (seen.has(mobile)) {
      inBatchDuplicates += 1;
      continue;
    }
    seen.add(mobile);
    accepted.push({ ...item, mobile });
  }
  const inserted = [];
  for (const item of accepted) {
    const row = await client.query(
      `INSERT INTO sheet_row (sheet_id, name, mobile, detail) VALUES ($1, $2, $3, $4)
       ON CONFLICT (sheet_id, mobile) DO NOTHING RETURNING id`,
      [sheetId, item.name, item.mobile, item.detail || ''],
    );
    if (row.rows[0]) inserted.push(row.rows[0].id);
  }
  const duplicates = inBatchDuplicates + (accepted.length - inserted.length);
  if (inserted.length || duplicates) {
    await logActivity(client, {
      sheetId, actor, action: 'rows_imported',
      detail: `${inserted.length} contact${inserted.length === 1 ? '' : 's'} added${duplicates ? `, ${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped` : ''}`,
    });
  }
  return { inserted, invalid, duplicates };
}

/* Every recruiter already on the sheet gets a track for a new row. */
async function syncEntries(client, sheetId, rowIds) {
  if (!rowIds.length) return;
  await client.query(
    `INSERT INTO sheet_entry (row_id, recruiter_id)
     SELECT r.id, e.recruiter_id FROM sheet_row r
     CROSS JOIN (SELECT DISTINCT recruiter_id FROM sheet_entry WHERE row_id IN (
       SELECT id FROM sheet_row WHERE sheet_id = $1
     )) e
     WHERE r.id = ANY($2::uuid[])
     ON CONFLICT (row_id, recruiter_id) DO NOTHING`,
    [sheetId, rowIds],
  );
}

router.get('/', handler(async (req, res) => {
  const items = await rows(
    `SELECT s.*, c.name AS created_by_name,
        (SELECT count(*)::int FROM sheet_row r WHERE r.sheet_id = s.id) AS row_count,
        (SELECT count(*)::int FROM sheet_row r WHERE r.sheet_id = s.id AND r.recruit_id IS NOT NULL) AS joined_count,
        (SELECT count(DISTINCT e.recruiter_id)::int FROM sheet_entry e JOIN sheet_row r ON r.id = e.row_id
          WHERE r.sheet_id = s.id AND e.recruiter_id = ANY($1::uuid[])) AS recruiter_count
     FROM assignment_sheet s JOIN staff c ON c.id = s.created_by
     WHERE s.created_by = ANY($1::uuid[])
        OR EXISTS (SELECT 1 FROM sheet_entry e JOIN sheet_row r ON r.id = e.row_id
                   WHERE r.sheet_id = s.id AND e.recruiter_id = ANY($1::uuid[]))
     ORDER BY s.created_at DESC`,
    [req.scope],
  );
  const ids = items.map((s) => s.id);
  const funnels = ids.length
    ? await rows(
      `SELECT r.sheet_id, e.status, count(*)::int AS total
       FROM sheet_entry e JOIN sheet_row r ON r.id = e.row_id
       WHERE r.sheet_id = ANY($1::uuid[]) AND e.recruiter_id = ANY($2::uuid[])
       GROUP BY 1, 2`,
      [ids, req.scope],
    )
    : [];
  const mapped = items.map((sheet) => ({
    id: sheet.id,
    name: sheet.name,
    note: sheet.note,
    status: sheet.status,
    createdBy: sheet.created_by,
    createdByName: sheet.created_by_name,
    createdAt: sheet.created_at,
    rowCount: Number(sheet.row_count),
    joinedCount: Number(sheet.joined_count),
    recruiterCount: Number(sheet.recruiter_count),
    funnel: Object.fromEntries(ENTRY_STATUSES.map((s) => [s, 0])),
  }));
  for (const f of funnels) {
    const sheet = mapped.find((s) => s.id === f.sheet_id);
    if (sheet) sheet.funnel[f.status] = f.total;
  }
  res.json({ statuses: ENTRY_STATUSES, items: mapped });
}));

router.get('/assignable', handler(async (req, res) => {
  const items = await rows(
    `SELECT s.id, s.name, s.employee_code
       FROM staff s
       LEFT JOIN staff_account a ON a.staff_id = s.id
      WHERE s.active AND s.role = 'recruiter'
        AND NOT COALESCE(a.locked, false)
        AND (a.locked_until IS NULL OR a.locked_until <= now())
        AND s.id = ANY($1::uuid[])
      ORDER BY s.name`,
    [req.scope],
  );
  res.json({ items });
}));

/* The recruiter's calling queue: own entries across every sheet, newest sheets first, joined rows last. */
router.get('/my/entries', handler(async (req, res) => {
  const filters = ['e.recruiter_id = $1'];
  const params = [req.actor.id];
  const add = (clause, value) => {
    params.push(value);
    filters.push(clause.replace('?', `$${params.length}`));
  };
  if (req.query.status && ENTRY_STATUSES.includes(req.query.status)) add('e.status = ?', req.query.status);
  if (req.query.sheet) add('r.sheet_id::text = ?', req.query.sheet);
  const where = `WHERE ${filters.join(' AND ')}`;

  const items = await rows(
    `SELECT e.id AS entry_id, e.status, e.remarks, e.status_at, e.updated_at,
            r.id AS row_id, r.name, r.mobile, r.detail, r.recruit_id,
            rc.code AS recruit_code, j.name AS joined_by_name,
            s.id AS sheet_id, s.name AS sheet_name, s.status AS sheet_status
     FROM sheet_entry e JOIN sheet_row r ON r.id = e.row_id JOIN assignment_sheet s ON s.id = r.sheet_id
     LEFT JOIN recruit rc ON rc.id = r.recruit_id LEFT JOIN staff j ON j.id = r.joined_by
     ${where}
     ORDER BY (r.recruit_id IS NOT NULL), s.created_at DESC, e.status_at DESC`,
    params,
  );
  const counts = Object.fromEntries(ENTRY_STATUSES.map((s) => [s, 0]));
  for (const c of await rows(
    'SELECT status, count(*)::int AS total FROM sheet_entry WHERE recruiter_id = $1 GROUP BY status',
    [req.actor.id],
  )) counts[c.status] = c.total;
  res.json({
    items: items.map((row) => ({
      entryId: row.entry_id,
      status: row.status,
      remarks: row.remarks,
      statusAt: row.status_at,
      row: {
        id: row.row_id, name: row.name, mobile: row.mobile, detail: row.detail,
        recruitId: row.recruit_id, recruitCode: row.recruit_code, joinedBy: row.joined_by_name,
      },
      sheet: { id: row.sheet_id, name: row.sheet_name, status: row.sheet_status },
    })),
    counts,
  });
}));

router.post('/', requireRole('manager', 'hr_admin'), handler(async (req, res) => {
  const input = sheetCreate.parse(req.body);
  const recruiters = await checkRecruiters(req.scope, input.recruiterIds);
  const result = await transaction(async (client) => {
    const sheet = await client.query(
      'INSERT INTO assignment_sheet (name, note, created_by) VALUES ($1, $2, $3) RETURNING *',
      [input.name, input.note || '', req.actor.id],
    );
    const created = sheet.rows[0];
    await logActivity(client, { sheetId: created.id, actor: req.actor, action: 'sheet_created', detail: input.name });
    const imported = await importRows(client, created.id, input.rows, req.actor);
    if (imported.inserted.length === 0) throw ApiError.badRequest('None of the contacts had a valid mobile number');
    for (const recruiter of recruiters) {
      await client.query(
        `INSERT INTO sheet_entry (row_id, recruiter_id)
         SELECT id, $2::uuid FROM sheet_row WHERE sheet_id = $1
         ON CONFLICT (row_id, recruiter_id) DO NOTHING`,
        [created.id, recruiter.id],
      );
      await logActivity(client, { sheetId: created.id, actor: req.actor, action: 'assigned', detail: recruiter.name });
    }
    await writeAudit(client, { actor: req.actor, action: 'sheet_created', entity: 'assignment_sheet', entityId: created.id, after: { name: input.name, recruiters: recruiters.length } });
    return { created, imported };
  });
  res.status(201).json({
    item: { id: result.created.id, name: result.created.name },
    import: {
      accepted: result.imported.inserted.length,
      duplicates: result.imported.duplicates,
      invalid: result.imported.invalid,
    },
    message: `Sheet created with ${result.imported.inserted.length} contacts`,
  });
}));

router.get('/:id', handler(async (req, res) => {
  const sheet = await loadSheet(req.params.id, req.scope, req.actor);
  const rowsOut = await rows(
    `SELECT r.*, rc.code AS recruit_code, j.name AS joined_by_name
     FROM sheet_row r LEFT JOIN recruit rc ON rc.id = r.recruit_id LEFT JOIN staff j ON j.id = r.joined_by
     WHERE r.sheet_id = $1 ORDER BY r.created_at, r.name`,
    [sheet.id],
  );
  const entries = await rows(
    `SELECT e.*, su.name AS recruiter_name FROM sheet_entry e
     JOIN sheet_row r ON r.id = e.row_id JOIN staff su ON su.id = e.recruiter_id
     WHERE r.sheet_id = $1 AND e.recruiter_id = ANY($2::uuid[])
     ORDER BY su.name, e.status_at DESC`,
    [sheet.id, req.scope],
  );
  const byRow = {};
  for (const e of entries) (byRow[e.row_id] ||= []).push({
    entryId: e.id, recruiterId: e.recruiter_id, recruiterName: e.recruiter_name,
    status: e.status, remarks: e.remarks, statusAt: e.status_at,
  });
  const progress = await rows(
    `SELECT su.id, su.name, su.employee_code,
            count(*)::int AS total,
            count(*) FILTER (WHERE e.status = 'joined')::int AS joined,
            count(*) FILTER (WHERE e.status = 'interested')::int AS interested,
            count(*) FILTER (WHERE e.status = 'interviewed')::int AS interviewed,
            count(*) FILTER (WHERE e.status IN ('no_answer','wrong_number','not_interested'))::int AS dropped,
            count(*) FILTER (WHERE e.status = 'new')::int AS pending
     FROM sheet_entry e JOIN sheet_row r ON r.id = e.row_id JOIN staff su ON su.id = e.recruiter_id
     WHERE r.sheet_id = $1 AND e.recruiter_id = ANY($2::uuid[])
     GROUP BY su.id, su.name, su.employee_code ORDER BY su.name`,
    [sheet.id, req.scope],
  );
  const activity = await rows(
    `SELECT a.*, su.name AS recruiter_name FROM sheet_activity a
     LEFT JOIN sheet_row r ON r.id = a.row_id LEFT JOIN staff su ON su.id = a.actor_id
     WHERE a.sheet_id = $1 ORDER BY a.occurred_at DESC LIMIT 60`,
    [sheet.id],
  );
  res.json({
    item: {
      id: sheet.id, name: sheet.name, note: sheet.note, status: sheet.status,
      createdBy: sheet.created_by, createdByName: sheet.created_by_name, createdAt: sheet.created_at,
      rowCount: Number(sheet.row_count), joinedCount: Number(sheet.joined_count),
      canManage: await canManage(req.actor, sheet),
      funnel: await funnelMap(sheet.id, req.scope),
    },
    recruiters: progress,
    rows: rowsOut.map((r) => ({
      id: r.id, name: r.name, mobile: r.mobile, detail: r.detail,
      recruitId: r.recruit_id, recruitCode: r.recruit_code, joinedBy: r.joined_by_name, joinedAt: r.joined_at,
      entries: byRow[r.id] || [],
    })),
    activity: activity.map((a) => ({
      id: String(a.id), actorName: a.actor_name || a.recruiter_name || 'system', action: a.action,
      detail: a.detail, rowName: a.row_id ? (rowsOut.find((r) => r.id === a.row_id)?.name ?? '') : '',
      at: a.occurred_at,
    })),
  });
}));

router.post('/:id/rows', handler(async (req, res) => {
  const sheet = await loadSheet(req.params.id, req.scope, req.actor);
  await requireManage(req.actor, req.scope, sheet);
  const input = sheetRowsAppend.parse(req.body);
  const result = await transaction(async (client) => {
    const imported = await importRows(client, sheet.id, input.rows, req.actor);
    await syncEntries(client, sheet.id, imported.inserted);
    return imported;
  });
  res.json({
    accepted: result.inserted.length,
    duplicates: result.duplicates,
    invalid: result.invalid,
    message: `${result.inserted.length} contacts added`,
  });
}));

router.post('/:id/assign', handler(async (req, res) => {
  const sheet = await loadSheet(req.params.id, req.scope, req.actor);
  await requireManage(req.actor, req.scope, sheet);
  const input = sheetAssign.parse(req.body);
  const recruiters = await checkRecruiters(req.scope, input.recruiterIds);
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO sheet_entry (row_id, recruiter_id)
       SELECT r.id, x.recruiter_id FROM sheet_row r
       CROSS JOIN unnest($2::uuid[]) AS x(recruiter_id)
       WHERE r.sheet_id = $1
       ON CONFLICT (row_id, recruiter_id) DO NOTHING`,
      [sheet.id, input.recruiterIds],
    );
    for (const recruiter of recruiters) {
      await logActivity(client, { sheetId: sheet.id, actor: req.actor, action: 'assigned', detail: recruiter.name });
    }
    await writeAudit(client, { actor: req.actor, action: 'sheet_assigned', entity: 'assignment_sheet', entityId: sheet.id, after: { recruiters: input.recruiterIds } });
  });
  res.json({ message: `Assigned to ${recruiters.length} recruiter${recruiters.length === 1 ? '' : 's'}` });
}));

router.patch('/:id/status', handler(async (req, res) => {
  const sheet = await loadSheet(req.params.id, req.scope, req.actor);
  await requireManage(req.actor, req.scope, sheet);
  const input = sheetStatusUpdate.parse(req.body);
  await transaction(async (client) => {
    await client.query('UPDATE assignment_sheet SET status = $2 WHERE id = $1', [sheet.id, input.status]);
    await logActivity(client, { sheetId: sheet.id, actor: req.actor, action: input.status === 'closed' ? 'closed' : 'reopened', detail: input.status });
    await writeAudit(client, { actor: req.actor, action: 'sheet_status', entity: 'assignment_sheet', entityId: sheet.id, after: input });
  });
  res.json({ message: input.status === 'closed' ? 'Sheet closed' : 'Sheet reopened' });
}));

router.delete('/:id', requireRole('hr_admin'), handler(async (req, res) => {
  const sheet = await loadSheet(req.params.id, req.scope, req.actor);
  await transaction(async (client) => {
    await client.query('DELETE FROM assignment_sheet WHERE id = $1', [sheet.id]);
    await writeAudit(client, { actor: req.actor, action: 'sheet_deleted', entity: 'assignment_sheet', entityId: sheet.id, before: { name: sheet.name } });
  });
  res.json({ message: 'Sheet deleted' });
}));

/* One line per row × recruiter so the manager can hand the whole sheet out as a file. */
router.get('/:id/export.csv', handler(async (req, res) => {
  const sheet = await loadSheet(req.params.id, req.scope, req.actor);
  const items = await rows(
    `SELECT r.name, r.mobile, r.detail, su.name AS recruiter, e.status, e.remarks, e.status_at,
            rc.code AS recruit_code, j.name AS joined_by, r.joined_at
     FROM sheet_row r
     JOIN sheet_entry e ON e.row_id = r.id JOIN staff su ON su.id = e.recruiter_id
     LEFT JOIN recruit rc ON rc.id = r.recruit_id LEFT JOIN staff j ON j.id = r.joined_by
     WHERE r.sheet_id = $1 AND e.recruiter_id = ANY($2::uuid[])
     ORDER BY r.name, su.name`,
    [sheet.id, req.scope],
  );
  const columns = ['Contact', 'Mobile', 'Detail', 'Recruiter', 'Status', 'Remarks', 'Status on', 'Joined as', 'Joined by', 'Joined on'];
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.map(cell).join(',')];
  for (const row of items) {
    lines.push([
      row.name, row.mobile, row.detail, row.recruiter, row.status, row.remarks,
      new Date(row.status_at).toISOString(), row.recruit_code, row.joined_by,
      row.joined_at ? new Date(row.joined_at).toISOString() : '',
    ].map(cell).join(','));
  }
  const safe = sheet.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="sheet-${safe || sheet.id.slice(0, 8)}.csv"`);
  // Excel on Windows only reads UTF-8 correctly when the file opens with a BOM.
  res.send(`\uFEFF${lines.join('\r\n')}`);
}));

router.patch('/entries/:entryId', handler(async (req, res) => {
  const entry = await one(
    `SELECT e.*, r.sheet_id, r.recruit_id, r.name AS row_name, j.name AS joined_by_name
     FROM sheet_entry e JOIN sheet_row r ON r.id = e.row_id
     LEFT JOIN staff j ON j.id = r.joined_by
     WHERE e.id::text = $1`,
    [req.params.entryId],
  );
  if (!entry) throw ApiError.notFound('No such call entry');
  if (entry.recruiter_id !== req.actor.id) throw ApiError.forbidden('Only the recruiter this row is assigned to may update it');
  if (entry.recruit_id) throw ApiError.conflict(`This contact already joined as ${entry.joined_by_name ?? 'another recruiter'}'s recruit`);
  const input = sheetEntryUpdate.parse(req.body);
  await transaction(async (client) => {
    if (input.remarks !== undefined) await client.query('UPDATE sheet_entry SET remarks = $2 WHERE id = $1', [entry.id, input.remarks]);
    if (input.status !== undefined && input.status !== entry.status) {
      await client.query('UPDATE sheet_entry SET status = $2, status_at = now() WHERE id = $1', [entry.id, input.status]);
      await logActivity(client, {
        sheetId: entry.sheet_id, rowId: entry.row_id, actor: req.actor, action: 'status', detail: `${entry.row_name}: ${input.status}`,
      });
    } else if (input.remarks !== undefined) {
      await logActivity(client, {
        sheetId: entry.sheet_id, rowId: entry.row_id, actor: req.actor, action: 'remarks', detail: `${entry.row_name}: remarks updated`,
      });
    }
  });
  res.json({ message: 'Saved' });
}));

router.get('/rows/:rowId/history', handler(async (req, res) => {
  const row = await one('SELECT r.*, s.name AS sheet_name FROM sheet_row r JOIN assignment_sheet s ON s.id = r.sheet_id WHERE r.id::text = $1', [req.params.rowId]);
  if (!row) throw ApiError.notFound('No such contact');
  await loadSheet(row.sheet_id, req.scope, req.actor);
  const entries = await rows(
    `SELECT e.*, su.name AS recruiter_name FROM sheet_entry e JOIN staff su ON su.id = e.recruiter_id WHERE e.row_id = $1 ORDER BY su.name`,
    [row.id],
  );
  const activity = await rows('SELECT * FROM sheet_activity WHERE row_id = $1 ORDER BY occurred_at DESC LIMIT 80', [row.id]);
  res.json({
    item: { id: row.id, name: row.name, mobile: row.mobile, detail: row.detail, sheetName: row.sheet_name },
    entries: entries.map((e) => ({
      entryId: e.id, recruiterId: e.recruiter_id, recruiterName: e.recruiter_name,
      status: e.status, remarks: e.remarks, statusAt: e.status_at,
    })),
    activity: activity.map((a) => ({ actorName: a.actor_name, action: a.action, detail: a.detail, at: a.occurred_at })),
  });
}));

/* Marking a contact as joined is the only way into 'joined'; the row then belongs to the recruit list. */
router.post('/rows/:rowId/convert', handler(async (req, res) => {
  const input = sheetConvert.parse(req.body);
  const result = await transaction(async (client) => {
    const row = await client.query('SELECT * FROM sheet_row WHERE id::text = $1 FOR UPDATE', [req.params.rowId]);
    const contact = row.rows[0];
    if (!contact) throw ApiError.notFound('No such contact');
    const entry = await client.query('SELECT id FROM sheet_entry WHERE row_id = $1 AND recruiter_id = $2', [contact.id, req.actor.id]);
    if (!entry.rows[0]) throw ApiError.forbidden('This contact is not on your calling list');
    if (contact.recruit_id) {
      const existing = await client.query('SELECT code FROM recruit WHERE id = $1', [contact.recruit_id]);
      throw ApiError.conflict(`Already joined as ${existing.rows[0]?.code ?? 'a recruit'}`);
    }
    const mobile = normalizeMobile(contact.mobile) || contact.mobile;
    const dupe = await client.query(
      `SELECT id, code, name FROM recruit WHERE regexp_replace(COALESCE(mobile, ''), '[^0-9]', '', 'g') = $1`,
      [mobile],
    );
    let recruitId;
    let code;
    let linked = false;
    if (dupe.rows[0]) {
      recruitId = dupe.rows[0].id;
      code = dupe.rows[0].code;
      linked = true;
    } else {
      const generated = await client.query("SELECT 'RCT-' || nextval('recruit_code_seq') AS code");
      code = generated.rows[0].code;
      const inserted = await client.query(
        `INSERT INTO recruit (code, name, mobile, status, role, company, city, hub, hr_contact, doj, owner_id, remarks)
         VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [code, contact.name, mobile, input.role || '', input.company || '', input.city || '', input.hub || '',
          input.hrContact || '', input.doj || null, req.actor.id,
          [contact.detail, input.remarks].filter(Boolean).join(' · ')],
      );
      recruitId = inserted.rows[0].id;
    }
    await client.query('UPDATE sheet_row SET recruit_id = $2, joined_by = $3, joined_at = now() WHERE id = $1', [contact.id, recruitId, req.actor.id]);
    await client.query(`UPDATE sheet_entry SET status = 'joined', status_at = now() WHERE row_id = $1`, [contact.id]);
    await logActivity(client, {
      sheetId: contact.sheet_id, rowId: contact.id, actor: req.actor, action: 'joined',
      detail: `${contact.name} → ${code}${linked ? ' (existing recruit linked)' : ''}`,
    });
    await writeAudit(client, {
      actor: req.actor, action: linked ? 'recruit_linked_from_sheet' : 'recruit_created_from_sheet',
      entity: 'recruit', entityId: recruitId, after: { code, name: contact.name, sheetRow: contact.id },
    });
    return { recruitId, code, linked };
  });
  const recruitRow = await one(
    `SELECT r.*, o.name AS owner_name, o.employee_code AS owner_code FROM recruit r JOIN staff o ON o.id = r.owner_id WHERE r.id = $1`,
    [result.recruitId],
  );
  res.status(result.linked ? 200 : 201).json({
    item: shapeRecruit(recruitRow),
    linked: result.linked,
    message: result.linked ? `Already in the system — linked as ${result.code}` : `${result.code} added to recruits`,
  });
}));

export default router;
