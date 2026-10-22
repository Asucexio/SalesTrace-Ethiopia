-- 0003_tracking.sql — tracking links, coupon codes and referral events.

-- ---------------------------------------------------------------------------
-- tracking_links
--
-- `code` is the only identifier exposed publicly. It is an opaque Crockford base32 string;
-- internal UUIDs never appear in a public URL.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tracking_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id      uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  code            text NOT NULL UNIQUE CHECK (code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  channel         text NOT NULL DEFAULT 'link' CHECK (channel IN ('link', 'qr')),
  label           text,
  destination_url text NOT NULL CHECK (destination_url ~ '^https://'),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tracking_links_org_code_unique UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_tracking_links_org_campaign ON tracking_links (organization_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_tracking_links_org_creator ON tracking_links (organization_id, creator_id);

DROP TRIGGER IF EXISTS trg_tracking_links_updated_at ON tracking_links;
CREATE TRIGGER trg_tracking_links_updated_at
  BEFORE UPDATE ON tracking_links
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE tracking_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracking_links_all ON tracking_links;
CREATE POLICY tracking_links_all ON tracking_links
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON tracking_links TO salestrace_app;

-- ---------------------------------------------------------------------------
-- coupon_codes
--
-- `creator_id` is NOT NULL by design: only creator-specific coupons are creator signals. A
-- site-wide coupon is not an attribution signal and is out of scope for the MVP.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS coupon_codes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id          uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id           uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  code                 text NOT NULL CHECK (code ~ '^[0-9A-Z][0-9A-Z-]{2,31}$'),
  discount_type        text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value_minor bigint CHECK (discount_value_minor IS NULL OR discount_value_minor >= 0),
  discount_percent     numeric(5,2) CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  max_redemptions      integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count     integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  valid_from           timestamptz,
  valid_until          timestamptz,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_codes_org_code_unique UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coupon_codes_org_campaign ON coupon_codes (organization_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_coupon_codes_org_code ON coupon_codes (organization_id, code);

DROP TRIGGER IF EXISTS trg_coupon_codes_updated_at ON coupon_codes;
CREATE TRIGGER trg_coupon_codes_updated_at
  BEFORE UPDATE ON coupon_codes
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE coupon_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coupon_codes_all ON coupon_codes;
CREATE POLICY coupon_codes_all ON coupon_codes
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON coupon_codes TO salestrace_app;

-- ---------------------------------------------------------------------------
-- tracking_events — referral events
--
-- `sequence` is a monotonic counter used as the deterministic tie-break when two clicks share
-- a timestamp. `fingerprint` and `ip_hash` are hashes: raw IP addresses are never stored.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tracking_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tracking_link_id uuid NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
  campaign_id      uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id       uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  event_type       text NOT NULL DEFAULT 'click' CHECK (event_type = 'click'),
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  sequence         bigserial NOT NULL,
  visitor_token    text,
  fingerprint      text,
  repeat_count     integer NOT NULL DEFAULT 1 CHECK (repeat_count >= 1),
  ip_hash          text,
  user_agent       text,
  referrer         text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_org_occurred ON tracking_events (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_campaign_occurred ON tracking_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_creator_occurred ON tracking_events (creator_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_link_occurred ON tracking_events (tracking_link_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_link_fingerprint ON tracking_events (tracking_link_id, fingerprint, occurred_at DESC);

ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracking_events_all ON tracking_events;
CREATE POLICY tracking_events_all ON tracking_events
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON tracking_events TO salestrace_app;
GRANT USAGE, SELECT ON SEQUENCE tracking_events_sequence_seq TO salestrace_app;
