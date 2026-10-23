import fs from 'node:fs';
import path from 'node:path';

const LEDGER = `
CREATE TABLE IF NOT EXISTS schema_migration (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

/* Each file runs in its own transaction so a failed migration leaves the database untouched. */
export async function runMigrations(client, dir) {
  await client.query(LEDGER);
  const appliedRows = await client.query('SELECT version FROM schema_migration');
  const done = new Set(appliedRows.rows.map((row) => row.version));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const ran = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migration (version) VALUES ($1)', [file]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
    ran.push(file);
  }
  return ran;
}

export async function resetSchema(client) {
  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
}
