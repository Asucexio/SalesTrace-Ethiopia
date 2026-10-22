/**
 * Cookie handling.
 *
 * Implemented in-house (rather than pulling in a dependency) because the API only needs to read
 * one cookie and set a small, well-understood set of cookies.
 *
 * Security properties:
 * - The session cookie is `HttpOnly` (never readable by JavaScript), `SameSite=Lax` and
 *   `Secure` in production.
 * - The path is restricted to `/api` so the cookie is not sent with tracking redirects.
 */

export interface CookieOptions {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  path?: string;
  expires?: Date;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;

    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    if (name.length === 0) continue;

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

/** Serialise a `Set-Cookie` header value. */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires !== undefined) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${(options.sameSite ?? 'lax').replace(/^./, (character) => character.toUpperCase())}`);

  return parts.join('; ');
}
