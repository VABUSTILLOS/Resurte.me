-- ============================================================
-- FoodOS Fase C (paridad take.app): conversión
-- 1. Tema de color por restaurante
-- 2. Cupones por restaurante
-- 3. Propina en el pedido
-- 4. Overrides de menú por sucursal (precio/disponibilidad)
-- 5. Pago por transferencia (CLABE) con confirmación manual
-- Idempotente.
-- ============================================================

-- 1. TEMA -----------------------------------------------------
ALTER TABLE foodos_restaurants
  ADD COLUMN IF NOT EXISTS theme_color TEXT;

-- 5. TRANSFERENCIA (datos bancarios del restaurante) ----------
ALTER TABLE foodos_restaurants
  ADD COLUMN IF NOT EXISTS transfer_clabe TEXT,
  ADD COLUMN IF NOT EXISTS transfer_bank TEXT,
  ADD COLUMN IF NOT EXISTS transfer_beneficiary TEXT;

-- 2. CUPONES --------------------------------------------------
CREATE TABLE IF NOT EXISTS foodos_coupons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value         NUMERIC(10,2) NOT NULL CHECK (value > 0),
  min_order     NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_uses      INTEGER,
  usage_count   INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, code)
);

-- 3. PROPINA + CUPÓN EN PEDIDO --------------------------------
ALTER TABLE foodos_orders
  ADD COLUMN IF NOT EXISTS tip NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT;

-- 4. OVERRIDES POR SUCURSAL -----------------------------------
-- price NULL = usa el precio base del ítem; is_available NULL = disponible
CREATE TABLE IF NOT EXISTS foodos_branch_menu_overrides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL REFERENCES foodos_branches(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES foodos_menu_items(id) ON DELETE CASCADE,
  price         NUMERIC(10,2) CHECK (price >= 0),
  is_available  BOOLEAN,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, item_id)
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_foodos_coupons_rest ON foodos_coupons(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_foodos_coupons_code ON foodos_coupons(restaurant_id, upper(code));
CREATE INDEX IF NOT EXISTS idx_foodos_overrides_branch ON foodos_branch_menu_overrides(branch_id);
CREATE INDEX IF NOT EXISTS idx_foodos_overrides_item ON foodos_branch_menu_overrides(item_id);

-- Función para registrar uso de cupón de forma atómica (llamada por el API
-- de pedidos con service role tras crear el pedido).
CREATE OR REPLACE FUNCTION increment_foodos_coupon_usage(p_restaurant_id UUID, p_code TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.foodos_coupons
  SET usage_count = usage_count + 1
  WHERE restaurant_id = p_restaurant_id AND upper(code) = upper(p_code);
$$;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE foodos_coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages coupons" ON foodos_coupons;
CREATE POLICY "Owner manages coupons" ON foodos_coupons
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

-- Lectura pública de cupones activos (el checkout los valida; la
-- autoridad final es el API de pedidos con service role).
DROP POLICY IF EXISTS "Public active coupons" ON foodos_coupons;
CREATE POLICY "Public active coupons" ON foodos_coupons
  FOR SELECT USING (is_active = true AND EXISTS (
    SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.status = 'active'
  ));

ALTER TABLE foodos_branch_menu_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages menu overrides" ON foodos_branch_menu_overrides;
CREATE POLICY "Owner manages menu overrides" ON foodos_branch_menu_overrides
  FOR ALL USING (EXISTS (
    SELECT 1 FROM foodos_branches b
    JOIN foodos_restaurants r ON r.id = b.restaurant_id
    WHERE b.id = branch_id AND r.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM foodos_branches b
    JOIN foodos_restaurants r ON r.id = b.restaurant_id
    WHERE b.id = branch_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Public menu overrides" ON foodos_branch_menu_overrides;
CREATE POLICY "Public menu overrides" ON foodos_branch_menu_overrides
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM foodos_branches b
    JOIN foodos_restaurants r ON r.id = b.restaurant_id
    WHERE b.id = branch_id AND r.status = 'active'
  ));
