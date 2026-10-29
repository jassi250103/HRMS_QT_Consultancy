import { randomBytes } from 'node:crypto';
import { query, transaction } from '../db.js';
import { hashPassword } from '../security/passwords.js';

/* Shared admin bootstrap used by both `npm run create-admin` (CLI) and the server startup
   on Railway. Refuse-by-default: never overwrites an existing login, and without FORCE_ADMIN
   never adds a second active HR Admin. Safe to call on every boot. */

function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digit = '23456789';
  const symbol = '!@#$%^&*()-_=+';
  const all = upper + lower + digit + symbol;
  const pick = (set) => set[randomBytes(1)[0] % set.length];
  const chars = [pick(upper), pick(upper), pick(lower), pick(lower), pick(digit), pick(digit), pick(symbol)];
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export async function bootstrapAdmin(options = {}) {
  const name = (options.name ?? process.env.ADMIN_NAME ?? '').trim();
  const loginId = (options.loginId ?? process.env.ADMIN_LOGIN_ID ?? '').trim().toLowerCase();
  if (!name || !loginId) throw new Error('ADMIN_NAME and ADMIN_LOGIN_ID are required.');
  if (!/^[a-z0-9._@-]{3,80}$/.test(loginId)) {
    throw new Error('ADMIN_LOGIN_ID must be 3-80 chars of letters, digits, or . _ @ -');
  }

  const provided = options.password ?? process.env.ADMIN_PASSWORD;
  const password = provided && provided.length ? provided : generatePassword();
  const mustChange = !(provided && provided.length);

  const designation = (options.designation ?? process.env.ADMIN_DESIGNATION ?? 'Director').trim();
  const email = (options.email ?? process.env.ADMIN_EMAIL ?? '').trim();
  const employeeCode = (options.employeeCode ?? process.env.ADMIN_EMPLOYEE_CODE ?? `ADM-${loginId.replace(/[^a-z0-9]/g, '').toUpperCase()}`).trim();
  const force = options.force ?? process.env.FORCE_ADMIN === '1';

  const existingAccount = await query('SELECT 1 FROM staff_account WHERE lower(login_id) = $1', [loginId]);
  if (existingAccount.rowCount > 0) {
    return { created: false, reason: `A login for "${loginId}" already exists.` };
  }

  const existingAdmin = await query("SELECT 1 FROM staff WHERE role = 'hr_admin' AND active LIMIT 1");
  if (existingAdmin.rowCount > 0 && !force) {
    return { created: false, reason: 'An active HR Admin already exists (set FORCE_ADMIN=1 to add another).' };
  }

  const hash = await hashPassword(password);

  const staffId = await transaction(async (db) => {
    const inserted = await db.query(
      `INSERT INTO staff (employee_code, name, designation, role, email, active)
       VALUES ($1, $2, $3, 'hr_admin', $4, true) RETURNING id`,
      [employeeCode, name, designation, email],
    );
    const id = inserted.rows[0].id;
    await db.query(
      `INSERT INTO staff_account (staff_id, login_id, password_hash, must_change, locked)
       VALUES ($1, $2, $3, $4, false)`,
      [id, loginId, hash, mustChange],
    );
    await db.query('INSERT INTO password_history (staff_id, password_hash) VALUES ($1, $2)', [id, hash]);
    await db.query(
      `INSERT INTO audit_log (actor_name, action, entity, entity_id, after_data)
       VALUES ('system', 'admin_bootstrapped', 'staff', $1, $2)`,
      [id, JSON.stringify({ loginId, role: 'hr_admin' })],
    );
    return id;
  });

  return { created: true, name, loginId, staffId, mustChange, tempPassword: mustChange ? password : null };
}
