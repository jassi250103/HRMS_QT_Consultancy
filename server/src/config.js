import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = fileURLToPath(new URL('..', import.meta.url));
export const projectRoot = path.resolve(rootDir, '..');

const envFile = path.join(rootDir, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const int = (value, fallback) => (value === undefined ? fallback : Number.parseInt(value, 10));

export const config = {
  env: process.env.NODE_ENV || 'development',
  get production() {
    return this.env === 'production';
  },
  port: int(process.env.PORT, 3000),
  // Browsers only expose the camera on https or localhost, so a shared/LAN device
  // needs this TLS port to use face capture. Falls back to http-only when no cert.
  httpsPort: int(process.env.HTTPS_PORT, 3443),
  certDir: process.env.CERT_DIR ? path.resolve(process.env.CERT_DIR) : path.join(rootDir, 'certs'),
  databaseUrl: process.env.DATABASE_URL || 'postgres://hrms:hrms@localhost:5432/hrms',
  origin: process.env.ORIGIN || 'http://localhost:3000',
  serveUi: process.env.SERVE_UI !== 'false',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me-please-0123456789',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtlDays: int(process.env.REFRESH_TOKEN_TTL_DAYS, 14),
  // Read lazily so a test run can raise the login throttle after the module graph is loaded.
  get loginRateMax() {
    return int(process.env.LOGIN_RATE_MAX, 10);
  },
  migrationsDir: path.join(rootDir, 'migrations'),
  uploadDir: process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(rootDir, 'uploads'),
};

if (config.production && config.jwtSecret.startsWith('dev-only')) {
  throw new Error('JWT_SECRET must be set to a private value in production');
}
