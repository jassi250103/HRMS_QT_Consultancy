import { one, rows } from '../db.js';
import { ApiError } from '../errors.js';
import { isAdmin } from './scope.js';

export const ENTRY_STATUSES = ['new', 'no_answer', 'interested', 'interviewed', 'joined', 'not_interested', 'wrong_number'];

/* Keep only the 10-digit national number: strip +91/91/0 prefixes, tolerate spaces and dashes. */
export function normalizeMobile(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[6-9]/.test(digits)) return null;
  return digits;
}

export function shapeRow(row) {
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    detail: row.detail,
    recruitId: row.recruit_id,
    recruitCode: row.recruit_code ?? null,
    joinedBy: row.joined_by_name ?? null,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
  };
}

export function shapeEntry(row) {
  return {
    entryId: row.entry_id,
    recruiterId: row.recruiter_id,
    recruiterName: row.recruiter_name,
    status: row.status,
    remarks: row.remarks,
    statusAt: row.status_at,
    updatedAt: row.updated_at,
  };
}

async function sheetFunnel(sheetId, scope) {
  return rows(
    `SELECT e.status, count(*)::int AS total
     FROM sheet_entry e JOIN sheet_row r ON r.id = e.row_id
     WHERE r.sheet_id = $1 AND e.recruiter_id = ANY($2::uuid[])
     GROUP BY e.status`,
    [sheetId, scope],
  );
}

export async function funnelMap(sheetId, scope) {
  const counts = Object.fromEntries(ENTRY_STATUSES.map((s) => [s, 0]));
  for (const row of await sheetFunnel(sheetId, scope)) counts[row.status] = row.total;
  return counts;
}

/* A sheet is visible when the actor made it, may manage its creator, or works any of its rows. */
export async function loadSheet(id, scope, actor) {
  const sheet = await one(
    `SELECT s.*, c.name AS created_by_name,
        (SELECT count(*)::int FROM sheet_row r WHERE r.sheet_id = s.id) AS row_count,
        (SELECT count(*)::int FROM sheet_row r WHERE r.sheet_id = s.id AND r.recruit_id IS NOT NULL) AS joined_count,
        (SELECT count(DISTINCT e.recruiter_id)::int
           FROM sheet_entry e JOIN sheet_row r ON r.id = e.row_id
          WHERE r.sheet_id = s.id AND e.recruiter_id = ANY($2::uuid[])) AS recruiter_count
     FROM assignment_sheet s JOIN staff c ON c.id = s.created_by
     WHERE s.id::text = $1
       AND (s.created_by = ANY($2::uuid[])
            OR EXISTS (SELECT 1 FROM sheet_entry e JOIN sheet_row r ON r.id = e.row_id
                       WHERE r.sheet_id = s.id AND e.recruiter_id = ANY($2::uuid[])))`,
    [id, scope],
  );
  if (!sheet) throw ApiError.notFound('No such sheet');
  return sheet;
}

export async function canManage(actor, sheet) {
  if (isAdmin(actor)) return true;
  if (sheet.created_by === actor.id) return true;
  const hit = await one('SELECT 1 FROM staff_descendants($1) WHERE staff_id = $2', [actor.id, sheet.created_by]);
  return !!hit;
}

export async function requireManage(actor, scope, sheet) {
  const ok = await canManage(actor, sheet);
  if (!ok) throw ApiError.forbidden('Only the creator, their manager or the HR Admin may change this sheet');
}

export async function logActivity(client, { sheetId, rowId = null, actor, action, detail = '' }) {
  await client.query(
    `INSERT INTO sheet_activity (sheet_id, row_id, actor_id, actor_name, action, detail)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sheetId, rowId, actor?.id ?? null, actor?.name ?? 'system', action, detail],
  );
}
