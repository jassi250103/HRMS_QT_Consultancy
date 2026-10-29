import { spawn } from 'node:child_process';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { config, rootDir } from '../config.js';
import { closePool, pool, query } from '../db.js';
import { resetSchema, runMigrations } from '../migrator.js';

/* Purges every seeded/mock record from the LIVE database (not hrms_test), leaves the schema
   empty, then bootstraps the single real HR Admin from the ADMIN_* values in .env.
   A pg_dump safety copy is taken first and the purge refuses to continue if it fails.

     node src/cli/purge-demo.js --yes     (without --yes it only prints what would happen) */

const confirmed = process.argv.includes('--yes');
const pgBin = process.env.PGBIN || 'D:\\psql\\bin';
const backupDir = path.join(rootDir, 'backups');

const TARGET = config.databaseUrl.replace(/:[^:@/]*@/, ':***@');

async function uploadsFootprint() {
  let dirs = 0;
  let files = 0;
  try {
    const entries = await readdir(config.uploadDir, { withFileTypes: true });
    dirs = entries.length;
    for (const entry of entries) {
      if (entry.isDirectory()) files += (await readdir(path.join(config.uploadDir, entry.name))).length;
    }
  } catch {
    /* no uploads dir yet */
  }
  return { dirs, files };
}

const before = {
  staff: (await query('SELECT count(*)::int AS n FROM staff')).rows[0].n,
  accounts: (await query('SELECT count(*)::int AS n FROM staff_account')).rows[0].n,
  recruits: (await query('SELECT count(*)::int AS n FROM recruit')).rows[0].n,
};
const uploads = await uploadsFootprint();

console.log(`Target database : ${TARGET}`);
console.log(`Rows to delete  : staff ${before.staff} · accounts ${before.accounts} · recruits ${before.recruits} (+ attendance, leave, resignation, targets, master data, audit)`);
console.log(`Files to delete : ${uploads.files} uploads across ${uploads.dirs} folders in ${config.uploadDir}`);
console.log(`Kept            : empty schema + one real HR Admin from ADMIN_LOGIN_ID in .env`);

if (!confirmed) {
  console.log('\nDRY RUN — nothing was changed. Re-run with --yes to purge.');
  await closePool();
  process.exit(0);
}

await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `prepurge-${stamp}.dump`);
console.log('\nTaking a safety dump (purge aborts if this fails)...');
await new Promise((resolve, reject) => {
  const child = spawn(path.join(pgBin, 'pg_dump.exe'), ['-f', backupFile, config.databaseUrl], { stdio: 'inherit' });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exited ${code}`))));
  child.on('error', (e) => reject(new Error(`pg_dump not found in ${pgBin} (${e.message}). Set PGBIN to your PostgreSQL bin directory.`)));
});
console.log(`Backup written: ${backupFile}`);

console.log('\nDropping the schema...');
await resetSchema(pool);
await runMigrations(pool, config.migrationsDir);
console.log('Schema rebuilt empty.');

try {
  const entries = await readdir(config.uploadDir, { withFileTypes: true });
  for (const entry of entries) {
    await rm(path.join(config.uploadDir, entry.name), { recursive: true, force: true });
  }
  console.log(`Cleared ${entries.length} upload folders.`);
} catch {
  console.log('No uploads directory to clear.');
}

await closePool();

console.log('\nBootstrapping the real admin from .env...');
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['src/cli/create-admin.js'], { stdio: 'inherit' });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`create-admin exited ${code}`))));
  child.on('error', reject);
});
