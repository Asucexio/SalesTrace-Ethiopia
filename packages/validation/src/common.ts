/**
 * `@salestrace/validation` — Zod schemas shared by the API and the web app.
 *
 * The same schema validates the request on the server and the form on the client, so the two
 * cannot drift apart. Unknown keys are stripped rather than passed through, which prevents mass
 * assignment of server-owned fields.
 */

import { z } from 'zod';

import {
  ATTRIBUTION_METHODS,
  CAMPAIGN_STATUSES,
  COST_TYPES,
  DISCOUNT_TYPES,
  ORDER_STATUSES,
  ORGANIZATION_ROLES,
} from '@salestrace/shared-types';

/** A UUID v4 (or any canonical UUID). */
export const uuidSchema = z.string().uuid();

/**
 * A monetary amount expressed as a decimal string (`"250000.00"`).
 *
 * Amounts are transported as strings so no client ever has to round-trip a float. The API
 * converts them to integer minor units.
 */
export const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
    if (!/^-?\d+(\.\d{1,2})?$/.test(text)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Must be a decimal amount with at most two decimal places.',
      });
      return z.NEVER;
    }
    return text;
  });

/** An ISO-8601 timestamp. */
export const isoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), { message: 'Must be an ISO-8601 timestamp.' });

/** A URL that must use https. */
export const httpsUrlSchema = z
  .string()
  .url('Must be a valid URL.')
  .refine((value) => value.startsWith('https://'), { message: 'Must use https.' });

/** A currency code. */
export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Must be a three-letter ISO currency code.');

/** Pagination parameters shared by every list endpoint. */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Date range filter. `from` is inclusive, `to` is exclusive. */
export const dateRangeSchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/** A search term. */
export const searchSchema = z.string().trim().max(120).optional();

export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const attributionMethodSchema = z.enum(ATTRIBUTION_METHODS);
export const costTypeSchema = z.enum(COST_TYPES);
export const discountTypeSchema = z.enum(DISCOUNT_TYPES);
export const roleSchema = z.enum(ORGANIZATION_ROLES);

export { z };
