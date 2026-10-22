-- 0008_local_auth.sql — local identity provider.
--
-- These tables are used ONLY when AUTH_MODE=local (development, CI and the E2E suite). In
-- production AUTH_MODE=supabase and Supabase Auth is the identity provider; the API refuses to
-- boot with AUTH_MODE=local when NODE_ENV=production.
--
-- They are global tables (not tenant owned): a session is not a tenant resource. Access is
-- controlled by the API, which only ever looks a session up by an opaque hashed token.

-- ---------------------------------------------------------------------------
-- auth_identities — scrypt password credentials
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS auth_identities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_auth_identities_updated_at ON auth_identities;
CREATE TRIGGER trg_auth_identities_updated_at
  BEFORE UPDATE ON auth_identities
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE auth_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_identities_all ON auth_identities;
CREATE POLICY auth_identities_all ON auth_identities
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON auth_identities TO salestrace_app;

-- ---------------------------------------------------------------------------
-- auth_tokens — email verification and password reset (single use)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password', 'invite')),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_profile ON auth_tokens (profile_id, purpose);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expiry ON auth_tokens (expires_at);

ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_tokens_all ON auth_tokens;
CREATE POLICY auth_tokens_all ON auth_tokens
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON auth_tokens TO salestrace_app;

-- ---------------------------------------------------------------------------
-- sessions — issued sessions (token stored hashed)
--
-- The API issues its own opaque session token and stores only its hash. The optional provider
-- columns hold the upstream identity-provider tokens (Supabase mode) so the API can refresh
-- them without asking the browser to do it.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sessions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id        uuid REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash             text NOT NULL UNIQUE,
  provider_access_token  text,
  provider_refresh_token text,
  provider_expires_at    timestamptz,
  expires_at             timestamptz NOT NULL,
  revoked_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions (profile_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_all ON sessions;
CREATE POLICY sessions_all ON sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO salestrace_app;
