-- 0005_attribution.sql — the attribution decisions.
--
-- `UNIQUE (order_id)` guarantees that an order is attributed at most once, so it can never be
-- counted twice in a campaign report. Re-running attribution updates the existing row.

CREATE TABLE IF NOT EXISTS attributions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id           uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  campaign_id        uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id         uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  method             text NOT NULL CHECK (method IN ('link', 'qr_link', 'coupon_code', 'referral_identifier')),
  rule_version       text NOT NULL,
  rule_snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_reason    text NOT NULL,
  conflict_flag      boolean NOT NULL DEFAULT false,
  conflict_detail    jsonb,
  matched_event_id   uuid REFERENCES tracking_events(id) ON DELETE SET NULL,
  matched_coupon_id  uuid REFERENCES coupon_codes(id) ON DELETE SET NULL,
  is_valid_sale      boolean NOT NULL DEFAULT false,
  attributed_at      timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attributions_org_campaign ON attributions (organization_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_attributions_org_creator ON attributions (organization_id, creator_id);
CREATE INDEX IF NOT EXISTS idx_attributions_org_conflict ON attributions (organization_id, conflict_flag);
CREATE INDEX IF NOT EXISTS idx_attributions_org_method ON attributions (organization_id, method);

DROP TRIGGER IF EXISTS trg_attributions_updated_at ON attributions;
CREATE TRIGGER trg_attributions_updated_at
  BEFORE UPDATE ON attributions
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attributions_all ON attributions;
CREATE POLICY attributions_all ON attributions
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON attributions TO salestrace_app;
