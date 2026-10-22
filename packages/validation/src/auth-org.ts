import { z } from 'zod';

import { moneySchema, uuidSchema } from './common.js';

/* ------------------------------------------------------------------ auth */

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Must be a valid email address.').max(254),
  password: z.string().min(10, 'Password must be at least 10 characters long.').max(200),
  fullName: z.string().trim().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Must be a valid email address.').max(254),
  password: z.string().min(1).max(200),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(10).max(512),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(10).max(512),
  newPassword: z.string().min(10, 'Password must be at least 10 characters long.').max(200),
});

export const switchOrganizationSchema = z.object({
  organizationId: uuidSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/* --------------------------------------------------------- organizations */

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Must be at least 2 characters long.').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/, 'Must be a lowercase URL-safe slug.')
    .optional(),
  timezone: z.string().min(1).max(64).default('Africa/Addis_Ababa'),
  currency: z.string().regex(/^[A-Z]{3}$/).default('ETB'),
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().min(1).max(64).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(['owner', 'admin', 'marketer', 'analyst']).default('analyst'),
  fullName: z.string().trim().min(1).max(120).optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'marketer', 'analyst']).optional(),
  status: z.enum(['active', 'invited', 'suspended']).optional(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(10).max(512),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/* ---------------------------------------------------------------- billing */

export const budgetSchema = moneySchema.optional().nullable();
