-- 0007_governance.sql — the audit trail and idempotency keys.

-- ---------------------------------------------------------------------------
-- audit_events — append-only
--
-- `UPDATE` and `DELETE` are revoked for the application role, and a trigger raises an
-- exception if anything tries. This makes the trail append-only *at the application level*.
-- It is not a claim of tamper-proofing: a database superuser can still alter rows.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role      text,
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       text,
  before          jsonb,
  after           jsonb,
  request_id      text,
  ip_hash         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_org_created ON audit_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events (entity_type, entity_id);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_select ON audit_events;
CREATE POLICY audit_events_select ON audit_events
  FOR SELECT
  USING (organization_id = app_current_org_id());

DROP POLICY IF EXISTS audit_events_insert ON audit_events;
CREATE POLICY audit_events_insert ON audit_events
  FOR INSERT
  WITH CHECK (organization_id = app_current_org_id());

REVOKE UPDATE, DELETE ON audit_events FROM salestrace_app;

CREATE OR REPLACE FUNCTION app_audit_events_append_only() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_append_only ON audit_events;
CREATE TRIGGER trg_audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION app_audit_events_append_only();

GRANT SELECT, INSERT ON audit_events TO salestrace_app;

-- ---------------------------------------------------------------------------
-- idempotency_keys — replay protection for write operations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 128),
  request_hash    text NOT NULL,
  status          text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT idempotency_keys_org_key_unique UNIQUE (organization_id, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expiry ON idempotency_keys (expires_at);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idempotency_keys_all ON idempotency_keys;
CREATE POLICY idempotency_keys_all ON idempotency_keys
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO salestrace_app;
