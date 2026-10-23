import { randomBytes } from 'node:crypto';
import { closePool, query, transaction } from '../db.js';
import { hashPassword } from '../security/passwords.js';

/**
 * Production bootstrap: create the first (Director) HR Admin account without
 * the demo seed. Idempotent and refuse-by-default so it can never silently
 * mint a second super-admin or overwrite an existing login.
 *
 * Config (env):
 *   ADMIN_NAME          required — display name of the admin
 *   ADMIN_LOGIN_ID      required — login ID (stored lower-cased)
 *   ADMIN_PASSWORD      optional — if omitted, a one-time password is generated
 *   ADMIN_EMAIL         optional
 *   ADMIN_DESIGNATION   optional — defaults to "Director"
 *   ADMIN_EMPLOYEE_CODE optional — defaults to a code derived from the login
 *   FORCE_ADMIN         optional "1" — allow creating an admin when one already exists
 *
 * Usage:  ADMIN_NAME="..." ADMIN_LOGIN_ID="..." npm run create-admin
 */

function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digit = '23456789';
  const symbol = '!@#$%^&*()-_=+';
  const all = upper + lower + digit + symbol;
  const pick = (set) => set[randomBytes(1)[0] % set.length];
  const chars = [pick(upper), pick(upper), pick(lower), pick(lower), pick(digit), pick(digit), pick(symbol)];
  while (chars.length < 16) chars.push(pick(all));
  // Fisher-Yates shuffle so guaranteed classes aren't in fixed positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function main() {
  const name = (process.env.ADMIN_NAME || '').trim();
  const loginId = (process.env.ADMIN_LOGIN_ID || '').trim().toLowerCase();
  if (!name || !loginId) {
    throw new Error('ADMIN_NAME and ADMIN_LOGIN_ID are required.');
  }
  if (!/^[a-z0-9._@-]{3,80}$/.test(loginId)) {
    throw new Error('ADMIN_LOGIN_ID must be 3-80 chars of letters, digits, or . _ @ -');
  }

  const provided = process.env.ADMIN_PASSWORD;
  const password = provided && provided.length ? provided : generatePassword();
  const mustChange = !(provided && provided.length);

  const designation = (process.env.ADMIN_DESIGNATION || 'Director').trim();
  const email = (process.env.ADMIN_EMAIL || '').trim();
  const employeeCode = (process.env.ADMIN_EMPLOYEE_CODE || `ADM-${loginId.replace(/[^a-z0-9]/g, '').toUpperCase()}`).trim();

  const existingAccount = await query('SELECT 1 FROM staff_account WHERE lower(login_id) = $1', [loginId]);
  if (existingAccount.rowCount > 0) {
    throw new Error(`A login for "${loginId}" already exists. Nothing was changed.`);
  }

  const existingAdmin = await query("SELECT 1 FROM staff WHERE role = 'hr_admin' AND active LIMIT 1");
  if (existingAdmin.rowCount > 0 && process.env.FORCE_ADMIN !== '1') {
    throw new Error('An active HR Admin already exists. Set FORCE_ADMIN=1 to intentionally add another.');
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

  console.log('HR Admin created.');
  console.log(`  name     : ${name}`);
  console.log(`  login ID : ${loginId}`);
  console.log(`  staff id : ${staffId}`);
  if (mustChange) {
    console.log(`  temp pass: ${password}`);
    console.log('  -> This is shown once. Sign in and set a new password immediately.');
  } else {
    console.log('  -> Using the ADMIN_PASSWORD you provided (must_change=false).');
  }
}

main()
  .then(closePool)
  .catch(async (error) => {
    console.error(error.message || error);
    await closePool();
    process.exitCode = 1;
  });
