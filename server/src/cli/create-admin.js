import { closePool } from '../db.js';
import { bootstrapAdmin } from '../services/bootstrap.js';

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
 * Usage:  npm run create-admin   (values come from server/.env)
 */

async function main() {
  const result = await bootstrapAdmin();
  if (!result.created) {
    console.log(`${result.reason} Nothing was changed.`);
    return;
  }
  console.log('HR Admin created.');
  console.log(`  name     : ${result.name}`);
  console.log(`  login ID : ${result.loginId}`);
  console.log(`  staff id : ${result.staffId}`);
  if (result.mustChange) {
    console.log(`  temp pass: ${result.tempPassword}`);
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
