import { spawn } from 'node:child_process';
import { config } from '../config.js';

/* Runs the regression suite against an isolated database (hrms_test) so npm test can never
   touch the live application data. Cross-platform: DATABASE_URL is set inside Node, not in the
   npm script string, which avoids cmd.exe inline-envvar failures on Windows. */

const TEST_DB = process.env.HRMS_TEST_DB || 'hrms_test';

function withTestDatabase(url) {
  const parsed = new URL(url);
  parsed.pathname = `/${TEST_DB}`;
  return parsed.toString();
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, env });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`))));
    child.on('error', reject);
  });
}

const env = { ...process.env, DATABASE_URL: withTestDatabase(config.databaseUrl), NODE_ENV: 'test' };
const node = process.execPath;

console.log(`Tests target database: ${TEST_DB}`);

try {
  await run(node, ['src/cli/migrate.js', '--reset'], env);
  await run(node, ['src/cli/seed.js', '--force'], env);
  await run(node, ['--test', '--test-concurrency=1', '--test-force-exit', 'test/auth.test.js',
    'test/recruits.test.js', 'test/approvals.test.js', 'test/config.test.js', 'test/face-geofence.test.js'], env);
} catch (error) {
  console.error(`\n${error.message}`);
  console.error(`If the failure is a connection or permission error, create the test database once:`);
  console.error(`    npm run db:create:test`);
  process.exitCode = 1;
}
