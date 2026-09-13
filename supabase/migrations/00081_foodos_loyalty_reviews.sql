-- ============================================================
-- FoodOS Fase D (paridad take.app): lealtad y comunidad
-- 1. Programa de lealtad (puntos por gasto) + store credit
-- 2. Reseñas de pedidos con moderación
-- Idempotente.
-- ============================================================

-- 1. LEALTAD ----------------------------------------------------
-- Puntos y crédito viven en el cliente (CRM existente).
ALTER TABLE foodos_customers
  ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS store_credit NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Config del programa por restaurante:
-- points_per_100 = puntos ganados por cada $100 MXN gastados (default 10)
-- point_value    = valor en pesos de cada punto al canjear (default $1)
CREATE TABLE IF NOT EXISTS foodos_loyalty_programs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL UNIQUE REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  points_per_100  NUMERIC(8,2) NOT NULL DEFAULT 10,
  point_value     NUMERIC(10,2) NOT NULL DEFAULT 1,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE foodos_orders
  ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER NOT NULL DEFAULT 0;

-- 2. RESEÑAS ----------------------------------------------------
CREATE TABLE IF NOT EXISTS foodos_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  order_id        UUID REFERENCES foodos_orders(id) ON DELETE SET NULL,
  customer_name   TEXT,
  customer_phone  TEXT,
  item_id         UUID REFERENCES foodos_menu_items(id) ON DELETE SET NULL,
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  is_visible      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_foodos_reviews_rest ON foodos_reviews(restaurant_id, is_visible);
CREATE INDEX IF NOT EXISTS idx_foodos_reviews_order ON foodos_reviews(order_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE foodos_loyalty_programs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages loyalty program" ON foodos_loyalty_programs;
CREATE POLICY "Owner manages loyalty program" ON foodos_loyalty_programs
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "Public loyalty program" ON foodos_loyalty_programs;
CREATE POLICY "Public loyalty program" ON foodos_loyalty_programs
  FOR SELECT USING (is_active = true AND EXISTS (
    SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.status = 'active'
  ));

ALTER TABLE foodos_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages reviews" ON foodos_reviews;
CREATE POLICY "Owner manages reviews" ON foodos_reviews
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "Public reads visible reviews" ON foodos_reviews;
CREATE POLICY "Public reads visible reviews" ON foodos_reviews
  FOR SELECT USING (is_visible = true AND EXISTS (
    SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.status = 'active'
  ));

DROP POLICY IF EXISTS "Public can post reviews" ON foodos_reviews;
CREATE POLICY "Public can post reviews" ON foodos_reviews
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.status = 'active'
  ));

-- 3. ACUMULACIÓN DE PUNTOS AL ENTREGAR --------------------------
-- Cuando un pedido pasa a "delivered" y el programa está activo,
-- se acreditan puntos al cliente (una sola vez por pedido).
CREATE OR REPLACE FUNCTION foodos_award_loyalty_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_program RECORD;
  v_points INTEGER;
BEGIN
  IF NEW.status <> 'delivered' OR OLD.status = 'delivered' THEN
    RETURN NEW;
  END IF;
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_program
  FROM public.foodos_loyalty_programs
  WHERE restaurant_id = NEW.restaurant_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_points := floor((NEW.total / 100.0) * v_program.points_per_100);
  IF v_points <= 0 THEN
    RETURN NEW;
  END IF;

  NEW.loyalty_points_earned := v_points;

  UPDATE public.foodos_customers
  SET loyalty_points = loyalty_points + v_points
  WHERE id = NEW.customer_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_foodos_award_loyalty ON foodos_orders;
CREATE TRIGGER trg_foodos_award_loyalty
  BEFORE UPDATE OF status ON foodos_orders
  FOR EACH ROW
  EXECUTE FUNCTION foodos_award_loyalty_on_delivery();
