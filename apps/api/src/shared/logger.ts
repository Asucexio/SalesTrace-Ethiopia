/**
 * Structured logging.
 *
 * Every log line is JSON so it can be shipped to a log aggregator without parsing. Secrets are
 * redacted by key name, and request bodies are never logged for authentication routes.
 */

import pino, { type Logger } from 'pino';

import { getEnv } from '../config/env.js';

const REDACTED_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'sessionToken',
  'invitationToken',
  'authorization',
  'cookie',
  'supabaseServiceRoleKey',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ipHashPepper',
  'IP_HASH_PEPPER',
]);

let logger: Logger | null = null;

export function getLogger(): Logger {
  if (logger === null) {
    const env = getEnv();
    logger = pino({
      level: env.LOG_LEVEL,
      base: { service: 'salestrace-api' },
      redact: {
        paths: [
          ...[...REDACTED_KEYS].map((key) => `*.${key}`),
          ...[...REDACTED_KEYS].map((key) => `req.headers.${key.toLowerCase()}`),
        ],
        censor: '[redacted]',
      },
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }
  return logger;
}

/** Test helper: replace the logger instance. */
export function setLogger(next: Logger): void {
  logger = next;
}
