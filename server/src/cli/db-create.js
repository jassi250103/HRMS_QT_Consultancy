import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

/* Creates the application role and database on the PostgreSQL instance already running on this machine. */
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

const adminUser = process.env.PG_ADMIN_USER || 'postgres';
const adminPassword = process.env.PGPASSWORD || await ask(`Password for PostgreSQL superuser "${adminUser}" on localhost:5432: `);
if (!adminPassword) {
  console.error('No superuser password supplied.');
  process.exit(1);
}

const appPassword = process.env.HRMS_DB_PASSWORD || `hrms_${randomBytes(12).toString('base64url')}`;
const connection = new pg.Client({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: adminUser,
  password: adminPassword,
  database: 'postgres',
});

try {
  await connection.connect();

  const role = await connection.query('SELECT 1 FROM pg_roles WHERE rolname = $1', ['hrms']);
  if (role.rowCount) {
    await connection.query(`ALTER ROLE hrms LOGIN PASSWORD ${quote(appPassword)}`);
    console.log('Role "hrms" already existed — password refreshed.');
  } else {
    await connection.query(`CREATE ROLE hrms LOGIN PASSWORD ${quote(appPassword)}`);
    console.log('Role "hrms" created.');
  }

  const db = await connection.query('SELECT 1 FROM pg_database WHERE datname = $1', ['hrms']);
  if (db.rowCount) {
    console.log('Database "hrms" already existed.');
  } else {
    await connection.query('CREATE DATABASE hrms OWNER hrms');
    console.log('Database "hrms" created, owned by hrms.');
  }

  console.log(`\nPut this line in server/.env:\nDATABASE_URL=postgres://hrms:${appPassword}@localhost:5432/hrms`);
  console.log('Then run: npm run migrate && npm run seed');
} catch (error) {
  console.error(error.message);
  console.error('Check that the PostgreSQL service is running and that this account has superuser rights.');
  process.exitCode = 1;
} finally {
  await connection.end().catch(() => {});
}
