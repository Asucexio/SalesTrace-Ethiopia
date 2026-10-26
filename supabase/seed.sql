-- ---------------------------------------------------------------------------
-- SalesTrace Ethiopia — demo data.
--
-- Everything in this file is DEMO data for development and evaluation. It is
-- clearly labelled as such in the product (the creators are named "Demo …" and
-- the campaigns are marked as demo campaigns) so it can never be mistaken for a
-- customer's real performance data.
--
-- The script refuses to run against NODE_ENV=production.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM organizations LIMIT 1) THEN
    RAISE NOTICE 'The database already contains data; the demo seed was skipped.';
    RETURN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Demo organization
-- ---------------------------------------------------------------------------
INSERT INTO organizations (id, name, slug, timezone, currency, settings)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Demo Brand Ethiopia',
  'demo-brand-ethiopia',
  'Africa/Addis_Ababa',
  'ETB',
  '{"isDemo": true}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Demo profile (owner)
-- ---------------------------------------------------------------------------
INSERT INTO profiles (id, auth_user_id, email, full_name, email_verified)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  'demo-owner',
  'demo.owner@example.et',
  'Demo Owner',
  true
);

INSERT INTO organization_members (organization_id, profile_id, role, status)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'owner',
  'active'
);

-- ---------------------------------------------------------------------------
-- Demo creators
-- ---------------------------------------------------------------------------
INSERT INTO creators (id, organization_id, internal_code, display_name, platform, niche, audience_location, audience_language, status)
VALUES
  ('33333333-3333-4333-8333-333333333331', '11111111-1111-4111-8111-111111111111', 'DEMO-MIRA', 'Demo Mira', 'instagram', 'beauty', 'Addis Ababa', 'am', 'active'),
  ('33333333-3333-4333-8333-333333333332', '11111111-1111-4111-8111-111111111111', 'DEMO-SELAM', 'Demo Selam', 'tiktok', 'fashion', 'Addis Ababa', 'am', 'active'),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'DEMO-ABEL', 'Demo Abel', 'youtube', 'tech', 'Bahir Dar', 'am', 'active');

-- ---------------------------------------------------------------------------
-- Demo campaigns
-- ---------------------------------------------------------------------------
INSERT INTO campaigns (
  id, organization_id, name, objective, description, status, start_at, end_at,
  budget_minor, currency, attribution_window_days, destination_url
)
VALUES
  ('44444444-4444-4444-8444-444444444441', '11111111-1111-4111-8111-111111111111', 'Demo Spring Launch', 'Drive first-time purchases', 'Demo campaign for evaluation.', 'active', '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', 25000000, 'ETB', 7, 'https://example.et/demo'),
  ('44444444-4444-4444-8444-444444444442', '11111111-1111-4111-8111-111111111111', 'Demo Creator Week', 'Grow awareness', 'Demo campaign for evaluation.', 'completed', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', 8000000, 'ETB', 7, 'https://example.et/demo2');

INSERT INTO campaign_creators (organization_id, campaign_id, creator_id, agreed_fee_minor, currency, assigned_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331', 5000000, 'ETB', '2026-02-20T00:00:00Z'),
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333332', 4000000, 'ETB', '2026-02-20T00:00:00Z');

INSERT INTO campaign_costs (organization_id, campaign_id, creator_id, cost_type, description, amount_minor, currency, incurred_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331', 'creator_fee', 'Demo agreed fee', 5000000, 'ETB', '2026-10-02T00:00:00Z'),
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333332', 'creator_fee', 'Demo agreed fee', 4000000, 'ETB', '2026-10-02T00:00:00Z'),
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', NULL, 'product_gifting', 'Demo product gifting', 1200000, 'ETB', '2026-10-03T00:00:00Z');

-- ---------------------------------------------------------------------------
-- Demo tracking assets
-- ---------------------------------------------------------------------------
INSERT INTO tracking_links (id, organization_id, campaign_id, creator_id, code, channel, label, destination_url)
VALUES
  ('f1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331', 'DEM0000001', 'link', 'Demo link', 'https://example.et/demo'),
  ('f1111111-1111-4111-8111-111111111112', '11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333332', 'DEM0000002', 'qr', 'Demo QR', 'https://example.et/demo');

INSERT INTO coupon_codes (organization_id, campaign_id, creator_id, code, discount_type, discount_value_minor, valid_from, valid_until)
VALUES
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331', 'DEMO-MIRA10', 'fixed', 100000, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'),
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333332', 'DEMO-SELAM15', 'percentage', NULL, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z');

-- ---------------------------------------------------------------------------
-- Demo activity for the Overview (October 2026)
-- ---------------------------------------------------------------------------
-- 100 clicks: 90 eligible (no fingerprint means no deduplication); 10 raw clicks
-- are deliberately outside the campaign's active window.
INSERT INTO tracking_events (
  organization_id, tracking_link_id, campaign_id, creator_id, event_type,
  occurred_at, visitor_token, fingerprint, repeat_count
)
SELECT
  '11111111-1111-4111-8111-111111111111',
  CASE WHEN n % 2 = 0 THEN 'f1111111-1111-4111-8111-111111111111'::uuid
       ELSE 'f1111111-1111-4111-8111-111111111112'::uuid END,
  '44444444-4444-4444-8444-444444444441',
  CASE WHEN n % 2 = 0 THEN '33333333-3333-4333-8333-333333333331'::uuid
       ELSE '33333333-3333-4333-8333-333333333332'::uuid END,
  'click',
  CASE WHEN n > 90 THEN '2026-09-25T12:00:00Z'::timestamptz
       ELSE '2026-10-01T09:00:00Z'::timestamptz + (n || ' hours')::interval END,
  'demo-visitor-' || n, NULL, 1
FROM generate_series(1, 100) AS n;

-- Ten paid attributed sales, one partial refund, two non-sale attributed orders,
-- plus one un-attributed paid order to make attribution coverage visible.
INSERT INTO orders (
  id, organization_id, external_order_id, source, ordered_at, currency,
  subtotal_minor, discount_minor, tax_minor, shipping_minor, total_paid_minor,
  status, coupon_code, referral_identifier
)
VALUES
  ('a1111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','DEMO-ORD-001','csv','2026-10-03T10:00:00Z','ETB',500000,10000,0,0,490000,'paid','DEMO-MIRA10',NULL),
  ('a1111111-1111-4111-8111-111111111112','11111111-1111-4111-8111-111111111111','DEMO-ORD-002','csv','2026-10-04T11:00:00Z','ETB',750000,15000,0,0,735000,'paid','DEMO-SELAM15',NULL),
  ('a1111111-1111-4111-8111-111111111113','11111111-1111-4111-8111-111111111111','DEMO-ORD-003','csv','2026-10-06T12:00:00Z','ETB',1200000,20000,0,0,1180000,'paid','DEMO-MIRA10',NULL),
  ('a1111111-1111-4111-8111-111111111114','11111111-1111-4111-8111-111111111111','DEMO-ORD-004','csv','2026-10-08T13:00:00Z','ETB',400000,0,0,0,400000,'paid','DEMO-SELAM15',NULL),
  ('a1111111-1111-4111-8111-111111111115','11111111-1111-4111-8111-111111111111','DEMO-ORD-005','csv','2026-10-10T14:00:00Z','ETB',950000,10000,0,0,940000,'partially_refunded','DEMO-MIRA10',NULL),
  ('a1111111-1111-4111-8111-111111111116','11111111-1111-4111-8111-111111111111','DEMO-ORD-006','csv','2026-10-12T15:00:00Z','ETB',600000,0,0,0,600000,'paid','DEMO-SELAM15',NULL),
  ('a1111111-1111-4111-8111-111111111117','11111111-1111-4111-8111-111111111111','DEMO-ORD-007','csv','2026-10-15T16:00:00Z','ETB',1500000,50000,0,0,1450000,'paid','DEMO-MIRA10',NULL),
  ('a1111111-1111-4111-8111-111111111118','11111111-1111-4111-8111-111111111111','DEMO-ORD-008','csv','2026-10-18T17:00:00Z','ETB',350000,0,0,0,350000,'paid','DEMO-SELAM15',NULL),
  ('a1111111-1111-4111-8111-111111111119','11111111-1111-4111-8111-111111111111','DEMO-ORD-009','csv','2026-10-21T18:00:00Z','ETB',800000,10000,0,0,790000,'paid','DEMO-MIRA10',NULL),
  ('a1111111-1111-4111-8111-111111111120','11111111-1111-4111-8111-111111111111','DEMO-ORD-010','csv','2026-10-24T19:00:00Z','ETB',1100000,0,0,0,1100000,'paid','DEMO-SELAM15',NULL),
  ('a1111111-1111-4111-8111-111111111121','11111111-1111-4111-8111-111111111111','DEMO-ORD-011','csv','2026-10-25T10:00:00Z','ETB',500000,0,0,0,0,'cancelled','DEMO-MIRA10',NULL),
  ('a1111111-1111-4111-8111-111111111122','11111111-1111-4111-8111-111111111111','DEMO-ORD-012','csv','2026-10-26T10:00:00Z','ETB',300000,0,0,0,0,'pending','DEMO-SELAM15',NULL),
  ('a1111111-1111-4111-8111-111111111123','11111111-1111-4111-8111-111111111111','DEMO-ORD-013','csv','2026-10-26T11:00:00Z','ETB',250000,0,0,0,250000,'paid',NULL,NULL);

INSERT INTO attributions (
  organization_id, order_id, campaign_id, creator_id, method, rule_version,
  rule_snapshot, decision_reason, matched_coupon_id, is_valid_sale
)
SELECT
  '11111111-1111-4111-8111-111111111111', o.id,
  '44444444-4444-4444-8444-444444444441',
  CASE WHEN o.coupon_code = 'DEMO-MIRA10' THEN '33333333-3333-4333-8333-333333333331'::uuid
       ELSE '33333333-3333-4333-8333-333333333332'::uuid END,
  'coupon_code', 'demo-v1', '{"demo":true}'::jsonb,
  'Matched demo coupon code', cc.id,
  (o.status IN ('paid','partially_refunded','refunded'))
FROM orders o
JOIN coupon_codes cc ON cc.organization_id = o.organization_id AND cc.code = o.coupon_code
WHERE o.organization_id = '11111111-1111-4111-8111-111111111111';

INSERT INTO refunds (organization_id, order_id, amount_minor, currency, reason, external_refund_id, refunded_at)
VALUES ('11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111115',100000,'ETB','Demo partial refund','DEMO-REF-001','2026-10-20T10:00:00Z');
