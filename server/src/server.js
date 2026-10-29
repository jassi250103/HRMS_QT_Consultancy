import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import { createApp } from './app.js';
import { config, rootDir } from './config.js';
import { closePool, pool } from './db.js';
import { runMigrations } from './migrator.js';
import { bootstrapAdmin } from './services/bootstrap.js';

/* Self-healing boot for hosted platforms (Railway + Supabase): apply any pending migrations,
   then create the single HR Admin from ADMIN_NAME/ADMIN_LOGIN_ID/ADMIN_PASSWORD if one is set
   and none exists yet. Both steps are idempotent; the server only binds after they succeed. */
async function prepareDatabase() {
  const ran = await runMigrations(pool, path.join(rootDir, 'migrations'));
  console.log(ran.length ? `[boot] migrations applied: ${ran.join(', ')}` : '[boot] schema up to date');

  if (process.env.ADMIN_LOGIN_ID && process.env.ADMIN_NAME) {
    const result = await bootstrapAdmin();
    if (result.created) {
      console.log(`[boot] HR Admin created: ${result.loginId}${result.mustChange ? ` (temp password: ${result.tempPassword})` : ''}`);
    } else {
      console.log(`[boot] admin bootstrap skipped: ${result.reason}`);
    }
  }
}

/* The app is created only after the schema is ready, so its startup jobs never query
   tables that do not exist yet on a fresh database. */
let httpServer = null;

function lanAddresses() {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

let httpsServer = null;
function startHttps(app) {
  const keyPath = path.join(config.certDir, 'key.pem');
  const certPath = path.join(config.certDir, 'cert.pem');
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    console.log('[https] no cert in server/certs — face capture needs https only for LAN/shared devices');
    return;
  }
  httpsServer = https.createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, app);
  httpsServer.listen(config.httpsPort, () => {
    console.log(`QT Consultancy HRMS (TLS) on https://localhost:${config.httpsPort}`);
    for (const ip of lanAddresses()) {
      console.log(`  face capture on other devices: https://${ip}:${config.httpsPort}`);
    }
  });
  httpsServer.on('error', (err) => {
    console.error('[https] failed to start:', err.message);
    httpsServer = null;
  });
}

async function shutdown(signal) {
  console.log(`${signal} received — closing connections`);
  const closers = [httpServer, httpsServer].filter(Boolean);
  if (!closers.length) {
    await closePool();
    process.exit(0);
  }
  let pending = closers.length;
  closers.forEach((s) => s.close(() => { if (--pending === 0) finish(); }));
  function finish() {
    closePool().then(() => process.exit(0));
  }
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/* Prepare the schema (and admin) first, then bind. On a fresh Supabase database the
   auto-expire job inside createApp() must not run before the tables exist. */
prepareDatabase()
  .then(() => {
    const app = createApp();
    httpServer = http.createServer(app);
    httpServer.listen(config.port, () => {
      console.log(`QT Consultancy HRMS API on http://localhost:${config.port} (${config.env})`);
    });
    startHttps(app);
  })
  .catch((error) => {
    console.error('Startup failed:', error.message || error);
    process.exit(1);
  });
