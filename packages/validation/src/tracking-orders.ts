import { z } from 'zod';

import {
  attributionMethodSchema,
  currencySchema,
  discountTypeSchema,
  httpsUrlSchema,
  isoDateSchema,
  moneySchema,
  orderStatusSchema,
  uuidSchema,
} from './common.js';

/* --------------------------------------------------------------- tracking */

export const createTrackingLinkSchema = z.object({
  campaignId: uuidSchema,
  creatorId: uuidSchema,
  channel: z.enum(['link', 'qr']).default('link'),
  label: z.string().trim().max(120).optional().nullable(),
  destinationUrl: httpsUrlSchema.optional(),
});

export const updateTrackingLinkSchema = z.object({
  label: z.string().trim().max(120).optional().nullable(),
  destinationUrl: httpsUrlSchema.optional(),
  isActive: z.boolean().optional(),
});

export const createCouponCodeSchema = z.object({
  campaignId: uuidSchema,
  creatorId: uuidSchema,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-Z][0-9A-Z-]{2,31}$/, 'Use letters, digits and dashes.')
    .optional(),
  discountType: discountTypeSchema,
  discountValue: moneySchema.optional().nullable(),
  discountPercent: z.coerce.number().min(0).max(100).optional().nullable(),
  maxRedemptions: z.coerce.number().int().positive().max(1_000_000).optional().nullable(),
  validFrom: isoDateSchema.optional().nullable(),
  validUntil: isoDateSchema.optional().nullable(),
});

export const updateCouponCodeSchema = z.object({
  discountType: discountTypeSchema.optional(),
  discountValue: moneySchema.optional().nullable(),
  discountPercent: z.coerce.number().min(0).max(100).optional().nullable(),
  maxRedemptions: z.coerce.number().int().positive().max(1_000_000).optional().nullable(),
  validFrom: isoDateSchema.optional().nullable(),
  validUntil: isoDateSchema.optional().nullable(),
  isActive: z.boolean().optional(),
});

export const trackingLinkListQuerySchema = z.object({
  campaignId: uuidSchema.optional(),
  creatorId: uuidSchema.optional(),
  channel: z.enum(['link', 'qr']).optional(),
  isActive: z
    .union([z.boolean(), z.string()])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const trackingEventListQuerySchema = z.object({
  campaignId: uuidSchema.optional(),
  creatorId: uuidSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateTrackingLinkInput = z.infer<typeof createTrackingLinkSchema>;
export type CreateCouponCodeInput = z.infer<typeof createCouponCodeSchema>;

/* ----------------------------------------------------------------- orders */

/** Canonical CSV column names. The importer maps source headers onto these. */
export const ORDER_COLUMNS = [
  'externalOrderId',
  'orderedAt',
  'currency',
  'subtotal',
  'discount',
  'tax',
  'shipping',
  'totalPaid',
  'refundAmount',
  'status',
  'couponCode',
  'referralIdentifier',
  'customerRef',
] as const;

export type OrderColumn = (typeof ORDER_COLUMNS)[number];

export const orderColumnSchema = z.enum(ORDER_COLUMNS);

export const importMappingSchema = z
  .object({
    mapping: z.record(orderColumnSchema, z.string().trim().min(1).max(120)),
  })
  .refine(
    (value) => Object.keys(value.mapping).includes('externalOrderId') && Object.keys(value.mapping).includes('totalPaid'),
    {
      message: 'The mapping must include "externalOrderId" and "totalPaid".',
      path: ['mapping'],
    },
  );

export const orderListQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  campaignId: uuidSchema.optional(),
  creatorId: uuidSchema.optional(),
  attributed: z
    .union([z.boolean(), z.string()])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))
    .optional(),
  method: attributionMethodSchema.optional(),
  search: z.string().trim().max(120).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['orderedAt', '-orderedAt', 'totalPaid', '-totalPaid', 'externalOrderId']).default('-orderedAt'),
});

export const recordRefundSchema = z.object({
  amount: moneySchema,
  reason: z.string().trim().max(500).optional().nullable(),
  externalRefundId: z.string().trim().max(120).optional().nullable(),
  refundedAt: isoDateSchema.optional(),
});

export const recomputeAttributionSchema = z.object({
  campaignId: uuidSchema.optional(),
});

export const attributionListQuerySchema = z.object({
  campaignId: uuidSchema.optional(),
  creatorId: uuidSchema.optional(),
  method: attributionMethodSchema.optional(),
  conflict: z
    .union([z.boolean(), z.string()])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))
    .optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type AttributionListQuery = z.infer<typeof attributionListQuerySchema>;

/* --------------------------------------------------------------- analytics */

export const analyticsQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  campaignId: z
    .union([uuidSchema, z.array(uuidSchema)])
    .optional()
    .transform((value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value])),
  creatorId: z
    .union([uuidSchema, z.array(uuidSchema)])
    .optional()
    .transform((value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value])),
  status: orderStatusSchema.optional(),
  method: attributionMethodSchema.optional(),
  platform: z.string().trim().max(60).optional(),
  currency: currencySchema.optional(),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const reportQuerySchema = analyticsQuerySchema.extend({
  type: z.enum(['campaigns', 'creators', 'orders', 'attributions']).default('campaigns'),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
