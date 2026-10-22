-- 0006_imports.sql — CSV import jobs and per-row outcomes.

-- ---------------------------------------------------------------------------
-- import_jobs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS import_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_name          text NOT NULL,
  file_size_bytes    integer NOT NULL CHECK (file_size_bytes >= 0),
  storage_path       text,
  checksum           text,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'validating', 'ready', 'importing', 'completed', 'failed')),
  column_mapping     jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_rows         integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows         integer NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows       integer NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  imported_rows      integer NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
  skipped_rows       integer NOT NULL DEFAULT 0 CHECK (skipped_rows >= 0),
  updated_rows       integer NOT NULL DEFAULT 0 CHECK (updated_rows >= 0),
  error_report_path  text,
  idempotency_key    text,
  created_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_org_created ON import_jobs (organization_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_import_jobs_idempotency
  ON import_jobs (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_jobs_all ON import_jobs;
CREATE POLICY import_jobs_all ON import_jobs
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON import_jobs TO salestrace_app;

-- ---------------------------------------------------------------------------
-- import_job_rows — validation outcome for every source row
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS import_job_rows (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_job_id      uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number         integer NOT NULL CHECK (row_number > 0),
  raw_data           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             text NOT NULL CHECK (status IN ('valid', 'imported', 'updated', 'skipped', 'duplicate', 'invalid')),
  errors             jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings           jsonb NOT NULL DEFAULT '[]'::jsonb,
  external_order_id  text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_job_rows_job ON import_job_rows (import_job_id, row_number);
CREATE INDEX IF NOT EXISTS idx_import_job_rows_status ON import_job_rows (import_job_id, status);

ALTER TABLE import_job_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_job_rows_all ON import_job_rows;
CREATE POLICY import_job_rows_all ON import_job_rows
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON import_job_rows TO salestrace_app;

-- ---------------------------------------------------------------------------
-- Deferred foreign keys
--
-- `orders` and `refunds` were created before `import_jobs`, so their reference is added here.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_source_import_fk') THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_source_import_fk
      FOREIGN KEY (source_import_id) REFERENCES import_jobs(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_source_import_fk') THEN
    ALTER TABLE refunds
      ADD CONSTRAINT refunds_source_import_fk
      FOREIGN KEY (source_import_id) REFERENCES import_jobs(id) ON DELETE SET NULL;
  END IF;
END
$$;
