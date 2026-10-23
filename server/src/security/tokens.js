import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

const secretKey = () => new TextEncoder().encode(config.jwtSecret);

export async function signAccess(actor) {
  const payload = { role: actor.role, name: actor.name };
  return new SignJWT(payload)
    .setSubject(actor.id)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('qt-hrms')
    .setExpirationTime(config.accessTokenTtl)
    .sign(secretKey());
}

export async function verifyAccess(token) {
  const { payload } = await jwtVerify(token, secretKey(), { issuer: 'qt-hrms', algorithms: ['HS256'] });
  return payload;
}

/* Opaque refresh tokens: only the SHA-256 of the value is stored, so a database leak cannot replay a session. */
export function newRefreshToken() {
  return randomBytes(48).toString('base64url');
}

export function hashToken(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function refreshExpiry() {
  return new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000);
}

export const REFRESH_COOKIE = 'hrms_refresh';

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.production,
    path: '/api/auth',
    maxAge: config.refreshTokenTtlDays * 86_400_000,
  };
}
