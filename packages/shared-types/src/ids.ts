/**
 * Identifier and public-code helpers.
 *
 * Public tracking codes must be short, URL-safe, unambiguous when read aloud or typed, and must
 * never leak internal database identifiers.
 *
 * Uses the Web Crypto API (`globalThis.crypto`) so the module works unchanged in Node and in the
 * browser bundle — the shared package must stay dependency-free and isomorphic.
 */

/** Crockford base32 alphabet — excludes I, L, O and U to avoid confusion. */
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Length of a public tracking code. */
export const TRACKING_CODE_LENGTH = 10;

/** Characters allowed in a generated coupon code. */
const COUPON_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Minimal structural type for the Web Crypto API.
 *
 * Declared locally instead of using the DOM `Crypto` type: this package must compile without
 * the DOM lib so that it can be consumed by Node (API) and by the browser (web app) alike.
 */
interface WebCryptoLike {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  randomUUID?: () => string;
}

function getCrypto(): WebCryptoLike {
  const webCrypto = (globalThis as { crypto?: WebCryptoLike }).crypto;
  if (!webCrypto || typeof webCrypto.getRandomValues !== 'function') {
    throw new Error('A Web Crypto implementation is required (globalThis.crypto.getRandomValues).');
  }
  return webCrypto;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return bytes;
}

/**
 * Generate a public tracking code (10 characters, Crockford base32).
 *
 * Entropy: 10 characters × 5 bits = 50 bits. Collisions are resolved by the unique constraint on
 * `tracking_links.code`; the generator retries on conflict.
 */
export function generateTrackingCode(length: number = TRACKING_CODE_LENGTH): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += CROCKFORD_ALPHABET[(bytes[index] ?? 0) % CROCKFORD_ALPHABET.length];
  }
  return code;
}

/**
 * Generate a coupon code, optionally prefixed with a readable segment (e.g. `MIRA-8F3K2P`).
 */
export function generateCouponCode(prefix?: string, suffixLength = 6): string {
  const bytes = randomBytes(suffixLength);
  let suffix = '';
  for (let index = 0; index < suffixLength; index += 1) {
    suffix += COUPON_ALPHABET[(bytes[index] ?? 0) % COUPON_ALPHABET.length];
  }
  const cleanPrefix = prefix
    ? prefix
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10)
    : '';
  return cleanPrefix ? `${cleanPrefix}-${suffix}` : suffix;
}

/** Generate a random URL-safe token (session ids, invitation tokens, email verification tokens). */
export function generateSecureToken(bytes = 32): string {
  const data = randomBytes(bytes);
  let token = '';
  for (let index = 0; index < data.length; index += 3) {
    const first = data[index] ?? 0;
    const second = data[index + 1];
    const third = data[index + 2];

    token += BASE64URL_ALPHABET[first >> 2];
    token += BASE64URL_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      token += BASE64URL_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) {
      token += BASE64URL_ALPHABET[third & 0x3f];
    }
  }
  return token;
}

/** Generate a UUID v4. */
export function newUuid(): string {
  const webCrypto = getCrypto();
  if (typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  const bytes = randomBytes(16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Normalise a coupon code for comparison: trim and upper-case. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Normalise a tracking code for comparison: trim and upper-case. */
export function normalizeTrackingCode(code: string): string {
  return code.trim().toUpperCase();
}
