import { ApiError } from '../errors.js';
import { isAdmin } from './scope.js';

export const DOCUMENT_KINDS = ['aadhaar', 'pan', 'resume', 'passbook'];

const SORTS = {
  doj: 'r.doj DESC NULLS LAST',
  'doj:asc': 'r.doj ASC NULLS LAST',
  name: 'r.name ASC',
  company: 'r.company ASC, r.name ASC',
  created: 'r.created_at DESC',
};

export function shapeRecruit(row) {
  return {
    id: row.code,
    uuid: row.id,
    code: row.code,
    sysRef: row.sys_code,
    name: row.name,
    gender: row.gender,
    dob: row.dob,
    mobile: row.mobile,
    email: row.email,
    address: row.address,
    company: row.company,
    role: row.role,
    hr: row.hr_contact,
    hrContact: row.hr_contact,
    doj: row.doj,
    city: row.city,
    hub: row.hub,
    status: row.status === 'active' ? 'Active' : 'Not Active',
    statusKey: row.status,
    reason: row.deactivation_reason,
    deactivationReason: row.deactivation_reason,
    remarks: row.remarks,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    ownerCode: row.owner_code,
    deactivatedOn: row.closed_at,
    deactivatedBy: row.closed_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const like = (value) => `%${String(value).toLowerCase().replace(/[%_]/g, '')}%`;

/* Every filter is a bound parameter; the sort is picked from a fixed table so no user text reaches ORDER BY. */
export function recruitFilters(query, scope) {
  const params = [scope];
  const parts = ['r.owner_id = ANY($1::uuid[])'];

  const add = (clause, value) => {
    params.push(value);
    parts.push(clause.replace('?', `$${params.length}`));
  };

  if (query.q) {
    const text = like(query.q);
    params.push(text);
    parts.push(`(lower(r.name) LIKE $${params.length} OR lower(r.code) LIKE $${params.length} OR r.mobile LIKE $${params.length} OR lower(r.email) LIKE $${params.length})`);
  }
  const statusKey = { active: 'active', 'not active': 'not_active', not_active: 'not_active' }[String(query.status || '').toLowerCase()];
  if (statusKey) add('r.status = ?', statusKey);
  for (const [key, column] of [['company', 'r.company'], ['role', 'r.role'], ['city', 'r.city'], ['hub', 'r.hub']]) {
    if (query[key]) add(`${column} = ?`, query[key]);
  }
  if (query.owner) add('r.owner_id = ?', query.owner);
  if (query.from) add('r.doj >= ?', query.from);
  if (query.to) add('r.doj <= ?', query.to);

  const where = () => `WHERE ${parts.join(' AND ')}`;
  return {
    where,
    params,
    countSql: () => `SELECT count(*)::int AS total FROM recruit r ${where()}`,
    pageSql: (sort) => {
      const order = SORTS[sort] || SORTS.doj;
      const limit = Math.min(100000, Math.max(1, Number.parseInt(query.pageSize, 10) || 25));
      const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
      params.push(limit, (page - 1) * limit);
      return `SELECT r.*, o.name AS owner_name, o.employee_code AS owner_code, c.name AS closed_by_name
        FROM recruit r JOIN staff o ON o.id = r.owner_id LEFT JOIN staff c ON c.id = r.closed_by
        ${where()} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    },
  };
}

/* A recruiter files for themselves, a manager may file for a report, and the HR Admin may file for anyone. */
export async function assignOwner(actor, scope, requestedOwnerId) {
  if (!requestedOwnerId || requestedOwnerId === actor.id) return actor.id;
  if (isAdmin(actor)) return requestedOwnerId;
  if (scope.includes(requestedOwnerId)) return requestedOwnerId;
  throw ApiError.forbidden('You cannot file a recruit for this person');
}
