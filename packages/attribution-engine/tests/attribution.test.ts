import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ATTRIBUTION_POLICY,
  decideAttribution,
  type AttributionInput,
  type CampaignInput,
  type CouponInput,
  type CreatorAssignmentInput,
  type OrderInput,
  type TrackingEventInput,
} from '../src/index.js';

const ORG = '11111111-1111-1111-1111-111111111111';

const CAMPAIGN_START = new Date('2026-03-01T00:00:00.000Z');
const CAMPAIGN_END = new Date('2026-04-01T00:00:00.000Z');

function campaign(overrides: Partial<CampaignInput> = {}): CampaignInput {
  return {
    id: 'campaign-1',
    organizationId: ORG,
    status: 'active',
    startAt: CAMPAIGN_START,
    endAt: CAMPAIGN_END,
    attributionWindowDays: 7,
    currency: 'ETB',
    ...overrides,
  };
}

function assignment(overrides: Partial<CreatorAssignmentInput> = {}): CreatorAssignmentInput {
  return {
    campaignId: 'campaign-1',
    creatorId: 'creator-1',
    assignedAt: new Date('2026-02-25T00:00:00.000Z'),
    ...overrides,
  };
}

function click(overrides: Partial<TrackingEventInput> = {}): TrackingEventInput {
  return {
    id: 'event-1',
    organizationId: ORG,
    campaignId: 'campaign-1',
    creatorId: 'creator-1',
    channel: 'link',
    occurredAt: new Date('2026-03-01T10:00:00.000Z'),
    sequence: 1,
    ...overrides,
  };
}

function coupon(overrides: Partial<CouponInput> = {}): CouponInput {
  return {
    id: 'coupon-1',
    organizationId: ORG,
    code: 'MIRA10',
    campaignId: 'campaign-1',
    creatorId: 'creator-1',
    isActive: true,
    validFrom: new Date('2026-03-01T00:00:00.000Z'),
    validUntil: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  };
}

function order(overrides: Partial<OrderInput> = {}): OrderInput {
  return {
    id: 'order-1',
    organizationId: ORG,
    externalOrderId: 'EXT-1001',
    orderedAt: new Date('2026-03-03T08:00:00.000Z'),
    currency: 'ETB',
    totalPaidMinor: 150000,
    status: 'paid',
    couponCode: null,
    referralIdentifier: null,
    refundMinor: 0,
    ...overrides,
  };
}

function input(overrides: Partial<AttributionInput> = {}): AttributionInput {
  return {
    order: order(),
    policy: DEFAULT_ATTRIBUTION_POLICY,
    campaigns: [campaign()],
    assignments: [assignment()],
    clickEvents: [],
    coupons: [],
    referralLink: null,
    ...overrides,
  };
}

describe('decideAttribution — link clicks', () => {
  it('attributes a plain link click inside the window (docs example A)', () => {
    const decision = decideAttribution(input({ clickEvents: [click()] }));

    expect(decision.attributed).toBe(true);
    expect(decision.creatorId).toBe('creator-1');
    expect(decision.campaignId).toBe('campaign-1');
    expect(decision.method).toBe('link');
    expect(decision.reason).toBe('last_eligible_click');
    expect(decision.conflictFlag).toBe(false);
    expect(decision.matchedEventId).toBe('event-1');
    expect(decision.isValidSale).toBe(true);
    expect(decision.ruleVersion).toBe('v1.0.0');
  });

  it('excludes a click that falls outside the 7-day window (docs example B)', () => {
    const decision = decideAttribution(
      input({
        order: order({ orderedAt: new Date('2026-03-09T10:00:01.000Z') }),
        clickEvents: [click()],
      }),
    );

    expect(decision.attributed).toBe(false);
    expect(decision.reason).toBe('no_eligible_click');
    expect(decision.creatorId).toBeNull();
  });

  it('includes a click exactly at the window boundary', () => {
    const decision = decideAttribution(
      input({
        order: order({ orderedAt: new Date('2026-03-08T10:00:00.000Z') }),
        clickEvents: [click()],
      }),
    );

    expect(decision.attributed).toBe(true);
  });

  it('excludes a click that happened after the order', () => {
    const decision = decideAttribution(
      input({
        order: order({ orderedAt: new Date('2026-03-01T09:00:00.000Z') }),
        clickEvents: [click({ occurredAt: new Date('2026-03-01T10:00:00.000Z') })],
      }),
    );

    expect(decision.attributed).toBe(false);
  });

  it('excludes a click before the campaign starts', () => {
    const decision = decideAttribution(
      input({
        campaigns: [campaign({ startAt: new Date('2026-03-02T00:00:00.000Z') })],
        clickEvents: [click()],
      }),
    );

    expect(decision.attributed).toBe(false);
    expect(decision.reason).toBe('no_eligible_click');
  });

  it('excludes a click after the campaign ends', () => {
    const decision = decideAttribution(
      input({
        campaigns: [campaign({ endAt: new Date('2026-03-01T09:00:00.000Z') })],
        clickEvents: [click()],
      }),
    );

    expect(decision.attributed).toBe(false);
  });

  it('excludes a click that happened before the creator was assigned (docs example K)', () => {
    const decision = decideAttribution(
      input({
        assignments: [assignment({ assignedAt: new Date('2026-03-05T00:00:00.000Z') })],
        clickEvents: [click()],
      }),
    );

    expect(decision.attributed).toBe(false);
  });

  it('ignores clicks from another organisation', () => {
    const decision = decideAttribution(
      input({ clickEvents: [click({ organizationId: '22222222-2222-2222-2222-222222222222' })] }),
    );

    expect(decision.attributed).toBe(false);
  });

  it('selects the last eligible click when two creators were clicked (docs example F)', () => {
    const decision = decideAttribution(
      input({
        assignments: [assignment(), assignment({ creatorId: 'creator-2' })],
        clickEvents: [
          click({ id: 'event-a', creatorId: 'creator-1', occurredAt: new Date('2026-03-02T09:00:00Z'), sequence: 1 }),
          click({ id: 'event-b', creatorId: 'creator-2', occurredAt: new Date('2026-03-02T10:00:00Z'), sequence: 2 }),
        ],
      }),
    );

    expect(decision.creatorId).toBe('creator-2');
    expect(decision.matchedEventId).toBe('event-b');
    expect(decision.reason).toBe('last_eligible_click');
  });

  it('breaks identical timestamps by insertion order (deterministic)', () => {
    const decision = decideAttribution(
      input({
        assignments: [assignment(), assignment({ creatorId: 'creator-2' })],
        clickEvents: [
          click({ id: 'event-first', creatorId: 'creator-1', sequence: 1 }),
          click({ id: 'event-second', creatorId: 'creator-2', sequence: 2 }),
        ],
      }),
    );

    expect(decision.creatorId).toBe('creator-2');
    expect(decision.matchedEventId).toBe('event-second');
  });

  it('reports the qr_link method for QR channels', () => {
    const decision = decideAttribution(input({ clickEvents: [click({ channel: 'qr' })] }));

    expect(decision.method).toBe('qr_link');
  });

  it('does not attribute a click from an unassigned creator (docs example J)', () => {
    const decision = decideAttribution(
      input({
        assignments: [],
        clickEvents: [click()],
      }),
    );

    expect(decision.attributed).toBe(false);
    expect(decision.reason).toBe('creator_not_assigned');
  });
});

describe('decideAttribution — coupons', () => {
  it('attributes a coupon-only order (docs example C)', () => {
    const decision = decideAttribution(
      input({ order: order({ couponCode: 'MIRA10' }), coupons: [coupon()] }),
    );

    expect(decision.attributed).toBe(true);
    expect(decision.creatorId).toBe('creator-1');
    expect(decision.method).toBe('coupon_code');
    expect(decision.reason).toBe('coupon_only');
    expect(decision.matchedCouponId).toBe('coupon-1');
    expect(decision.conflictFlag).toBe(false);
  });

  it('matches a coupon case-insensitively', () => {
    const decision = decideAttribution(
      input({ order: order({ couponCode: ' mira10 ' }), coupons: [coupon()] }),
    );

    expect(decision.attributed).toBe(true);
    expect(decision.method).toBe('coupon_code');
  });

  it('does not attribute an expired coupon', () => {
    const decision = decideAttribution(
      input({
        order: order({ couponCode: 'MIRA10', orderedAt: new Date('2026-03-05T00:00:00Z') }),
        coupons: [coupon({ validUntil: new Date('2026-03-01T00:00:00Z') })],
      }),
    );

    expect(decision.attributed).toBe(false);
  });

  it('does not attribute an inactive coupon', () => {
    const decision = decideAttribution(
      input({ order: order({ couponCode: 'MIRA10' }), coupons: [coupon({ isActive: false })] }),
    );

    expect(decision.attributed).toBe(false);
  });

  it('does not attribute a coupon whose creator is not assigned to the campaign', () => {
    const decision = decideAttribution(
      input({
        order: order({ couponCode: 'MIRA10' }),
        coupons: [coupon({ creatorId: 'creator-9' })],
        assignments: [assignment()],
      }),
    );

    expect(decision.attributed).toBe(false);
    expect(decision.reason).toBe('creator_not_assigned');
  });

  it('resolves a conflict in favour of the coupon and records the losing click (docs example D)', () => {
    const decision = decideAttribution(
      input({
        assignments: [assignment(), assignment({ creatorId: 'creator-2' })],
        order: order({ couponCode: 'MIRA10' }),
        coupons: [coupon({ creatorId: 'creator-2', id: 'coupon-2' })],
        clickEvents: [click({ creatorId: 'creator-1' })],
      }),
    );

    expect(decision.attributed).toBe(true);
    expect(decision.creatorId).toBe('creator-2');
    expect(decision.method).toBe('coupon_code');
    expect(decision.reason).toBe('conflict_resolved_in_favor_of_coupon');
    expect(decision.conflictFlag).toBe(true);
    expect(decision.conflictDetail).toMatchObject({
      resolvedInFavor: 'coupon',
      click: { creatorId: 'creator-1' },
    });
  });

  it('does not flag a conflict when the click and the coupon resolve to the same creator (docs example E)', () => {
    const decision = decideAttribution(
      input({
        order: order({ couponCode: 'MIRA10' }),
        coupons: [coupon()],
        clickEvents: [click()],
      }),
    );

    expect(decision.attributed).toBe(true);
    expect(decision.creatorId).toBe('creator-1');
    expect(decision.method).toBe('coupon_code');
    expect(decision.reason).toBe('click_and_coupon_same_creator');
    expect(decision.conflictFlag).toBe(false);
  });

  it('records an unusable coupon as a note rather than a conflict', () => {
    const decision = decideAttribution(
      input({
        order: order({ couponCode: 'MIRA10' }),
        coupons: [coupon({ isActive: false })],
        clickEvents: [click()],
      }),
    );

    expect(decision.attributed).toBe(true);
    expect(decision.reason).toBe('last_eligible_click');
    expect(decision.conflictFlag).toBe(false);
    expect(decision.notes).toMatchObject({ unusableCoupons: [{ code: 'MIRA10' }] });
  });
});

describe('decideAttribution — referral identifiers', () => {
  it('attributes an order carrying a tracking code (docs example: referral identifier)', () => {
    const decision = decideAttribution(
      input({
        order: order({ referralIdentifier: '7K2M9QX4PD' }),
        referralLink: {
          id: 'link-1',
          organizationId: ORG,
          campaignId: 'campaign-1',
          creatorId: 'creator-1',
          channel: 'link',
          isActive: true,
        },
      }),
    );

    expect(decision.attributed).toBe(true);
    expect(decision.method).toBe('referral_identifier');
    expect(decision.reason).toBe('referral_identifier_match');
    expect(decision.creatorId).toBe('creator-1');
  });

  it('does not attribute an inactive referral link', () => {
    const decision = decideAttribution(
      input({
        order: order({ referralIdentifier: '7K2M9QX4PD' }),
        referralLink: {
          id: 'link-1',
          organizationId: ORG,
          campaignId: 'campaign-1',
          creatorId: 'creator-1',
          channel: 'link',
          isActive: false,
        },
      }),
    );

    expect(decision.attributed).toBe(false);
  });
});

describe('decideAttribution — order validity', () => {
  it('keeps the attribution but marks a cancelled order as not a valid sale (docs example G)', () => {
    const decision = decideAttribution(
      input({ order: order({ status: 'cancelled' }), clickEvents: [click()] }),
    );

    expect(decision.attributed).toBe(true);
    expect(decision.isValidSale).toBe(false);
  });

  it('treats a pending order as not a valid sale', () => {
    const decision = decideAttribution(
      input({ order: order({ status: 'pending' }), clickEvents: [click()] }),
    );

    expect(decision.attributed).toBe(true);
    expect(decision.isValidSale).toBe(false);
  });

  it('treats a refunded order as a valid sale (docs example H)', () => {
    const decision = decideAttribution(
      input({
        order: order({ status: 'refunded', refundMinor: 150000 }),
        clickEvents: [click()],
      }),
    );

    expect(decision.isValidSale).toBe(true);
  });

  it('treats a zero-value order as not a valid sale', () => {
    const decision = decideAttribution(
      input({ order: order({ totalPaidMinor: 0 }), clickEvents: [click()] }),
    );

    expect(decision.isValidSale).toBe(false);
  });
});

describe('decideAttribution — no signal', () => {
  it('does not attribute an order with no creator signal', () => {
    const decision = decideAttribution(input());

    expect(decision.attributed).toBe(false);
    expect(decision.reason).toBe('no_creator_signal');
    expect(decision.method).toBeNull();
  });
});
