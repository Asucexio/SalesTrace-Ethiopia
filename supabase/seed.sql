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
  ('44444444-4444-4444-8444-444444444441', '11111111-1111-4111-8111-111111111111', 'Demo Spring Launch', 'Drive first-time purchases', 'Demo campaign for evaluation.', 'active', '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z', 25000000, 'ETB', 7, 'https://example.et/demo'),
  ('44444444-4444-4444-8444-444444444442', '11111111-1111-4111-8111-111111111111', 'Demo Creator Week', 'Grow awareness', 'Demo campaign for evaluation.', 'draft', '2026-04-05T00:00:00Z', '2026-04-20T00:00:00Z', 8000000, 'ETB', 7, 'https://example.et/demo2');

INSERT INTO campaign_creators (organization_id, campaign_id, creator_id, agreed_fee_minor, currency, assigned_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331', 5000000, 'ETB', '2026-02-20T00:00:00Z'),
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333332', 4000000, 'ETB', '2026-02-20T00:00:00Z');

INSERT INTO campaign_costs (organization_id, campaign_id, creator_id, cost_type, description, amount_minor, currency, incurred_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331', 'creator_fee', 'Demo agreed fee', 5000000, 'ETB', '2026-02-25T00:00:00Z'),
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333332', 'creator_fee', 'Demo agreed fee', 4000000, 'ETB', '2026-02-25T00:00:00Z'),
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', NULL, 'product_gifting', 'Demo product gifting', 1200000, 'ETB', '2026-03-02T00:00:00Z');

-- ---------------------------------------------------------------------------
-- Demo tracking assets
-- ---------------------------------------------------------------------------
INSERT INTO tracking_links (organization_id, campaign_id, creator_id, code, channel, label, destination_url)
VALUES
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331', 'DEM0000001', 'link', 'Demo link', 'https://example.et/demo'),
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333332', 'DEM0000002', 'qr', 'Demo QR', 'https://example.et/demo');

INSERT INTO coupon_codes (organization_id, campaign_id, creator_id, code, discount_type, discount_value_minor, valid_from, valid_until)
VALUES
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333331', 'DEMO-MIRA10', 'fixed', 100000, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z'),
  ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333332', 'DEMO-SELAM15', 'percentage', NULL, '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z');
