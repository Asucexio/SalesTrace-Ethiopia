'use client';

import * as React from 'react';
import type { AttributionDecisionReason, AttributionMethod, CampaignStatus, OrderStatus } from '@salestrace/shared-types';

import { Badge } from '@/components/ui/badge';

/** Human labels for the domain enumerations. */

const CAMPAIGN_STATUS_VARIANT: Record<CampaignStatus, 'default' | 'secondary' | 'success' | 'warning' | 'muted' | 'destructive'> = {
  draft: 'secondary',
  active: 'success',
  paused: 'warning',
  completed: 'muted',
  archived: 'muted',
};

const ORDER_STATUS_VARIANT: Record<OrderStatus, 'default' | 'secondary' | 'success' | 'warning' | 'muted' | 'destructive'> = {
  pending: 'warning',
  paid: 'success',
  cancelled: 'destructive',
  partially_refunded: 'secondary',
  refunded: 'muted',
};

export const ATTRIBUTION_METHOD_LABEL: Record<AttributionMethod, string> = {
  link: 'Tracking link',
  qr_link: 'QR link',
  coupon_code: 'Coupon code',
  referral_identifier: 'Referral identifier',
};

export const ATTRIBUTION_REASON_LABEL: Record<AttributionDecisionReason, string> = {
  last_eligible_click: 'Last eligible click',
  coupon_only: 'Coupon only',
  click_and_coupon_same_creator: 'Click and coupon — same creator',
  conflict_resolved_in_favor_of_coupon: 'Conflict resolved in favour of the coupon',
  referral_identifier_match: 'Referral identifier match',
  no_eligible_click: 'No eligible click',
  creator_not_assigned: 'Creator not assigned',
  no_creator_signal: 'No creator signal',
  campaign_not_eligible: 'Campaign not eligible',
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant={CAMPAIGN_STATUS_VARIANT[status] ?? 'secondary'} className="capitalize">
      {status}
    </Badge>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant={ORDER_STATUS_VARIANT[status] ?? 'secondary'} className="capitalize">
      {status.replace('_', ' ')}
    </Badge>
  );
}

export function AttributionMethodBadge({ method }: { method: AttributionMethod }) {
  return <Badge variant="outline">{ATTRIBUTION_METHOD_LABEL[method] ?? method}</Badge>;
}

export function AttributionReasonBadge({ reason }: { reason: AttributionDecisionReason }) {
  return <Badge variant="secondary">{ATTRIBUTION_REASON_LABEL[reason] ?? reason}</Badge>;
}
