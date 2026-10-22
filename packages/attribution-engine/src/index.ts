/**
 * `@salestrace/attribution-engine` — the pure business-logic core of SalesTrace.
 *
 * This package must not perform I/O, read the clock, or import a web framework. The API layer
 * assembles inputs from persisted rows and persists the decisions this package returns, so the
 * dashboard, the reports and the exports always agree with each other and with the database.
 */

export * from './types.js';
export * from './policy.js';
export * from './attribution.js';
export * from './metrics.js';
