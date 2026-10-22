/**
 * Password hashing and policy.
 *
 * In `local` mode the API hashes passwords itself with scrypt (memory-hard, salted). In
 * `supabase` mode Supabase Auth performs the hashing and verification.
 *
 * The stored format is self-describing so the parameters can be raised later without breaking
 * existing credentials: `scrypt$N$r$p$salt$hash`.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export const MIN_PASSWORD_LENGTH = 10;

/**
 * Validate a password against the policy.
 *
 * Returns the list of problems; an empty list means the password is acceptable.
 */
export function validatePasswordStrength(password: string): string[] {
  const problems: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  if (!/[a-zA-Z]/.test(password)) {
    problems.push('Password must contain at least one letter.');
  }
  if (!/\d/.test(password)) {
    problems.push('Password must contain at least one digit.');
  }

  return problems;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return [
    'scrypt',
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verify a password against a stored hash.
 *
 * The comparison is constant-time. A malformed stored hash fails closed (returns `false`)
 * rather than throwing.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4] ?? '', 'base64');
    expected = Buffer.from(parts[5] ?? '', 'base64');
  } catch {
    return false;
  }

  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  const derived = await scryptAsync(password.normalize('NFKC'), salt, expected.length, { N, r, p });

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}
