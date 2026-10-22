import { z } from 'zod';

import {
  MAX_ATTRIBUTION_WINDOW_DAYS,
  MIN_ATTRIBUTION_WINDOW_DAYS,
} from '@salestrace/shared-types';

import {
  campaignStatusSchema,
  costTypeSchema,
  currencySchema,
  httpsUrlSchema,
  isoDateSchema,
  moneySchema,
  uuidSchema,
} from './common.js';

/* -------------------------------------------------------------- campaigns */

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(2, 'Must be at least 2 characters long.').max(160),
    objective: z.string().trim().max(500).optional().nullable(),
    description: z.string().trim().max(4000).optional().nullable(),
    startAt: isoDateSchema,
    endAt: isoDateSchema.optional().nullable(),
    budget: moneySchema.optional().nullable(),
    currency: currencySchema.optional(),
    attributionWindowDays: z
      .number()
      .int()
      .min(MIN_ATTRIBUTION_WINDOW_DAYS)
      .max(MAX_ATTRIBUTION_WINDOW_DAYS)
      .optional(),
    destinationUrl: httpsUrlSchema,
  })
  .refine(
    (value) => value.endAt === undefined || value.endAt === null || new Date(value.endAt) > new Date(value.startAt),
    { message: 'End date must be after the start date.', path: ['endAt'] },
  );

export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    objective: z.string().trim().max(500).optional().nullable(),
    description: z.string().trim().max(4000).optional().nullable(),
    startAt: isoDateSchema.optional(),
    endAt: isoDateSchema.optional().nullable(),
    budget: moneySchema.optional().nullable(),
    attributionWindowDays: z
      .number()
      .int()
      .min(MIN_ATTRIBUTION_WINDOW_DAYS)
      .max(MAX_ATTRIBUTION_WINDOW_DAYS)
      .optional(),
    destinationUrl: httpsUrlSchema.optional(),
  })
  .refine(
    (value) =>
      value.startAt === undefined ||
      value.endAt === undefined ||
      value.endAt === null ||
      new Date(value.endAt) > new Date(value.startAt),
    { message: 'End date must be after the start date.', path: ['endAt'] },
  );

export const transitionCampaignSchema = z.object({
  status: campaignStatusSchema,
});

export const assignCreatorSchema = z.object({
  creatorId: uuidSchema,
  agreedFee: moneySchema.optional().nullable(),
  currency: currencySchema.optional(),
  assignedAt: isoDateSchema.optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const updateAssignmentSchema = z.object({
  agreedFee: moneySchema.optional().nullable(),
  assignedAt: isoDateSchema.optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(['active', 'removed']).optional(),
});

export const createCampaignCostSchema = z.object({
  creatorId: uuidSchema.optional().nullable(),
  costType: costTypeSchema,
  description: z.string().trim().max(500).optional().nullable(),
  amount: moneySchema,
  currency: currencySchema.optional(),
  incurredAt: isoDateSchema.optional(),
});

export const campaignListQuerySchema = z.object({
  status: campaignStatusSchema.optional(),
  creatorId: uuidSchema.optional(),
  search: z.string().trim().max(120).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['createdAt', '-createdAt', 'name', '-name', 'startAt', '-startAt']).default('-createdAt'),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type AssignCreatorInput = z.infer<typeof assignCreatorSchema>;
export type CreateCampaignCostInput = z.infer<typeof createCampaignCostSchema>;

/* --------------------------------------------------------------- creators */

export const createCreatorSchema = z.object({
  internalCode: z
    .string()
    .trim()
    .min(1, 'An internal code is required.')
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, 'Use letters, digits, dots, dashes or underscores.'),
  displayName: z.string().trim().min(1, 'A display name is required.').max(120),
  contactEmail: z.string().trim().toLowerCase().email().max(254).optional().nullable(),
  contactPhone: z.string().trim().max(40).optional().nullable(),
  platform: z.string().trim().max(60).optional().nullable(),
  niche: z.string().trim().max(80).optional().nullable(),
  profileUrl: z.string().trim().url().max(500).optional().nullable(),
  audienceLocation: z.string().trim().max(120).optional().nullable(),
  audienceLanguage: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const updateCreatorSchema = createCreatorSchema.partial().extend({
  internalCode: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const socialAccountSchema = z.object({
  platform: z.string().trim().min(1).max(60),
  handle: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(500).optional().nullable(),
  isPrimary: z.boolean().optional().default(false),
  verified: z.boolean().optional().default(false),
});

export const creatorListQuerySchema = z.object({
  platform: z.string().trim().max(60).optional(),
  niche: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['createdAt', '-createdAt', 'displayName', '-displayName']).default('displayName'),
});

export type CreateCreatorInput = z.infer<typeof createCreatorSchema>;
export type UpdateCreatorInput = z.infer<typeof updateCreatorSchema>;
