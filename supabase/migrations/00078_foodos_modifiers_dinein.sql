-- ============================================================
-- FoodOS Fase A (paridad take.app):
-- 1. Modificadores de platillos (grupos de opciones + valores)
-- 2. Dine-in: activación por sucursal + número de mesa en pedido
-- Idempotente.
-- ============================================================

-- 1. GRUPOS DE OPCIONES --------------------------------------
-- Ej.: "Tamaño" (requerido, elige 1), "Extras" (opcional, 0-4)
CREATE TABLE IF NOT EXISTS foodos_item_option_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES foodos_menu_items(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  is_required   BOOLEAN NOT NULL DEFAULT false,
  min_select    INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select    INTEGER NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. VALORES DE OPCIÓN ---------------------------------------
-- Ej.: "Grande +$25", "Queso extra +$15"
CREATE TABLE IF NOT EXISTS foodos_item_option_values (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES foodos_item_option_groups(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  price_delta   NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_available  BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. DINE-IN ---------------------------------------------------
ALTER TABLE foodos_branches
  ADD COLUMN IF NOT EXISTS dine_in_active BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE foodos_orders
  ADD COLUMN IF NOT EXISTS table_number TEXT;

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_foodos_option_groups_item ON foodos_item_option_groups(item_id);
CREATE INDEX IF NOT EXISTS idx_foodos_option_groups_rest ON foodos_item_option_groups(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_foodos_option_values_group ON foodos_item_option_values(group_id);
CREATE INDEX IF NOT EXISTS idx_foodos_option_values_rest ON foodos_item_option_values(restaurant_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE foodos_item_option_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages option groups" ON foodos_item_option_groups;
CREATE POLICY "Owner manages option groups" ON foodos_item_option_groups
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "Public option groups" ON foodos_item_option_groups;
CREATE POLICY "Public option groups" ON foodos_item_option_groups
  FOR SELECT USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.status = 'active'));

ALTER TABLE foodos_item_option_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages option values" ON foodos_item_option_values;
CREATE POLICY "Owner manages option values" ON foodos_item_option_values
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "Public option values" ON foodos_item_option_values;
CREATE POLICY "Public option values" ON foodos_item_option_values
  FOR SELECT USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.status = 'active'));
