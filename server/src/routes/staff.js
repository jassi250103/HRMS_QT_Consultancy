import express, { Router } from 'express';
import { one, query, rows, transaction } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { findAccountByStaff, createAccount, setPassword } from '../services/accounts.js';
import { generateTempPassword, loginIdFor } from '../security/passwords.js';
import { isAdmin, ROLE_LABELS, seesStaff } from '../services/scope.js';
import { getPolicy } from '../services/policy.js';
import { provision as provisionSchema, staffCreate, staffUpdate } from '../validation/schemas.js';
import staffDocuments from './staff-documents.js';

const router = Router();

router.use('/:id/documents', authenticate, requireAdmin, express.raw({ type: () => true, limit: '6mb' }), staffDocuments);

const LIST_SQL = `
  SELECT s.id, s.employee_code, s.name, s.designation, s.role, s.manager_id, s.location, s.hub, s.city,
         s.team_note, s.mandate, s.active, s.gender, s.dob, s.mobile, s.email, s.address, s.doj, s.hr, s.cluster,
         s.face_embedding IS NOT NULL AS face_enrolled, s.face_enrolled_at,
         m.name AS manager_name,
         a.login_id, (a.locked OR (a.locked_until IS NOT NULL AND a.locked_until > now())) AS locked,
         a.locked_until, a.must_change, a.last_login_at, a.created_at AS account_created_at, cb.name AS account_created_by,
         (SELECT count(*) FROM recruit r WHERE r.owner_id = s.id AND r.status = 'active')::int AS active_recruits,
         (SELECT count(*) FROM recruit r WHERE r.owner_id = s.id)::int AS total_recruits
    FROM staff s
    LEFT JOIN staff m ON m.id = s.manager_id
    LEFT JOIN staff_account a ON a.staff_id = s.id
    LEFT JOIN staff cb ON cb.id = a.created_by`;

/* Personal details belong to the person and to the HR Admin; everyone else sees the work record only. */
const shape = (row, actor) => {
  const personal = !actor || row.id === actor.id || isAdmin(actor);
  return {
    id: row.id,
    employeeCode: row.employee_code,
    name: row.name,
    designation: row.designation,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role],
    managerId: row.manager_id,
    managerName: row.manager_name ?? null,
    location: row.location,
    hub: row.hub,
    city: row.city,
    teamNote: row.team_note,
    mandate: row.mandate,
    active: row.active,
    gender: personal ? row.gender : '',
    dob: personal ? row.dob : null,
    mobile: personal ? row.mobile : '',
    email: personal ? row.email : '',
    address: personal ? row.address : '',
    doj: personal ? row.doj : null,
    hr: personal ? row.hr : '',
    cluster: row.cluster,
    personalVisible: personal,
    hasAccount: !!row.login_id,
    loginId: row.login_id ?? null,
    locked: !!row.locked,
    mustChange: !!row.must_change,
    lastLoginAt: row.last_login_at,
    accountCreatedAt: row.account_created_at ?? null,
    accountCreatedBy: row.account_created_by ?? null,
    activeRecruits: row.active_recruits,
    totalRecruits: row.total_recruits,
    faceEnrolled: !!row.face_enrolled,
    faceEnrolledAt: row.face_enrolled_at,
  };
};

/* The line above you is readable even though it is not in your data scope. */
async function ancestorIds(staffId) {
  return (await rows('SELECT staff_id FROM staff_ancestors($1)', [staffId])).map((row) => row.staff_id);
}

/* A reporting line must stay a tree: nobody may sit below themselves. */
async function assertNoCycle(client, staffId, managerId) {
  if (!managerId) return;
  const hit = await client.query('SELECT 1 FROM staff_descendants($1) WHERE staff_id = $2', [staffId, managerId]);
  if (hit.rowCount) throw ApiError.conflict('That manager is below this person in the reporting line');
  const boss = await client.query('SELECT active FROM staff WHERE id = $1', [managerId]);
  if (!boss.rowCount) throw ApiError.badRequest('Choose an existing manager');
}

router.get('/', authenticate, handler(async (req, res) => {
  const above = new Set(await ancestorIds(req.actor.id));
  const result = await query(`${LIST_SQL} ORDER BY s.role, s.name`);
  const visible = [];
  for (const row of result.rows) {
    if (above.has(row.id) || (await seesStaff(req.actor, row.id))) visible.push(shape(row, req.actor));
  }
  res.json({ items: visible });
}));

router.get('/:id', authenticate, handler(async (req, res) => {
  const allowed = (await seesStaff(req.actor, req.params.id)) || (await ancestorIds(req.actor.id)).includes(req.params.id);
  if (!allowed) throw ApiError.forbidden('This person is outside your scope');
  const row = await one(`${LIST_SQL} WHERE s.id = $1`, [req.params.id]);
  if (!row) throw ApiError.notFound('No such staff member');
  const reports = await rows(`${LIST_SQL} WHERE s.manager_id = $1 ORDER BY s.name`, [req.params.id]);
  res.json({ item: shape(row, req.actor), reports: reports.map((report) => shape(report, req.actor)) });
}));

router.post('/', authenticate, requireAdmin, handler(async (req, res) => {
  const input = staffCreate.parse(req.body);
  const item = await transaction(async (client) => {
    const code = await nextEmployeeCode(client);
    const inserted = await client.query(
      `INSERT INTO staff (employee_code, name, designation, role, manager_id, location, hub, city, team_note, mandate,
              gender, dob, mobile, email, address, doj, hr, cluster)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
      [code, input.name, input.designation || '', input.role, input.managerId || null,
        input.location || '', input.hub || '', input.city || '', input.teamNote || '', input.mandate || '',
        input.gender || '', input.dob || null, input.mobile || '', input.email || '', input.address || '',
        input.doj || null, input.hr || '', input.cluster || ''],
    );
    const id = inserted.rows[0].id;
    await assertNoCycle(client, id, input.managerId || null);
    if (input.managerId) await client.query('UPDATE staff SET manager_id = $2 WHERE id = $1', [id, input.managerId]);
    await writeAudit(client, { actor: req.actor, action: 'staff_created', entity: 'staff', entityId: id, after: input });
    return id;
  });
  const row = await one(`${LIST_SQL} WHERE s.id = $1`, [item]);
  res.status(201).json({ item: shape(row, req.actor), message: 'Record saved' });
}));

router.patch('/:id', authenticate, requireAdmin, handler(async (req, res) => {
  const input = staffUpdate.parse(req.body);
  const before = await one('SELECT * FROM staff WHERE id = $1', [req.params.id]);
  if (!before) throw ApiError.notFound('No such staff member');

  const fields = {
    name: input.name, designation: input.designation, role: input.role, manager_id: input.managerId,
    location: input.location, hub: input.hub, city: input.city, team_note: input.teamNote,
    mandate: input.mandate, active: input.active, gender: input.gender, dob: input.dob, mobile: input.mobile,
    email: input.email, address: input.address, doj: input.doj, hr: input.hr, cluster: input.cluster,
  };
  await transaction(async (client) => {
    if ('manager_id' in fields && fields.manager_id !== undefined) await assertNoCycle(client, before.id, fields.manager_id);
    for (const [column, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      await client.query(`UPDATE staff SET ${column} = $2 WHERE id = $1`, [before.id, value]);
    }
    // A person leaving the portal loses access, not history: the account is disabled, never deleted.
    if (fields.active === false) await client.query('UPDATE staff_account SET locked = true WHERE staff_id = $1', [before.id]);
    await writeAudit(client, { actor: req.actor, action: 'staff_updated', entity: 'staff', entityId: before.id, before, after: input });
  });

  const row = await one(`${LIST_SQL} WHERE s.id = $1`, [req.params.id]);
  res.json({ item: shape(row, req.actor), message: 'Record saved' });
}));

async function nextEmployeeCode(client) {
  const hit = await client.query("SELECT max(employee_code) AS code FROM staff WHERE employee_code ~ '^EMP-[0-9]{4}$'");
  const last = Number.parseInt((hit.rows[0].code || 'EMP-1000').slice(4), 10);
  return `EMP-${String(last + 1).padStart(4, '0')}`;
}

/* The temporary password is generated, hashed, returned once and never stored in plain text. */
router.post('/:id/account', authenticate, requireAdmin, handler(async (req, res) => {
  const staff = await one('SELECT id, name, active FROM staff WHERE id = $1', [req.params.id]);
  if (!staff) throw ApiError.notFound('No such staff member');
  if (!staff.active) throw ApiError.conflict('Activate this person before provisioning an account');
  if (await findAccountByStaff(staff.id)) throw ApiError.conflict('This person already has an account');

  const requested = provisionSchema.parse(req.body ?? {}).loginId;
  const loginId = await uniqueLoginId(requested || loginIdFor(staff.name));

  const temp = generateTempPassword();
  await createAccount(staff.id, loginId, temp, { actor: req.actor, req });
  res.status(201).json({ message: 'Account created', loginId, tempPassword: temp });
}));

/* Two people can share a name, so the second login gets a number rather than failing. */
async function uniqueLoginId(base) {
  const root = String(base).trim().toLowerCase();
  for (let attempt = 1; attempt < 50; attempt += 1) {
    const candidate = attempt === 1 ? root : `${root}${attempt}`;
    // eslint-disable-next-line no-await-in-loop
    const clash = await one('SELECT 1 FROM staff_account WHERE lower(login_id) = $1', [candidate]);
    if (!clash) return candidate;
  }
  throw ApiError.conflict('Too many similar login IDs — enter one manually');
}

router.post('/:id/reset-password', authenticate, requireAdmin, handler(async (req, res) => {
  const account = await findAccountByStaff(req.params.id);
  if (!account) throw ApiError.notFound('This person has no account');
  const temp = generateTempPassword();
  await transaction(async (client) => {
    await setPassword(req.params.id, temp, { mustChange: true, actor: req.actor, req, client });
    await client.query('UPDATE refresh_session SET revoked_at = now() WHERE staff_id = $1 AND revoked_at IS NULL', [req.params.id]);
  });
  res.json({ message: 'Password reset', loginId: account.login_id, tempPassword: temp });
}));

router.post('/:id/lock', authenticate, requireAdmin, handler(async (req, res) => {
  const hit = await query('UPDATE staff_account SET locked = true, locked_until = NULL WHERE staff_id = $1 RETURNING staff_id', [req.params.id]);
  if (!hit.rowCount) throw ApiError.notFound('This person has no account');
  await query('UPDATE refresh_session SET revoked_at = now() WHERE staff_id = $1 AND revoked_at IS NULL', [req.params.id]);
  await writeAudit(query, { actor: req.actor, action: 'account_locked', entity: 'staff_account', entityId: req.params.id, req });
  res.json({ message: 'Account locked' });
}));

router.post('/:id/unlock', authenticate, requireAdmin, handler(async (req, res) => {
  const hit = await query(
    'UPDATE staff_account SET locked = false, locked_until = NULL, failed_attempts = 0 WHERE staff_id = $1 RETURNING staff_id',
    [req.params.id],
  );
  if (!hit.rowCount) throw ApiError.notFound('This person has no account');
  await writeAudit(query, { actor: req.actor, action: 'account_unlocked', entity: 'staff_account', entityId: req.params.id, req });
  res.json({ message: 'Account unlocked' });
}));

/* Deleting a person is only safe when they have no footprint. Anything with
 * history must be deactivated or locked instead, so real work is never lost. */
router.delete('/:id', authenticate, requireAdmin, handler(async (req, res) => {
  const id = req.params.id;
  const person = await one('SELECT id, name, employee_code FROM staff WHERE id = $1', [id]);
  if (!person) throw ApiError.notFound('No such staff member');
  if (id === req.actor.id) throw ApiError.badRequest('You cannot delete your own account');

  const policy = await getPolicy();
  const refs = await one(
    `SELECT
       (SELECT count(*) FROM recruit WHERE owner_id = $1)::int          AS recruits,
       (SELECT count(*) FROM attendance WHERE staff_id = $1
          AND NOT (marked_by IS NULL AND remarks LIKE 'Auto-filled%'))::int AS attendance,
       (SELECT count(*) FROM leave_request WHERE staff_id = $1)::int    AS leaves,
       (SELECT count(*) FROM resignation WHERE staff_id = $1)::int      AS resignations,
       (SELECT count(*) FROM placement_target WHERE staff_id = $1 AND target <> $2)::int AS targets,
       (SELECT count(*) FROM assignment_sheet WHERE created_by = $1)::int AS sheets,
       (SELECT count(*) FROM sheet_entry WHERE recruiter_id = $1)::int  AS entries,
       (SELECT count(*) FROM staff WHERE manager_id = $1)::int          AS reports`,
    [id, policy.targetDefault],
  );

  const blockers = [
    [refs.recruits, 'recruits owned'],
    [refs.attendance, 'attendance days'],
    [refs.leaves, 'leave requests'],
    [refs.resignations, 'resignations'],
    [refs.targets, 'targets'],
    [refs.sheets, 'assignment sheets created'],
    [refs.entries, 'sheet call entries'],
    [refs.reports, 'people reporting to them'],
  ].filter(([n]) => n > 0);

  if (blockers.length) {
    throw ApiError.conflict(
      `${person.name} has history (${blockers.map(([n, l]) => `${n} ${l}`).join(', ')}). `
      + 'Deactivate or lock this person instead of deleting — that removes them from every list without losing records.',
    );
  }

  await transaction(async (client) => {
    await client.query('DELETE FROM staff WHERE id = $1', [id]);
    await writeAudit(client, {
      actor: req.actor, action: 'staff_deleted', entity: 'staff', entityId: id,
      before: { name: person.name, employeeCode: person.employee_code },
    });
  });

  res.json({ message: `${person.name} was deleted.` });
}));

/* Password rules are published by GET /api/policy, which every signed-in role can read. */
export default router;
