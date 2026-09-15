-- ============================================================
-- FoodOS Fase F (paridad take.app):
-- 1. Pedidos programados (fecha/hora) + lead time por sucursal
-- 2. Webhooks salientes por restaurante (nuevo pedido → URL externa)
-- 3. Pixels de marketing por restaurante (Meta/TikTok)
-- Idempotente.
-- ============================================================

-- 1. PEDIDOS PROGRAMADOS --------------------------------------
ALTER TABLE foodos_orders
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

ALTER TABLE foodos_branches
  ADD COLUMN IF NOT EXISTS scheduled_orders_active BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_minutes INTEGER NOT NULL DEFAULT 30;

-- 2. WEBHOOKS SALIENTES ---------------------------------------
CREATE TABLE IF NOT EXISTS foodos_webhooks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  secret        TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS foodos_webhook_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    UUID NOT NULL REFERENCES foodos_webhooks(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES foodos_orders(id) ON DELETE SET NULL,
  event         TEXT NOT NULL DEFAULT 'order.created',
  response_code INTEGER,
  success       BOOLEAN NOT NULL DEFAULT false,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. PIXELS -----------------------------------------------------
ALTER TABLE foodos_restaurants
  ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_pixel_id TEXT;

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_foodos_orders_scheduled ON foodos_orders(scheduled_for) WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_foodos_webhooks_rest ON foodos_webhooks(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_foodos_webhook_deliveries_hook ON foodos_webhook_deliveries(webhook_id, attempted_at DESC);

-- ============================================================
-- RLS (solo dueño; las entregas se escriben con service role)
-- ============================================================
ALTER TABLE foodos_webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages webhooks" ON foodos_webhooks;
CREATE POLICY "Owner manages webhooks" ON foodos_webhooks
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner reads deliveries" ON foodos_webhook_deliveries;
CREATE POLICY "Owner reads deliveries" ON foodos_webhook_deliveries
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM foodos_webhooks w
    JOIN foodos_restaurants r ON r.id = w.restaurant_id
    WHERE w.id = webhook_id AND r.user_id = auth.uid()
  ));
