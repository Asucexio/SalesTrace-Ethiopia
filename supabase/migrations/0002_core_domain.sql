-- 0002_core_domain.sql — creators, campaigns, assignments and campaign costs.

-- ---------------------------------------------------------------------------
-- creators
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS creators (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  internal_code       text NOT NULL CHECK (char_length(internal_code) BETWEEN 1 AND 40),
  display_name        text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  contact_email       text,
  contact_phone       text,
  platform            text,
  niche               text,
  profile_url         text,
  audience_location  text,
  audience_language   text,
  notes               text,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creators_org_internal_code_unique UNIQUE (organization_id, internal_code)
);

CREATE INDEX IF NOT EXISTS idx_creators_org_name ON creators (organization_id, display_name);
CREATE INDEX IF NOT EXISTS idx_creators_org_platform ON creators (organization_id, platform);

DROP TRIGGER IF EXISTS trg_creators_updated_at ON creators;
CREATE TRIGGER trg_creators_updated_at
  BEFORE UPDATE ON creators
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE creators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creators_all ON creators;
CREATE POLICY creators_all ON creators
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON creators TO salestrace_app;

-- ---------------------------------------------------------------------------
-- creator_social_accounts
--
-- `verified = false` marks a manually entered account. The platform never fabricates platform
-- metrics; an account is only "verified" when a verified integration supplied it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS creator_social_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  creator_id      uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  platform        text NOT NULL,
  handle          text NOT NULL,
  url             text,
  is_primary      boolean NOT NULL DEFAULT false,
  verified        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_social_accounts_unique UNIQUE (creator_id, platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_creator_social_accounts_creator ON creator_social_accounts (creator_id);

DROP TRIGGER IF EXISTS trg_creator_social_accounts_updated_at ON creator_social_accounts;
CREATE TRIGGER trg_creator_social_accounts_updated_at
  BEFORE UPDATE ON creator_social_accounts
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE creator_social_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creator_social_accounts_all ON creator_social_accounts;
CREATE POLICY creator_social_accounts_all ON creator_social_accounts
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON creator_social_accounts TO salestrace_app;

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaigns (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                     text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  objective                text,
  description              text,
  status                   text NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  start_at                 timestamptz NOT NULL,
  end_at                   timestamptz,
  budget_minor             bigint CHECK (budget_minor IS NULL OR budget_minor >= 0),
  currency                 text NOT NULL DEFAULT 'ETB' CHECK (currency ~ '^[A-Z]{3}$'),
  attribution_window_days  integer NOT NULL DEFAULT 7
                            CHECK (attribution_window_days BETWEEN 1 AND 90),
  attribution_policy_version text NOT NULL DEFAULT 'v1.0.0',
  destination_url          text NOT NULL CHECK (destination_url ~ '^https://'),
  created_by               uuid REFERENCES profiles(id) ON DELETE SET NULL,
  archived_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_dates_ordered CHECK (end_at IS NULL OR end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON campaigns (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_start ON campaigns (organization_id, start_at);

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_all ON campaigns;
CREATE POLICY campaigns_all ON campaigns
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO salestrace_app;

-- ---------------------------------------------------------------------------
-- campaign_creators — assignment with agreed compensation
--
-- `assigned_at` is the lower bound for click eligibility (rule C7) and may be back-dated by a
-- marketer when a creator was genuinely part of the campaign earlier than the record was made.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaign_creators (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id       uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id        uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  agreed_fee_minor  bigint CHECK (agreed_fee_minor IS NULL OR agreed_fee_minor >= 0),
  currency          text NOT NULL DEFAULT 'ETB' CHECK (currency ~ '^[A-Z]{3}$'),
  assigned_at       timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_creators_unique UNIQUE (campaign_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_creators_org_creator ON campaign_creators (organization_id, creator_id);
CREATE INDEX IF NOT EXISTS idx_campaign_creators_campaign ON campaign_creators (campaign_id);

DROP TRIGGER IF EXISTS trg_campaign_creators_updated_at ON campaign_creators;
CREATE TRIGGER trg_campaign_creators_updated_at
  BEFORE UPDATE ON campaign_creators
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE campaign_creators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_creators_all ON campaign_creators;
CREATE POLICY campaign_creators_all ON campaign_creators
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_creators TO salestrace_app;

-- ---------------------------------------------------------------------------
-- campaign_costs — the ledger of actual spend
--
-- `campaign_creators.agreed_fee_minor` records what was *agreed*; this table records what was
-- actually spent. The two are reported side by side and never summed together.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaign_costs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id      uuid REFERENCES creators(id) ON DELETE SET NULL,
  cost_type       text NOT NULL CHECK (cost_type IN (
                    'creator_fee', 'content_production', 'product_gifting',
                    'platform_fee', 'agency_fee', 'other')),
  description     text,
  amount_minor    bigint NOT NULL CHECK (amount_minor >= 0),
  currency        text NOT NULL DEFAULT 'ETB' CHECK (currency ~ '^[A-Z]{3}$'),
  incurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_costs_campaign ON campaign_costs (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_costs_org_creator ON campaign_costs (organization_id, creator_id);

ALTER TABLE campaign_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_costs_all ON campaign_costs;
CREATE POLICY campaign_costs_all ON campaign_costs
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON campaign_costs TO salestrace_app;
