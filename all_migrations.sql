-- Resurte.me — Esquema combinado (idempotente)
-- Supermercado online con entregas en México y WhatsApp Business
-- Este archivo combina las 11 migraciones originales en un solo script
-- seguro de volver a ejecutar (CREATE ... IF NOT EXISTS, DO blocks, etc.)
-- Arquitectura de proveedor único: NO hay tiendas/vendedores múltiples.
-- Los productos pertenecen directamente a la plataforma.

-- ============================================================
-- EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM (
    'spei', 'oxxo', 'cash_on_delivery', 'card', 'mercado_pago', 'codi'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'pending', 'paid', 'failed', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE order_source AS ENUM (
    'web', 'whatsapp'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE stock_status AS ENUM (
    'in_stock', 'low_stock', 'out_of_stock'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM (
    'inbound', 'outbound'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE template_type AS ENUM (
    'broadcast', 'payment_reminder', 'birthday', 'reactivation', 'rating', 'onboarding'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE template_status AS ENUM (
    'approved', 'pending', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE automation_type AS ENUM (
    'payment_recovery', 'birthday', 'cart_abandonment', 'reactivation', 'post_delivery_rating', 'onboarding'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE discount_type AS ENUM (
    'percentage', 'fixed_amount'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Agregar 'stripe' al enum payment_method (de 00002_stripe_support.sql)
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'stripe';

-- ============================================================
-- CIUDADES
-- ============================================================
CREATE TABLE IF NOT EXISTS cities (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  state         TEXT NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CATEGORÍAS
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id        BIGSERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  slug      TEXT NOT NULL UNIQUE,
  icon      TEXT,
  parent_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PRODUCTOS
-- Proveedor único: precio, oferta, stock y visibilidad viven
-- directamente en la tabla de productos (sin tienda intermedia).
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id                  BIGSERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL,
  description         TEXT,
  image_url           TEXT,
  brand               TEXT,
  category_id         BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  price               DECIMAL(10,2) NOT NULL,
  sale_price          DECIMAL(10,2),
  stock_status        stock_status NOT NULL DEFAULT 'in_stock',
  is_visible          BOOLEAN NOT NULL DEFAULT true,
  show_in_whatsapp    BOOLEAN NOT NULL DEFAULT false,
  whatsapp_product_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent column additions (for databases where products already exists without these columns)
ALTER TABLE products ADD COLUMN IF NOT EXISTS price        DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price   DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_status stock_status NOT NULL DEFAULT 'in_stock';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_visible   BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_whatsapp ON products(show_in_whatsapp) WHERE show_in_whatsapp = true;
CREATE INDEX IF NOT EXISTS idx_products_visible ON products(is_visible) WHERE is_visible = true;

-- ============================================================
-- PERFILES DE USUARIO (extiende auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name         TEXT,
  phone             TEXT,
  birthday          DATE,
  avatar_url        TEXT,
  default_city_id   BIGINT REFERENCES cities(id) ON DELETE SET NULL,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- DIRECCIONES (formato mexicano)
-- ============================================================
CREATE TABLE IF NOT EXISTS addresses (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT 'Casa',
  street       TEXT NOT NULL,
  number       TEXT NOT NULL,
  interior     TEXT,
  neighborhood TEXT NOT NULL,
  city         TEXT NOT NULL,
  state        TEXT NOT NULL,
  zip_code     TEXT NOT NULL,
  "references" TEXT,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

-- Migración 00008: permitir direcciones anónimas (user_id nullable)
-- para checkout de invitado sin requerir un perfil.
ALTER TABLE addresses
  ALTER COLUMN user_id DROP NOT NULL;

-- ============================================================
-- ZONAS DE ENTREGA
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_zones (
  id             BIGSERIAL PRIMARY KEY,
  city_id        BIGINT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  polygon_coords JSONB,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_city ON delivery_zones(city_id);

-- ============================================================
-- PEDIDOS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
  city_id         BIGINT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  address_id      BIGINT REFERENCES addresses(id) ON DELETE SET NULL,
  status          order_status NOT NULL DEFAULT 'pending',
  subtotal        DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_fee    DECIMAL(10,2) NOT NULL DEFAULT 0,
  total           DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method  payment_method,
  payment_status  payment_status NOT NULL DEFAULT 'pending',
  scheduled_for   TIMESTAMPTZ,
  source          order_source NOT NULL DEFAULT 'web',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_city ON orders(city_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders(payment_status);

-- Migración 00009: permitir pedidos anónimos (user_id nullable)
-- para checkout de invitado sin requerir un perfil.
ALTER TABLE orders
  ALTER COLUMN user_id DROP NOT NULL;

-- Migración 00002: soporte de pagos con Stripe
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_pi ON orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_stripe_cs ON orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- ============================================================
-- ITEMS DEL PEDIDO
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 1,
  unit_price  DECIMAL(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ============================================================
-- WHATSAPP: MENSAJES
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            BIGSERIAL PRIMARY KEY,
  from_number   TEXT NOT NULL,
  message_type  TEXT,
  content       TEXT,
  product_id    BIGINT REFERENCES products(id) ON DELETE SET NULL,
  order_id      BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  direction     message_direction NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_order ON whatsapp_messages(order_id);

-- ============================================================
-- WHATSAPP: PLANTILLAS DE MENSAJES (Meta)
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id            BIGSERIAL PRIMARY KEY,
  template_name TEXT NOT NULL,
  template_id   TEXT NOT NULL,
  template_type template_type NOT NULL,
  language      TEXT NOT NULL DEFAULT 'es_MX',
  status        template_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- WHATSAPP: AUTOMATIZACIONES
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_automations (
  id                  BIGSERIAL PRIMARY KEY,
  automation_type     automation_type NOT NULL,
  trigger_delay_hours INTEGER NOT NULL DEFAULT 24,
  template_id         BIGINT REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  config              JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_automations_active ON whatsapp_automations(is_active) WHERE is_active = true;

-- ============================================================
-- CUPONES Y DESCUENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS coupons (
  id             BIGSERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  discount_type  discount_type NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  min_order      DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_uses       INTEGER NOT NULL DEFAULT 0, -- 0 = ilimitado
  used_count     INTEGER NOT NULL DEFAULT 0,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Cities: lectura pública
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cities are viewable by everyone" ON cities;
CREATE POLICY "Cities are viewable by everyone" ON cities
  FOR SELECT USING (true);

-- Categories: lectura pública
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON categories;
CREATE POLICY "Categories are viewable by everyone" ON categories
  FOR SELECT USING (true);

-- Products: lectura pública
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Products are viewable by everyone" ON products;
CREATE POLICY "Products are viewable by everyone" ON products
  FOR SELECT USING (true);

-- Profiles: usuarios solo pueden leer/escribir su propio perfil
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Addresses: usuarios solo pueden ver/editar sus propias direcciones
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own addresses" ON addresses;
CREATE POLICY "Users can view own addresses" ON addresses
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own addresses" ON addresses;
CREATE POLICY "Users can insert own addresses" ON addresses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own addresses" ON addresses;
CREATE POLICY "Users can update own addresses" ON addresses
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own addresses" ON addresses;
CREATE POLICY "Users can delete own addresses" ON addresses
  FOR DELETE USING (auth.uid() = user_id);

-- Orders: usuarios solo ven sus pedidos
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own orders" ON orders;
CREATE POLICY "Users can insert own orders" ON orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Order items: usuarios solo ven items de sus pedidos
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own order items" ON order_items;
CREATE POLICY "Users can view own order items" ON order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users can insert own order items" ON order_items;
CREATE POLICY "Users can insert own order items" ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
  );

-- Delivery zones: lectura pública
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Delivery zones are viewable by everyone" ON delivery_zones;
CREATE POLICY "Delivery zones are viewable by everyone" ON delivery_zones
  FOR SELECT USING (true);

-- Coupons: lectura para usuarios autenticados
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Coupons are viewable by authenticated users" ON coupons;
CREATE POLICY "Coupons are viewable by authenticated users" ON coupons
  FOR SELECT USING (auth.role() = 'authenticated');

-- WhatsApp automations: solo admin/service_role
ALTER TABLE whatsapp_automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Automations managed by service role" ON whatsapp_automations;
CREATE POLICY "Automations managed by service role" ON whatsapp_automations
  FOR ALL USING (true); -- Restringido vía API, no desde el cliente

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Templates managed by service role" ON whatsapp_templates;
CREATE POLICY "Templates managed by service role" ON whatsapp_templates
  FOR ALL USING (true);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Messages managed by service role" ON whatsapp_messages;
CREATE POLICY "Messages managed by service role" ON whatsapp_messages
  FOR ALL USING (true);

-- ============================================================
-- 00003: Unidad de producto
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT;

-- ============================================================
-- 00004: Actualizar URLs de imágenes de productos (Unsplash -> resurte.me)
-- ============================================================
UPDATE products
SET image_url = 'https://resurte.me/es/p/' || id::text,
    updated_at = now()
WHERE image_url LIKE '%images.unsplash.com%';

-- ============================================================
-- 00005: Columna JSONB de imágenes múltiples
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- Backfill images array from existing image_url for products that have one
UPDATE products SET images = jsonb_build_array(image_url) WHERE image_url IS NOT NULL AND (images IS NULL OR images = '[]'::jsonb);

COMMENT ON COLUMN products.images IS 'Array of image URLs for product gallery. First image is primary.';

-- ============================================================
-- 00006: Iconos de categoría (emoji)
-- ============================================================
UPDATE categories SET icon = '🥬' WHERE slug = 'frutas-verduras';
UPDATE categories SET icon = '📦' WHERE slug = 'abarrotes';
UPDATE categories SET icon = '🧀' WHERE slug = 'lacteos-huevos';
UPDATE categories SET icon = '🥩' WHERE slug = 'carnes-aves-pescados';
UPDATE categories SET icon = '🍞' WHERE slug = 'panaderia-tortilleria';
UPDATE categories SET icon = '🥤' WHERE slug = 'bebidas';
UPDATE categories SET icon = '🍪' WHERE slug = 'botanas-dulces';
UPDATE categories SET icon = '🧹' WHERE slug = 'limpieza-cocina';
UPDATE categories SET icon = '❄️' WHERE slug = 'congelados';

-- Also handle the slug variants used in mock data
UPDATE categories SET icon = '🥬' WHERE slug = 'frutas-y-verduras';
UPDATE categories SET icon = '🥫' WHERE slug = 'despensa';
UPDATE categories SET icon = '🐾' WHERE slug = 'mascotas';
UPDATE categories SET icon = '🧹' WHERE slug = 'limpieza';

-- ============================================================
-- 00007: Actualizar 84 product image_urls a imágenes locales
-- y limpiar duplicados en el arreglo images
-- ============================================================
UPDATE products SET image_url = '/images/products/7.png' WHERE slug = 'platano-macho';
UPDATE products SET image_url = '/images/products/8.png' WHERE slug = 'fresa';
UPDATE products SET image_url = '/images/products/10.png' WHERE slug = 'mango-ataulfo';
UPDATE products SET image_url = '/images/products/34.png' WHERE slug = 'epazote';
UPDATE products SET image_url = '/images/products/49.png' WHERE slug = 'hongo-portobello';
UPDATE products SET image_url = '/images/products/50.png' WHERE slug = 'champinon';
UPDATE products SET image_url = '/images/products/51.png' WHERE slug = 'arroz-blanco-1kg';
UPDATE products SET image_url = '/images/products/52.png' WHERE slug = 'arroz-blanco-5kg';
UPDATE products SET image_url = '/images/products/53.png' WHERE slug = 'frijol-negro-1kg';
UPDATE products SET image_url = '/images/products/54.png' WHERE slug = 'frijol-negro-5kg';
UPDATE products SET image_url = '/images/products/55.png' WHERE slug = 'frijol-bayo-1kg';
UPDATE products SET image_url = '/images/products/56.png' WHERE slug = 'frijol-peruano-1kg';
UPDATE products SET image_url = '/images/products/57.png' WHERE slug = 'lenteja-1kg';
UPDATE products SET image_url = '/images/products/59.png' WHERE slug = 'aceite-canola-1l';
UPDATE products SET image_url = '/images/products/60.png' WHERE slug = 'aceite-canola-5l';
UPDATE products SET image_url = '/images/products/61.png' WHERE slug = 'aceite-de-maiz-1l';
UPDATE products SET image_url = '/images/products/64.png' WHERE slug = 'pasta-spaghetti-500g';
UPDATE products SET image_url = '/images/products/68.png' WHERE slug = 'harina-de-trigo-1kg';
UPDATE products SET image_url = '/images/products/71.png' WHERE slug = 'sal-de-mar-fina-1kg';
UPDATE products SET image_url = '/images/products/72.png' WHERE slug = 'sal-gruesa-1kg';
UPDATE products SET image_url = '/images/products/75.png' WHERE slug = 'oregano-molido-100g';
UPDATE products SET image_url = '/images/products/77.png' WHERE slug = 'salsa-maggi-200ml';
UPDATE products SET image_url = '/images/products/80.png' WHERE slug = 'catsup-1kg';
UPDATE products SET image_url = '/images/products/81.png' WHERE slug = 'mayonesa-1kg';
UPDATE products SET image_url = '/images/products/83.png' WHERE slug = 'consome-de-pollo-1kg';
UPDATE products SET image_url = '/images/products/85.png' WHERE slug = 'vinagre-blanco-1l';
UPDATE products SET image_url = '/images/products/90.png' WHERE slug = 'leche-descremada-1l';
UPDATE products SET image_url = '/images/products/91.png' WHERE slug = 'leche-evaporada-360ml';
UPDATE products SET image_url = '/images/products/92.png' WHERE slug = 'media-crema-240ml';
UPDATE products SET image_url = '/images/products/93.png' WHERE slug = 'leche-condensada-370ml';
UPDATE products SET image_url = '/images/products/96.png' WHERE slug = 'huevo-rojo-18pz';
UPDATE products SET image_url = '/images/products/97.png' WHERE slug = 'queso-oaxaca-400g';
UPDATE products SET image_url = '/images/products/98.png' WHERE slug = 'queso-fresco-500g';
UPDATE products SET image_url = '/images/products/99.png' WHERE slug = 'queso-panela-400g';
UPDATE products SET image_url = '/images/products/100.png' WHERE slug = 'queso-manchego-400g';
UPDATE products SET image_url = '/images/products/102.png' WHERE slug = 'yogurt-natural-1l';
UPDATE products SET image_url = '/images/products/105.png' WHERE slug = 'pechuga-pollo';
UPDATE products SET image_url = '/images/products/106.png' WHERE slug = 'milanesa-de-pollo';
UPDATE products SET image_url = '/images/products/107.png' WHERE slug = 'pierna-muslo-pollo';
UPDATE products SET image_url = '/images/products/108.png' WHERE slug = 'alitas-de-pollo';
UPDATE products SET image_url = '/images/products/111.png' WHERE slug = 'milanesa-de-res';
UPDATE products SET image_url = '/images/products/112.png' WHERE slug = 'carne-molida-80-20';
UPDATE products SET image_url = '/images/products/113.png' WHERE slug = 'diezmillo-de-res';
UPDATE products SET image_url = '/images/products/116.png' WHERE slug = 'arrachera';
UPDATE products SET image_url = '/images/products/117.png' WHERE slug = 'ribeye';
UPDATE products SET image_url = '/images/products/118.png' WHERE slug = 't-bone';
UPDATE products SET image_url = '/images/products/119.png' WHERE slug = 'chuleta-de-cerdo';
UPDATE products SET image_url = '/images/products/120.png' WHERE slug = 'lomo-de-cerdo';
UPDATE products SET image_url = '/images/products/121.png' WHERE slug = 'costilla-de-cerdo';
UPDATE products SET image_url = '/images/products/122.png' WHERE slug = 'tocino';
UPDATE products SET image_url = '/images/products/123.png' WHERE slug = 'jamon-de-pierna';
UPDATE products SET image_url = '/images/products/124.png' WHERE slug = 'chorizo';
UPDATE products SET image_url = '/images/products/126.png' WHERE slug = 'filete-de-tilapia';
UPDATE products SET image_url = '/images/products/127.png' WHERE slug = 'filete-de-basa';
UPDATE products SET image_url = '/images/products/128.png' WHERE slug = 'camaron-pacotilla';
UPDATE products SET image_url = '/images/products/129.png' WHERE slug = 'camaron-u12-u15';
UPDATE products SET image_url = '/images/products/130.png' WHERE slug = 'pulpo';
UPDATE products SET image_url = '/images/products/131.png' WHERE slug = 'mojarra-entera';
UPDATE products SET image_url = '/images/products/132.png' WHERE slug = 'huachinango-entero';
UPDATE products SET image_url = '/images/products/133.png' WHERE slug = 'camaron-seco';
UPDATE products SET image_url = '/images/products/134.png' WHERE slug = 'salmon';
UPDATE products SET image_url = '/images/products/137.png' WHERE slug = 'pan-hot-dog';
UPDATE products SET image_url = '/images/products/138.png' WHERE slug = 'pan-hamburguesa';
UPDATE products SET image_url = '/images/products/147.png' WHERE slug = 'sprite-2l';
UPDATE products SET image_url = '/images/products/149.png' WHERE slug = 'sidral-mundet-2l';
UPDATE products SET image_url = '/images/products/150.png' WHERE slug = 'agua-bonafont-15l';
UPDATE products SET image_url = '/images/products/151.png' WHERE slug = 'agua-mineral-15l';
UPDATE products SET image_url = '/images/products/152.png' WHERE slug = 'agua-mineral-saborizada-15l';
UPDATE products SET image_url = '/images/products/160.png' WHERE slug = 'sabritas-clasicas-170g';
UPDATE products SET image_url = '/images/products/162.png' WHERE slug = 'cacahuate-salado-200g';
UPDATE products SET image_url = '/images/products/163.png' WHERE slug = 'galletas-marias-200g';
UPDATE products SET image_url = '/images/products/164.png' WHERE slug = 'galletas-saladas-200g';
UPDATE products SET image_url = '/images/products/169.png' WHERE slug = 'detergente-liquido-1l';
UPDATE products SET image_url = '/images/products/170.png' WHERE slug = 'detergente-en-polvo-1kg';
UPDATE products SET image_url = '/images/products/172.png' WHERE slug = 'limpiador-multiusos-500ml';
UPDATE products SET image_url = '/images/products/173.png' WHERE slug = 'limpiavidrios-500ml';
UPDATE products SET image_url = '/images/products/175.png' WHERE slug = 'fibras-para-trastes-3pz';
UPDATE products SET image_url = '/images/products/177.png' WHERE slug = 'servilletas-100pz';
UPDATE products SET image_url = '/images/products/178.png' WHERE slug = 'papel-de-cocina-2pz';
UPDATE products SET image_url = '/images/products/182.png' WHERE slug = 'helado-vainilla-1l';
UPDATE products SET image_url = '/images/products/183.png' WHERE slug = 'paletas-de-hielo-12pz';
UPDATE products SET image_url = '/images/products/184.png' WHERE slug = 'filete-tilapia-congelado-1kg';
UPDATE products SET image_url = '/images/products/185.png' WHERE slug = 'camaron-congelado-1kg';
UPDATE products SET image_url = '/images/products/186.png' WHERE slug = 'nuggets-de-pollo-1kg';

-- Clean duplicate image_url entries from images arrays
UPDATE products
SET images = (
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements(images) AS elem
  WHERE elem::text <> to_jsonb(image_url)::text
)
WHERE images IS NOT NULL
  AND jsonb_typeof(images) = 'array'
  AND images::jsonb @> to_jsonb(image_url)::jsonb;

-- Set images to NULL for empty arrays after cleanup
UPDATE products SET images = NULL WHERE images = '[]'::jsonb;

-- ============================================================
-- 00010: Sistema de Cashback en Créditos Resurte
-- Monedero digital + trigger automático de cashback por compra
-- ============================================================

-- Columnas de cashback en órdenes
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cashback_credits DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS cashback_tier     TEXT,
  ADD COLUMN IF NOT EXISTS week_of_month     INTEGER,
  ADD COLUMN IF NOT EXISTS month_year        TEXT;  -- formato 'YYYY-MM'

COMMENT ON COLUMN orders.cashback_credits IS 'Créditos Resurte generados por esta orden (solo si total >= $2,500 MXN)';
COMMENT ON COLUMN orders.cashback_tier     IS 'Nivel de cashback aplicado: Verde, Plata, Oro, Diamante';
COMMENT ON COLUMN orders.week_of_month     IS 'Semana ISO del mes en que se realizó la compra';
COMMENT ON COLUMN orders.month_year        IS 'Mes/año de la compra en formato YYYY-MM';

-- Monedero (wallet) — 1 registro por usuario
CREATE TABLE IF NOT EXISTS wallets (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  balance_credits DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (balance_credits >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE wallets IS 'Monedero digital de Créditos Resurte. 1 registro por usuario.';
COMMENT ON COLUMN wallets.balance_credits IS 'Saldo actual en Créditos Resurte. Solo puede ser >= 0.';

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

-- Transacciones del monedero
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id         BIGSERIAL PRIMARY KEY,
  wallet_id  BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  amount     DECIMAL(10,2) NOT NULL,
  concept    TEXT NOT NULL,
  order_id   BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE wallet_transactions IS 'Historial de movimientos del monedero. amount > 0 = abono (cashback), amount < 0 = canje (pago de servicios).';
COMMENT ON COLUMN wallet_transactions.amount   IS 'Positivo = abono de créditos. Negativo = canje/uso de créditos.';
COMMENT ON COLUMN wallet_transactions.concept  IS 'Concepto legible: "Cashback Nivel Oro", "Canje Servicio SEO", etc.';
COMMENT ON COLUMN wallet_transactions.order_id IS 'Orden que originó el cashback (nullable para canjes manuales).';

CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet  ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_order   ON wallet_transactions(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON wallet_transactions(created_at DESC);

-- RLS: wallets
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can view own wallet' AND tablename = 'wallets'
  ) THEN
    CREATE POLICY "Users can view own wallet"
      ON wallets FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Solo el service_role (o backend via SECURITY DEFINER) puede INSERT/UPDATE
-- No se crean políticas de INSERT/UPDATE/DELETE para authenticated users

-- RLS: wallet_transactions
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can view own wallet transactions' AND tablename = 'wallet_transactions'
  ) THEN
    CREATE POLICY "Users can view own wallet transactions"
      ON wallet_transactions FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM wallets
          WHERE wallets.id = wallet_transactions.wallet_id
            AND wallets.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Solo el service_role puede INSERT (el trigger usa SECURITY DEFINER, no requiere política)

-- Función trigger: process_cashback_for_order()
CREATE OR REPLACE FUNCTION process_cashback_for_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_week   INTEGER;
  v_week_count     INTEGER;
  v_cashback_pct   NUMERIC(5,2);
  v_cashback_amt   NUMERIC(10,2);
  v_tier_name      TEXT;
  v_wallet_id      BIGINT;
  v_week_already   BOOLEAN;
BEGIN
  -- Validación: solo órdenes con total >= $2,500 MXN generan cashback
  IF NEW.total IS NULL OR NEW.total < 2500 THEN
    NEW.week_of_month := EXTRACT(WEEK FROM NEW.created_at)::INTEGER;
    NEW.month_year    := TO_CHAR(NEW.created_at, 'YYYY-MM');
    RETURN NEW;
  END IF;

  -- Evitar doble procesamiento
  IF NEW.cashback_credits IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Contar semanas ISO distintas del mes en curso
  -- BEFORE INSERT: la orden aún no está en la tabla, contamos las existentes
  v_current_week := EXTRACT(WEEK FROM NEW.created_at)::INTEGER;

  SELECT COUNT(DISTINCT EXTRACT(WEEK FROM o.created_at))
  INTO v_week_count
  FROM orders o
  WHERE o.user_id = NEW.user_id
    AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NEW.created_at);

  -- Verificar si la semana de esta orden ya fue contada en las existentes
  SELECT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.user_id = NEW.user_id
      AND EXTRACT(WEEK FROM o.created_at) = v_current_week
      AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NEW.created_at)
  ) INTO v_week_already;

  IF NOT v_week_already THEN
    v_week_count := v_week_count + 1;
  END IF;

  -- Asignar nivel (tier) según semanas acumuladas (incluyendo la actual)
  CASE v_week_count
    WHEN 1 THEN v_tier_name := 'Verde';    v_cashback_pct := 0.05;
    WHEN 2 THEN v_tier_name := 'Plata';    v_cashback_pct := 0.10;
    WHEN 3 THEN v_tier_name := 'Oro';       v_cashback_pct := 0.15;
    ELSE        v_tier_name := 'Diamante';  v_cashback_pct := 0.20;  -- 4+ semanas
  END CASE;

  -- Calcular créditos
  v_cashback_amt := ROUND(NEW.total * v_cashback_pct, 2);

  -- Grabar metadata de cashback en la orden
  NEW.cashback_credits := v_cashback_amt;
  NEW.cashback_tier     := v_tier_name;
  NEW.week_of_month     := v_current_week;
  NEW.month_year        := TO_CHAR(NEW.created_at, 'YYYY-MM');

  -- Asegurar que el monedero existe (crear si no)
  INSERT INTO wallets (user_id, balance_credits)
  VALUES (NEW.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO v_wallet_id FROM wallets WHERE user_id = NEW.user_id;

  -- Registrar transacción de abono
  INSERT INTO wallet_transactions (wallet_id, amount, concept, order_id)
  VALUES (
    v_wallet_id,
    v_cashback_amt,
    'Cashback Nivel ' || v_tier_name || ' (' || (v_cashback_pct * 100)::INTEGER || '%)',
    NEW.id
  );

  -- Actualizar saldo del monedero
  UPDATE wallets
  SET balance_credits = balance_credits + v_cashback_amt,
      updated_at = now()
  WHERE id = v_wallet_id;

  RETURN NEW;
END;
$$;

-- Trigger: BEFORE INSERT en órdenes
DROP TRIGGER IF EXISTS trg_cashback_on_order ON orders;

CREATE TRIGGER trg_cashback_on_order
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION process_cashback_for_order();

COMMENT ON TRIGGER trg_cashback_on_order ON orders
  IS 'Calcula y registra automáticamente el cashback en Créditos Resurte al crear una orden. Solo aplica si total >= $2,500 MXN.';

-- ============================================================
-- 00011: Colecciones Especializadas por Tipo de Restaurante
-- Cada colección agrupa productos por tags (sin duplicar inventario).
--
-- NOTA: El filtrado de productos por tags se hace del lado del servidor
-- (Node.js) porque PostgREST no soporta el casteo automático de jsonb &&
-- jsonb para el operador de overlap. PostgreSQL sí lo soporta nativamente,
-- así que se puede optimizar en el futuro con una función RPC.
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurant_collections (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  image_url     TEXT,
  tags          JSONB NOT NULL DEFAULT '[]',   -- Tags que vinculan productos a esta colección (ej: ["taqueria","tacos"])
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tags en productos (columna JSONB para agrupación referencial)
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN (tags);

-- RLS: lectura pública
ALTER TABLE restaurant_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Collections are viewable by everyone" ON restaurant_collections;
CREATE POLICY "Collections are viewable by everyone" ON restaurant_collections
  FOR SELECT USING (true);
