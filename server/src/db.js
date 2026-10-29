import pg from 'pg';
import { config } from './config.js';

const { Pool, types } = pg;

/* DATE columns otherwise arrive as JS Dates and JSON.stringify shifts them to UTC, which moves
   the day backwards on a positive-offset server. Pass the yyyy-mm-dd text through untouched. */
types.setTypeParser(1082, (value) => value);

export const pool = new Pool({
  connectionString: config.databaseUrl,
  /* Supabase endpoints publish AAAA records; hosts without an IPv6 route (Railway containers)
     get ENETUNREACH instead of falling back, so pin the family to IPv4. */
  family: 4,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function one(text, params) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

export async function rows(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

/* Everything that writes more than one statement runs here so a failure cannot half-apply. */
export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
