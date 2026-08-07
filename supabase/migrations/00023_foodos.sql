-- ============================================================
-- Resurte.me — FoodOS: Sistema de pedidos y cross-selling
-- Herramientas gratuitas para clientes restauranteros:
-- canal de pedidos directo, menú digital, combos/cross-sell,
-- CRM y recurrencia, tablero de datos.
-- ============================================================

-- 1. RESTAURANTES -------------------------------------------------
CREATE TABLE IF NOT EXISTS foodos_restaurants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  logo_url      TEXT,
  description   TEXT,
  collection_id BIGINT REFERENCES restaurant_collections(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'draft',  -- draft | active | paused
  currency      TEXT NOT NULL DEFAULT 'MXN',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. SUCURSALES ---------------------------------------------------
CREATE TABLE IF NOT EXISTS foodos_branches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  address         TEXT,
  lat             NUMERIC(10,7),
  lng             NUMERIC(10,7),
  phone           TEXT,
  pickup_active   BOOLEAN NOT NULL DEFAULT true,
  delivery_active BOOLEAN NOT NULL DEFAULT false,
  delivery_fee    NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_order       NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. MENÚ ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS foodos_menu_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS foodos_menu_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES foodos_menu_categories(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost          NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  image_url     TEXT,
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  is_available  BOOLEAN NOT NULL DEFAULT true,
  tags          JSONB NOT NULL DEFAULT '[]',   -- ["favorito","para compartir"]
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. COMBOS -------------------------------------------------------
CREATE TABLE IF NOT EXISTS foodos_combos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  price         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  item_ids      JSONB NOT NULL DEFAULT '[]',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  highlight     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. REGLAS DE CROSS-SELL / UPSELL --------------------------------
-- trigger_type: product | category | min_ticket
CREATE TABLE IF NOT EXISTS foodos_upsell_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('product','category','min_ticket')),
  trigger_value   JSONB NOT NULL DEFAULT '{}',  -- {item_id|category_id|min_ticket}
  suggested_items JSONB NOT NULL DEFAULT '[]',  -- [item_ids]
  offer_text      TEXT,
  boost_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. CLIENTES (CRM) -----------------------------------------------
CREATE TABLE IF NOT EXISTS foodos_customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  phone         TEXT NOT NULL,
  name          TEXT,
  email         TEXT,
  total_orders  INTEGER NOT NULL DEFAULT 0,
  total_spend   NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  segment       TEXT NOT NULL DEFAULT 'nuevo',  -- nuevo | recurrente | vip | inactivo
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, phone)
);

-- 7. PEDIDOS DEL RESTAURANTE --------------------------------------
CREATE TABLE IF NOT EXISTS foodos_orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id           UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  branch_id               UUID REFERENCES foodos_branches(id) ON DELETE SET NULL,
  customer_id             UUID REFERENCES foodos_customers(id) ON DELETE SET NULL,
  items                   JSONB NOT NULL DEFAULT '[]',  -- [{item_id,name,price,qty,combo_id}]
  subtotal                NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount                NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_fee            NUMERIC(10,2) NOT NULL DEFAULT 0,
  total                   NUMERIC(10,2) NOT NULL DEFAULT 0,
  channel                 TEXT NOT NULL DEFAULT 'web',   -- web | qr | whatsapp
  fulfillment             TEXT NOT NULL DEFAULT 'pickup',-- delivery | pickup | dine_in
  status                  TEXT NOT NULL DEFAULT 'pending',
  payment_method          TEXT,
  payment_status          TEXT NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id TEXT,
  slug                    TEXT,   -- slug del restaurante (redundante para filtros rápidos)
  customer_name           TEXT,
  customer_phone          TEXT,
  note                    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. AUTOMATIZACIONES DE RECURRENCIA ------------------------------
CREATE TABLE IF NOT EXISTS foodos_automations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('order_confirmation','thank_you','winback','season_promo','off_hours','new_product')),
  name            TEXT NOT NULL,
  trigger_config  JSONB NOT NULL DEFAULT '{}',  -- {days_without_order, hours_after, season, target_segment}
  message         TEXT,
  incentive_config JSONB NOT NULL DEFAULT '{}', -- {discount_pct, promo_code}
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. CAMPAÑAS / EJECUCIONES ---------------------------------------
CREATE TABLE IF NOT EXISTS foodos_campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  automation_id UUID REFERENCES foodos_automations(id) ON DELETE SET NULL,
  customer_id   UUID REFERENCES foodos_customers(id) ON DELETE SET NULL,
  scheduled_for TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | sent | failed | cancelled
  channel       TEXT NOT NULL DEFAULT 'whatsapp',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_foodos_restaurants_user  ON foodos_restaurants(user_id);
CREATE INDEX IF NOT EXISTS idx_foodos_branches_rest     ON foodos_branches(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_foodos_categories_rest   ON foodos_menu_categories(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_foodos_items_rest        ON foodos_menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_foodos_items_category    ON foodos_menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_foodos_combos_rest       ON foodos_combos(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_foodos_rules_rest        ON foodos_upsell_rules(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_foodos_customers_rest    ON foodos_customers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_foodos_customers_segment ON foodos_customers(segment);
CREATE INDEX IF NOT EXISTS idx_foodos_orders_rest       ON foodos_orders(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_foodos_orders_customer   ON foodos_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_foodos_automations_rest  ON foodos_automations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_foodos_campaigns_rest    ON foodos_campaigns(restaurant_id);

-- ============================================================
-- RLS: DUEÑO DEL RESTAURANTE
-- ============================================================

-- foodos_restaurants: el dueño (auth.uid) administra sus restaurantes
ALTER TABLE foodos_restaurants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages restaurants" ON foodos_restaurants;
CREATE POLICY "Owner manages restaurants" ON foodos_restaurants
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tablas ligadas al restaurante: helper de pertenencia
-- (las políticas usan subconsulta a foodos_restaurants)

ALTER TABLE foodos_branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages branches" ON foodos_branches;
CREATE POLICY "Owner manages branches" ON foodos_branches
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_menu_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages categories" ON foodos_menu_categories;
CREATE POLICY "Owner manages categories" ON foodos_menu_categories
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages menu items" ON foodos_menu_items;
CREATE POLICY "Owner manages menu items" ON foodos_menu_items
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_combos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages combos" ON foodos_combos;
CREATE POLICY "Owner manages combos" ON foodos_combos
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_upsell_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages upsell rules" ON foodos_upsell_rules;
CREATE POLICY "Owner manages upsell rules" ON foodos_upsell_rules
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages customers" ON foodos_customers;
CREATE POLICY "Owner manages customers" ON foodos_customers
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages orders" ON foodos_orders;
CREATE POLICY "Owner manages orders" ON foodos_orders
  FOR SELECT USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));
CREATE POLICY "Owner updates orders" ON foodos_orders
  FOR UPDATE USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages automations" ON foodos_automations;
CREATE POLICY "Owner manages automations" ON foodos_automations
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages campaigns" ON foodos_campaigns;
CREATE POLICY "Owner manages campaigns" ON foodos_campaigns
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

-- ============================================================
-- RLS: LECTURA PÚBLICA (solo restaurantes activos)
-- ============================================================
DROP POLICY IF EXISTS "Public restaurants" ON foodos_restaurants;
CREATE POLICY "Public restaurants" ON foodos_restaurants
  FOR SELECT USING (status = 'active');

-- ============================================================
-- RLS: LECTURA PÚBLICA DEL MENÚ (solo restaurantes activos)
-- ============================================================
DROP POLICY IF EXISTS "Public menu categories" ON foodos_menu_categories;
CREATE POLICY "Public menu categories" ON foodos_menu_categories
  FOR SELECT USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.status = 'active'));

DROP POLICY IF EXISTS "Public menu items" ON foodos_menu_items;
CREATE POLICY "Public menu items" ON foodos_menu_items
  FOR SELECT USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.status = 'active'));

DROP POLICY IF EXISTS "Public combos" ON foodos_combos;
CREATE POLICY "Public combos" ON foodos_combos
  FOR SELECT USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.status = 'active'));

DROP POLICY IF EXISTS "Public upsell rules" ON foodos_upsell_rules;
CREATE POLICY "Public upsell rules" ON foodos_upsell_rules
  FOR SELECT USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.status = 'active'));

DROP POLICY IF EXISTS "Public branches" ON foodos_branches;
CREATE POLICY "Public branches" ON foodos_branches
  FOR SELECT USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.status = 'active'));

-- ============================================================
-- RLS: INSERT PÚBLICO DE PEDIDOS (checkout sin cuenta)
-- ============================================================
DROP POLICY IF EXISTS "Public can place orders" ON foodos_orders;
CREATE POLICY "Public can place orders" ON foodos_orders
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.status = 'active'));

-- ============================================================
-- TRIGGER: CREAR/ACTUALIZAR CLIENTE AL RECIBIR PEDIDO
-- ============================================================
CREATE OR REPLACE FUNCTION foodos_upsert_customer_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id UUID;
  v_orders INTEGER;
  v_spend  NUMERIC(12,2);
  v_last_order TIMESTAMPTZ;
  v_segment TEXT;
BEGIN
  -- Solo si el pedido trae teléfono de contacto
  IF NEW.customer_phone IS NULL OR NEW.customer_phone = '' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_customer_id FROM public.foodos_customers
  WHERE restaurant_id = NEW.restaurant_id AND phone = NEW.customer_phone;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.foodos_customers (restaurant_id, phone, name, total_orders, total_spend, last_order_at)
    VALUES (NEW.restaurant_id, NEW.customer_phone, NEW.customer_name, 1, NEW.total, now())
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE public.foodos_customers
    SET name = COALESCE(NEW.customer_name, name),
        total_orders = total_orders + 1,
        total_spend = total_spend + NEW.total,
        last_order_at = now(),
        updated_at = now()
    WHERE id = v_customer_id;
  END IF;

  -- Recalcular segmento
  SELECT total_orders, total_spend, last_order_at
  INTO v_orders, v_spend, v_last_order
  FROM public.foodos_customers WHERE id = v_customer_id;

  IF v_orders = 1 THEN
    v_segment := 'nuevo';
  ELSIF v_orders >= 5 OR v_spend >= 5000 THEN
    v_segment := 'vip';
  ELSIF v_orders >= 2 THEN
    v_segment := 'recurrente';
  ELSE
    v_segment := 'nuevo';
  END IF;

  IF v_last_order IS NOT NULL AND v_last_order < now() - interval '30 days' THEN
    v_segment := 'inactivo';
  END IF;

  UPDATE public.foodos_customers SET segment = v_segment, updated_at = now() WHERE id = v_customer_id;

  -- Vincular el pedido al cliente
  NEW.customer_id := v_customer_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_foodos_order_customer ON foodos_orders;

CREATE TRIGGER trg_foodos_order_customer
  BEFORE INSERT ON foodos_orders
  FOR EACH ROW
  EXECUTE FUNCTION foodos_upsert_customer_on_order();
