-- 0001_init.sql — roles, helper functions, and the identity/tenant tables.
--
-- Every organization-owned table in this file gets its Row Level Security policy immediately,
-- so a table is never briefly unprotected between migrations.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

-- The application role. It has NOBYPASSRLS, so every query it runs is subject to the RLS
-- policies below. The API issues `SET LOCAL ROLE salestrace_app` inside each transaction.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'salestrace_app') THEN
    CREATE ROLE salestrace_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- Returns the organization id of the current transaction context.
--
-- `current_setting(..., true)` yields NULL when the setting is absent, so the function returns
-- NULL and every policy predicate evaluates to NULL — i.e. **no rows are visible**. The system
-- fails closed rather than open.
CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid;
$$;

-- Returns the profile id of the current request (the acting user).
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- Keeps `updated_at` honest without relying on application code.
CREATE OR REPLACE FUNCTION app_set_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- profiles — global user records (not tenant owned)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    text NOT NULL UNIQUE,
  email           text NOT NULL,
  full_name       text,
  avatar_url      text,
  email_verified  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (lower(email));

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- The SELECT policy is created at the end of this migration: it references
-- `organization_members`, and PostgreSQL validates policy expressions when the policy is created.
-- Until then the table has RLS enabled with no policy, which denies everything — fail closed.
DROP POLICY IF EXISTS profiles_insert ON profiles;
CREATE POLICY profiles_insert ON profiles
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles
  FOR UPDATE
  USING (id = app_current_user_id())
  WITH CHECK (id = app_current_user_id());

GRANT SELECT, INSERT, UPDATE ON profiles TO salestrace_app;

-- ---------------------------------------------------------------------------
-- organizations — tenant root
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  timezone    text NOT NULL DEFAULT 'Africa/Addis_Ababa',
  currency    text NOT NULL DEFAULT 'ETB' CHECK (currency ~ '^[A-Z]{3}$'),
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_insert ON organizations;
-- Creating an organization happens before the caller is a member of it, so the policy cannot
-- require an organization context. The operation is performed by the authenticated API, which
-- creates the owner membership in the same transaction and audits it.
CREATE POLICY organizations_insert ON organizations
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS organizations_update ON organizations;
CREATE POLICY organizations_update ON organizations
  FOR UPDATE
  USING (id = app_current_org_id())
  WITH CHECK (id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE ON organizations TO salestrace_app;

-- ---------------------------------------------------------------------------
-- organization_members — tenant membership and roles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role              text NOT NULL DEFAULT 'analyst'
                    CHECK (role IN ('owner', 'admin', 'marketer', 'analyst')),
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'invited', 'suspended')),
  invited_email     text,
  invitation_token  text UNIQUE,
  invited_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_members_unique UNIQUE (organization_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_profile ON organization_members (profile_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_status ON organization_members (organization_id, status);

DROP TRIGGER IF EXISTS trg_org_members_updated_at ON organization_members;
CREATE TRIGGER trg_org_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_members_select ON organization_members;
CREATE POLICY organization_members_select ON organization_members
  FOR SELECT
  USING (
    organization_id = app_current_org_id()
    OR profile_id = app_current_user_id()
  );

DROP POLICY IF EXISTS organization_members_insert ON organization_members;
CREATE POLICY organization_members_insert ON organization_members
  FOR INSERT
  WITH CHECK (organization_id = app_current_org_id());

DROP POLICY IF EXISTS organization_members_update ON organization_members;
CREATE POLICY organization_members_update ON organization_members
  FOR UPDATE
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

DROP POLICY IF EXISTS organization_members_delete ON organization_members;
CREATE POLICY organization_members_delete ON organization_members
  FOR DELETE
  USING (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON organization_members TO salestrace_app;

-- ---------------------------------------------------------------------------
-- The profiles read policy
--
-- A profile is visible to its owner and to the members of the organization it belongs to.
-- It is created last because it references `organization_members`.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles
  FOR SELECT
  USING (
    id = app_current_user_id()
    OR EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.profile_id = profiles.id
        AND m.organization_id = app_current_org_id()
    )
  );

-- ---------------------------------------------------------------------------
-- The organizations read policy
--
-- An organization is visible to the members of that organization. Created last because it
-- references `organization_members`.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS organizations_select ON organizations;
CREATE POLICY organizations_select ON organizations
  FOR SELECT
  USING (
    id = app_current_org_id()
    OR EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.organization_id = organizations.id
        AND m.profile_id = app_current_user_id()
    )
  );
