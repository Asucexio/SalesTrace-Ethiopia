/**
 * Domain enumerations shared by the API, the web app and the attribution engine.
 *
 * These constants are the single source of truth for values persisted in the database and
 * accepted at the API boundary. They intentionally have no runtime dependency on any framework.
 */

export const ORGANIZATION_ROLES = ['owner', 'admin', 'marketer', 'analyst'] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const MEMBER_STATUSES = ['active', 'invited', 'suspended'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CREATOR_STATUSES = ['active', 'inactive'] as const;
export type CreatorStatus = (typeof CREATOR_STATUSES)[number];

export const ATTRIBUTION_METHODS = [
  'link',
  'qr_link',
  'coupon_code',
  'referral_identifier',
] as const;
export type AttributionMethod = (typeof ATTRIBUTION_METHODS)[number];

export const ATTRIBUTION_DECISION_REASONS = [
  'last_eligible_click',
  'coupon_only',
  'click_and_coupon_same_creator',
  'conflict_resolved_in_favor_of_coupon',
  'referral_identifier_match',
  'no_eligible_click',
  'creator_not_assigned',
  'no_creator_signal',
  'campaign_not_eligible',
] as const;
export type AttributionDecisionReason = (typeof ATTRIBUTION_DECISION_REASONS)[number];

export const ORDER_STATUSES = [
  'pending',
  'paid',
  'cancelled',
  'partially_refunded',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Order statuses that represent a completed sale (money changed hands at least once). */
export const VALID_SALE_STATUSES: readonly OrderStatus[] = ['paid', 'partially_refunded', 'refunded'];

export const ORDER_SOURCES = ['csv', 'api', 'manual'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const COST_TYPES = [
  'creator_fee',
  'content_production',
  'product_gifting',
  'platform_fee',
  'agency_fee',
  'other',
] as const;
export type CostType = (typeof COST_TYPES)[number];

export const IMPORT_JOB_STATUSES = [
  'pending',
  'validating',
  'ready',
  'importing',
  'completed',
  'failed',
] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export const IMPORT_ROW_STATUSES = [
  'valid',
  'imported',
  'updated',
  'skipped',
  'duplicate',
  'invalid',
] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export const TRACKING_CHANNELS = ['link', 'qr'] as const;
export type TrackingChannel = (typeof TRACKING_CHANNELS)[number];

export const DISCOUNT_TYPES = ['percentage', 'fixed'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** Version of the attribution policy implemented by `packages/attribution-engine`. */
export const ATTRIBUTION_POLICY_VERSION = 'v1.0.0';

/** Default click attribution window in days. */
export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 7;

/** Minimum permitted attribution window in days. */
export const MIN_ATTRIBUTION_WINDOW_DAYS = 1;

/** Maximum permitted attribution window in days. */
export const MAX_ATTRIBUTION_WINDOW_DAYS = 90;

/**
 * Legal campaign status transitions.
 *
 * Enforced on the backend (`docs/api-specification.md` §4). `archived` is terminal.
 */
export const CAMPAIGN_STATUS_TRANSITIONS: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> =
  {
    draft: ['active', 'archived'],
    active: ['paused', 'completed', 'archived'],
    paused: ['active', 'completed', 'archived'],
    completed: ['archived'],
    archived: [],
  };

export function canTransitionCampaignStatus(
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  return CAMPAIGN_STATUS_TRANSITIONS[from].includes(to);
}

/** Organisation timezone default for the Ethiopian market. */
export const DEFAULT_TIMEZONE = 'Africa/Addis_Ababa';

/** Default reporting currency. */
export const DEFAULT_CURRENCY = 'ETB';
