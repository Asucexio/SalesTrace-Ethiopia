-- 0004_orders.sql — imported orders, order items and append-only refunds.

-- ---------------------------------------------------------------------------
-- orders
--
-- `UNIQUE (organization_id, external_order_id)` is the duplicate-order guard: re-importing the
-- same file reconciles the existing row instead of creating a second one.
--
-- All monetary columns are integer minor units (1 ETB = 100 santim). There is no floating point
-- representation of money anywhere in this schema.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_order_id    text NOT NULL CHECK (char_length(external_order_id) BETWEEN 1 AND 120),
  source               text NOT NULL DEFAULT 'csv' CHECK (source IN ('csv', 'api', 'manual')),
  ordered_at           timestamptz NOT NULL,
  currency             text NOT NULL DEFAULT 'ETB' CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_minor       bigint NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  discount_minor       bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  tax_minor            bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  shipping_minor       bigint NOT NULL DEFAULT 0 CHECK (shipping_minor >= 0),
  total_paid_minor     bigint NOT NULL DEFAULT 0 CHECK (total_paid_minor >= 0),
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'paid', 'cancelled', 'partially_refunded', 'refunded')),
  coupon_code          text,
  referral_identifier  text,
  customer_ref_hash    text,
  source_import_id     uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_org_external_unique UNIQUE (organization_id, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_org_ordered ON orders (organization_id, ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_org_status ON orders (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_org_coupon ON orders (organization_id, coupon_code);
CREATE INDEX IF NOT EXISTS idx_orders_org_referral ON orders (organization_id, referral_identifier);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_all ON orders;
CREATE POLICY orders_all ON orders
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO salestrace_app;

-- ---------------------------------------------------------------------------
-- order_items — optional line detail
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku               text,
  name              text,
  quantity          integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_minor  bigint NOT NULL DEFAULT 0 CHECK (unit_price_minor >= 0),
  line_total_minor  bigint NOT NULL DEFAULT 0 CHECK (line_total_minor >= 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_items_all ON order_items;
CREATE POLICY order_items_all ON order_items
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON order_items TO salestrace_app;

-- ---------------------------------------------------------------------------
-- refunds — append-only
--
-- A refund is never overwritten. Re-importing the same source refund must not create a second
-- row, which is why (order_id, external_refund_id) is unique where the external id exists.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS refunds (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_minor        bigint NOT NULL CHECK (amount_minor > 0),
  currency            text NOT NULL DEFAULT 'ETB' CHECK (currency ~ '^[A-Z]{3}$'),
  reason              text,
  external_refund_id  text,
  refunded_at         timestamptz NOT NULL,
  source_import_id    uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds (order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_org_refunded ON refunds (organization_id, refunded_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_unique_external
  ON refunds (order_id, external_refund_id)
  WHERE external_refund_id IS NOT NULL;

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refunds_all ON refunds;
CREATE POLICY refunds_all ON refunds
  FOR ALL
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON refunds TO salestrace_app;
