import { config } from '../config.js';
import { closePool, pool } from '../db.js';
import { resetSchema, runMigrations } from '../migrator.js';

const reset = process.argv.includes('--reset');

try {
  if (reset) {
    console.log('Dropping the schema...');
    await resetSchema(pool);
  }
  const ran = await runMigrations(pool, config.migrationsDir);
  console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Already up to date.');
  await closePool();
} catch (error) {
  console.error(error.message);
  console.error(`Check the PostgreSQL service and DATABASE_URL (${config.databaseUrl.replace(/:[^:@/]*@/, ':***@')}).`);
  process.exitCode = 1;
}
