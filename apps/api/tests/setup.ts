/**
 * Test environment defaults.
 *
 * Registered as a vitest `setupFiles` entry so the variables are in place **before** any module
 * is imported. ES module imports are hoisted, so setting them in the body of a test helper
 * would run too late: `getEnv()` caches the configuration the first time it is read.
 */

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://localhost/salestrace_test';
process.env.IP_HASH_PEPPER = process.env.IP_HASH_PEPPER ?? 'test-pepper-value-0001';
process.env.AUTH_MODE = process.env.AUTH_MODE ?? 'local';
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
process.env.API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
process.env.CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000';
process.env.IMPORT_RATE_LIMIT = process.env.IMPORT_RATE_LIMIT ?? '100';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
