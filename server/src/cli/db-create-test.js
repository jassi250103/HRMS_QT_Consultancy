import { createInterface } from 'node:readline';
import pg from 'pg';
import { config } from '../config.js';

/* One-time setup for the isolated test database. The application role is not a
   superuser, so this uses the PostgreSQL superuser (postgres) to create hrms_test and
   grant the app role access. Run it once: npm run db:create:test */

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

const testUrl = new URL(config.databaseUrl);
const TEST_DB = process.env.HRMS_TEST_DB || 'hrms_test';
const appRole = testUrl.username;

const adminUser = process.env.PG_ADMIN_USER || 'postgres';
const adminPassword = process.env.PGPASSWORD || await ask(`Password for PostgreSQL superuser "${adminUser}" on localhost:5432: `);
if (!adminPassword) {
  console.error('No superuser password supplied.');
  process.exit(1);
}

const connection = new pg.Client({
  host: testUrl.hostname,
  port: Number(testUrl.port) || 5432,
  user: adminUser,
  password: adminPassword,
  database: 'postgres',
});

try {
  await connection.connect();
  const db = await connection.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB]);
  if (db.rowCount) {
    console.log(`Database "${TEST_DB}" already existed.`);
  } else {
    await connection.query(`CREATE DATABASE ${quote(TEST_DB)}`);
    console.log(`Database "${TEST_DB}" created.`);
  }
  await connection.query(`GRANT ALL PRIVILEGES ON DATABASE ${quote(TEST_DB)} TO ${quote(appRole)}`);
  // On PG15+ the public schema is not world-writable; make the app role own it so migrate can run.
  await connection.query(`ALTER DATABASE ${quote(TEST_DB)} OWNER TO ${quote(appRole)}`);
  console.log(`Owner set to "${appRole}". Tests can now run: npm test`);
} catch (error) {
  console.error(error.message);
  console.error('Check that the PostgreSQL service is running and that this account has superuser rights.');
  process.exitCode = 1;
} finally {
  await connection.end().catch(() => {});
}
