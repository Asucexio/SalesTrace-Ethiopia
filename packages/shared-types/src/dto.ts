/**
 * API data-transfer objects.
 *
 * These are the shapes returned by the API and consumed by the web app. Monetary values are
 * transported as **decimal strings** (`"88500.00"`) so no client ever receives a float that
 * might round-trip incorrectly. Rates are plain numbers rounded half-up to 2 decimals, or `null`
 * when the denominator is zero.
 */

import type {
  AttributionDecisionReason,
  AttributionMethod,
  CampaignStatus,
  CostType,
  CreatorStatus,
  DiscountType,
  ImportJobStatus,
  ImportRowStatus,
  MemberStatus,
  OrderSource,
  OrderStatus,
  OrganizationRole,
  TrackingChannel,
} from './enums.js';

export interface ApiMeta {
  requestId: string;
  total?: number;
  limit?: number;
  offset?: number;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiFailure {
  error: ApiErrorBody;
  meta: ApiMeta;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/* ---------------------------------------------------------------- auth & orgs */

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  emailVerified: boolean;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  profileId: string;
  email: string;
  fullName: string | null;
  role: OrganizationRole;
  status: MemberStatus;
  invitedEmail: string | null;
  createdAt: string;
}

export interface SessionInfo {
  user: UserProfile;
  organization: Organization | null;
  role: OrganizationRole | null;
  memberships: Array<{ organizationId: string; organizationName: string; role: OrganizationRole }>;
}

/* ---------------------------------------------------------------- campaigns */

export interface Campaign {
  id: string;
  organizationId: string;
  name: string;
  objective: string | null;
  description: string | null;
  status: CampaignStatus;
  startAt: string;
  endAt: string | null;
  budget: string | null;
  currency: string;
  attributionWindowDays: number;
  attributionPolicyVersion: string;
  destinationUrl: string;
  creatorCount: number;
  costTotal: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignCreatorAssignment {
  id: string;
  campaignId: string;
  creatorId: string;
  creatorName: string;
  creatorInternalCode: string;
  agreedFee: string | null;
  currency: string;
  assignedAt: string;
  status: string;
  notes: string | null;
}

export interface CampaignCost {
  id: string;
  campaignId: string;
  creatorId: string | null;
  creatorName: string | null;
  costType: CostType;
  description: string | null;
  amount: string;
  currency: string;
  incurredAt: string;
  createdAt: string;
}

/* ---------------------------------------------------------------- creators */

export interface CreatorSocialAccount {
  id: string;
  creatorId: string;
  platform: string;
  handle: string;
  url: string | null;
  isPrimary: boolean;
  /** `false` means the value was entered manually and has not been verified by an integration. */
  verified: boolean;
}

export interface Creator {
  id: string;
  organizationId: string;
  internalCode: string;
  displayName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  platform: string | null;
  niche: string | null;
  profileUrl: string | null;
  audienceLocation: string | null;
  audienceLanguage: string | null;
  notes: string | null;
  status: CreatorStatus;
  socialAccounts: CreatorSocialAccount[];
  campaignCount?: number;
  createdAt: string;
  updatedAt: string;
}

/* ---------------------------------------------------------------- tracking */

export interface TrackingLink {
  id: string;
  organizationId: string;
  campaignId: string;
  campaignName: string;
  creatorId: string;
  creatorName: string;
  code: string;
  channel: TrackingChannel;
  label: string | null;
  destinationUrl: string;
  url: string;
  qrCodeUrl: string;
  isActive: boolean;
  createdAt: string;
}

export interface CouponCode {
  id: string;
  organizationId: string;
  campaignId: string;
  campaignName: string;
  creatorId: string;
  creatorName: string;
  code: string;
  discountType: DiscountType;
  discountPercent: string | null;
  discountValue: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface TrackingEvent {
  id: string;
  campaignId: string;
  campaignName: string;
  creatorId: string;
  creatorName: string;
  trackingLinkId: string;
  occurredAt: string;
  repeatCount: number;
  referrer: string | null;
}

/* ---------------------------------------------------------------- orders */

export interface OrderItem {
  id: string;
  sku: string | null;
  name: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface Refund {
  id: string;
  orderId: string;
  amount: string;
  currency: string;
  reason: string | null;
  externalRefundId: string | null;
  refundedAt: string;
}

export interface Order {
  id: string;
  organizationId: string;
  externalOrderId: string;
  source: OrderSource;
  orderedAt: string;
  currency: string;
  subtotal: string;
  discount: string;
  tax: string;
  shipping: string;
  totalPaid: string;
  status: OrderStatus;
  couponCode: string | null;
  referralIdentifier: string | null;
  refundTotal: string;
  netRevenue: string;
  isValidSale: boolean;
  attribution: Attribution | null;
  items?: OrderItem[];
  refunds?: Refund[];
  createdAt: string;
  updatedAt: string;
}

/* ---------------------------------------------------------------- attribution */

export interface Attribution {
  id: string;
  orderId: string;
  externalOrderId?: string;
  campaignId: string;
  campaignName?: string;
  creatorId: string;
  creatorName?: string;
  method: AttributionMethod;
  ruleVersion: string;
  ruleSnapshot: Record<string, unknown>;
  decisionReason: AttributionDecisionReason;
  conflictFlag: boolean;
  conflictDetail: Record<string, unknown> | null;
  matchedEventId: string | null;
  matchedCouponId: string | null;
  isValidSale: boolean;
  attributedAt: string;
}

/* ---------------------------------------------------------------- imports */

export interface ImportJob {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  status: ImportJobStatus;
  columnMapping: Record<string, string>;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  skippedRows: number;
  updatedRows: number;
  errorReportUrl: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ImportJobRow {
  id: string;
  rowNumber: number;
  status: ImportRowStatus;
  externalOrderId: string | null;
  errors: Array<{ code: string; message: string; field?: string }>;
  warnings: Array<{ code: string; message: string; field?: string }>;
  rawData: Record<string, unknown>;
}

/* ---------------------------------------------------------------- analytics */

export interface OverviewMetrics {
  totalClicks: number;
  eligibleClicks: number;
  attributedOrders: number;
  attributedValidOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  refundedOrders: number;
  refundAmount: string;
  grossAttributedOrderValue: string;
  netAttributedRevenue: string;
  campaignCost: string;
  creatorCost: string;
  conversionRate: number | null;
  costPerAttributedOrder: string | null;
  roas: number | null;
  conflictedAttributions: number;
  revenuePerCreator: string | null;
}

export interface CampaignPerformance {
  campaignId: string;
  campaignName: string;
  status: CampaignStatus;
  currency: string;
  startAt: string;
  endAt: string | null;
  creatorCount: number;
  totalClicks: number;
  eligibleClicks: number;
  attributedOrders: number;
  attributedValidOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  refundedOrders: number;
  grossAttributedOrderValue: string;
  refundAmount: string;
  netAttributedRevenue: string;
  campaignCost: string;
  creatorCost: string;
  conversionRate: number | null;
  costPerAttributedOrder: string | null;
  roas: number | null;
}

export interface CreatorPerformance {
  creatorId: string;
  creatorName: string;
  creatorInternalCode: string;
  platform: string | null;
  campaignCount: number;
  totalClicks: number;
  eligibleClicks: number;
  attributedOrders: number;
  attributedValidOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  refundedOrders: number;
  grossAttributedOrderValue: string;
  refundAmount: string;
  netAttributedRevenue: string;
  creatorCost: string;
  conversionRate: number | null;
  costPerAttributedOrder: string | null;
  roas: number | null;
  revenuePerCreator: string | null;
}

export interface TimeSeriesPoint {
  date: string;
  totalClicks: number;
  eligibleClicks: number;
  attributedOrders: number;
  attributedValidOrders: number;
  netAttributedRevenue: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: string;
}
