import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import { createApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db.js';

const app = createApp();

const httpServer = http.createServer(app);

function lanAddresses() {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

function startHttp() {
  httpServer.listen(config.port, () => {
    console.log(`QT Consultancy HRMS API on http://localhost:${config.port} (${config.env})`);
  });
}

let httpsServer = null;
function startHttps() {
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

startHttp();
startHttps();

async function shutdown(signal) {
  console.log(`${signal} received — closing connections`);
  const closers = [httpServer];
  if (httpsServer) closers.push(httpsServer);
  let pending = closers.length;
  closers.forEach((s) => s.close(() => { if (--pending === 0) finish(); }));
  function finish() {
    closePool().then(() => process.exit(0));
  }
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
