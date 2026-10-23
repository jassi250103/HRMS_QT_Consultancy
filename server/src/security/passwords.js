import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const KEY_LENGTH = 64;
const PARAMS = { N: 16384, r: 8, p: 1 };

/* scrypt ships with Node, so there is no native build step to break on a developer machine. */
export async function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(normalise(plain), salt, KEY_LENGTH, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt, key.toString('base64')].join('$');
}

export async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const [algo, N, r, p, salt, digest] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !digest) return false;
  const expected = Buffer.from(digest, 'base64');
  const key = await derive(normalise(plain), salt, expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function passwordProblems(plain, policy, currentPlain) {
  const problems = [];
  const value = plain || '';
  if (value.length < policy.passwordMinLength) problems.push(`Use at least ${policy.passwordMinLength} characters`);
  if (!/[a-zA-Z]/.test(value)) problems.push('Include a letter');
  if (!/[0-9]/.test(value)) problems.push('Include a number');
  if (currentPlain && value === currentPlain) problems.push('The new password must differ from the current one');
  return problems;
}

/* Issued once by the HR Admin and shown a single time; the account is flagged until it is replaced. */
export function generateTempPassword() {
  const digits = randomBytes(4).readUInt32LE(0) % 1_000_000;
  return `Hrms@${String(digits).padStart(6, '0')}`;
}

export function loginIdFor(name) {
  return String(name).trim().toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.+|\.+$/g, '') || 'user';
}

const normalise = (value) => String(value ?? '').normalize('NFC');
