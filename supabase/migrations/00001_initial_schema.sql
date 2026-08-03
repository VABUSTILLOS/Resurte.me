-- Resurte.me — Schema Inicial
-- Clon de Instacart para 20 ciudades de México con WhatsApp Business

-- ============================================================
-- EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE order_status AS ENUM (
  'pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'
);

CREATE TYPE payment_method AS ENUM (
  'spei', 'oxxo', 'cash_on_delivery', 'card', 'mercado_pago', 'codi'
);

CREATE TYPE payment_status AS ENUM (
  'pending', 'paid', 'failed', 'refunded'
);

CREATE TYPE order_source AS ENUM (
  'web', 'whatsapp'
);

CREATE TYPE stock_status AS ENUM (
  'in_stock', 'low_stock', 'out_of_stock'
);

CREATE TYPE message_direction AS ENUM (
  'inbound', 'outbound'
);

CREATE TYPE template_type AS ENUM (
  'broadcast', 'payment_reminder', 'birthday', 'reactivation', 'rating', 'onboarding'
);

CREATE TYPE template_status AS ENUM (
  'approved', 'pending', 'rejected'
);

CREATE TYPE automation_type AS ENUM (
  'payment_recovery', 'birthday', 'cart_abandonment', 'reactivation', 'post_delivery_rating', 'onboarding'
);

CREATE TYPE discount_type AS ENUM (
  'percentage', 'fixed_amount'
);

-- ============================================================
-- CIUDADES
-- ============================================================
CREATE TABLE cities (
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
-- TIENDAS / SUPERMERCADOS
-- ============================================================
CREATE TABLE stores (
  id                  BIGSERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  description         TEXT,
  logo_url            TEXT,
  banner_url          TEXT,
  min_order           DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_fee        DECIMAL(10,2) NOT NULL DEFAULT 0,
  avg_delivery_time   TEXT,
  whatsapp_number     TEXT,
  whatsapp_catalog_id TEXT,
  whatsapp_waba_id    TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tiendas por ciudad (muchos-a-muchos)
CREATE TABLE store_cities (
  store_id     BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  city_id      BIGINT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  is_available BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (store_id, city_id)
);

-- ============================================================
-- CATEGORÍAS
-- ============================================================
CREATE TABLE categories (
  id        BIGSERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  slug      TEXT NOT NULL UNIQUE,
  icon      TEXT,
  parent_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PRODUCTOS
-- ============================================================
CREATE TABLE products (
  id                  BIGSERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL,
  description         TEXT,
  image_url           TEXT,
  brand               TEXT,
  category_id         BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  show_in_whatsapp    BOOLEAN NOT NULL DEFAULT false,
  whatsapp_product_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_whatsapp ON products(show_in_whatsapp) WHERE show_in_whatsapp = true;

-- Productos disponibles por tienda (precio específico)
CREATE TABLE product_stores (
  product_id   BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id     BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  price        DECIMAL(10,2) NOT NULL,
  sale_price   DECIMAL(10,2),
  is_available BOOLEAN NOT NULL DEFAULT true,
  stock_status stock_status NOT NULL DEFAULT 'in_stock',
  PRIMARY KEY (product_id, store_id)
);

CREATE INDEX idx_product_stores_store ON product_stores(store_id);

-- ============================================================
-- PERFILES DE USUARIO (extiende auth.users)
-- ============================================================
CREATE TABLE profiles (
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- DIRECCIONES (formato mexicano)
-- ============================================================
CREATE TABLE addresses (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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

CREATE INDEX idx_addresses_user ON addresses(user_id);

-- ============================================================
-- ZONAS DE ENTREGA
-- ============================================================
CREATE TABLE delivery_zones (
  id             BIGSERIAL PRIMARY KEY,
  city_id        BIGINT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  polygon_coords JSONB,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_zones_city ON delivery_zones(city_id);

-- ============================================================
-- PEDIDOS
-- ============================================================
CREATE TABLE orders (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id        BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
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

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_store ON orders(store_id);
CREATE INDEX idx_orders_city ON orders(city_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment ON orders(payment_status);

-- ============================================================
-- ITEMS DEL PEDIDO
-- ============================================================
CREATE TABLE order_items (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 1,
  unit_price  DECIMAL(10,2) NOT NULL
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================================
-- WHATSAPP: MENSAJES
-- ============================================================
CREATE TABLE whatsapp_messages (
  id            BIGSERIAL PRIMARY KEY,
  store_id      BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  from_number   TEXT NOT NULL,
  message_type  TEXT,
  content       TEXT,
  product_id    BIGINT REFERENCES products(id) ON DELETE SET NULL,
  order_id      BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  direction     message_direction NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_messages_store ON whatsapp_messages(store_id);
CREATE INDEX idx_whatsapp_messages_order ON whatsapp_messages(order_id);

-- ============================================================
-- WHATSAPP: PLANTILLAS DE MENSAJES (Meta)
-- ============================================================
CREATE TABLE whatsapp_templates (
  id            BIGSERIAL PRIMARY KEY,
  store_id      BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_id   TEXT NOT NULL,
  template_type template_type NOT NULL,
  language      TEXT NOT NULL DEFAULT 'es_MX',
  status        template_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_templates_store ON whatsapp_templates(store_id);

-- ============================================================
-- WHATSAPP: AUTOMATIZACIONES
-- ============================================================
CREATE TABLE whatsapp_automations (
  id                  BIGSERIAL PRIMARY KEY,
  store_id            BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  automation_type     automation_type NOT NULL,
  trigger_delay_hours INTEGER NOT NULL DEFAULT 24,
  template_id         BIGINT REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  config              JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_automations_store ON whatsapp_automations(store_id);
CREATE INDEX idx_whatsapp_automations_active ON whatsapp_automations(is_active) WHERE is_active = true;

-- ============================================================
-- CUPONES Y DESCUENTOS
-- ============================================================
CREATE TABLE coupons (
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
CREATE POLICY "Cities are viewable by everyone" ON cities
  FOR SELECT USING (true);

-- Stores: lectura pública
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stores are viewable by everyone" ON stores
  FOR SELECT USING (true);

-- Categories: lectura pública
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are viewable by everyone" ON categories
  FOR SELECT USING (true);

-- Products: lectura pública
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products are viewable by everyone" ON products
  FOR SELECT USING (true);

-- Product_stores: lectura pública
ALTER TABLE product_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Product stores are viewable by everyone" ON product_stores
  FOR SELECT USING (true);

-- Profiles: usuarios solo pueden leer/escribir su propio perfil
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Addresses: usuarios solo pueden ver/editar sus propias direcciones
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own addresses" ON addresses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own addresses" ON addresses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own addresses" ON addresses
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own addresses" ON addresses
  FOR DELETE USING (auth.uid() = user_id);

-- Orders: usuarios solo ven sus pedidos
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own orders" ON orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Order items: usuarios solo ven items de sus pedidos
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own order items" ON order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own order items" ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
  );

-- Delivery zones: lectura pública
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Delivery zones are viewable by everyone" ON delivery_zones
  FOR SELECT USING (true);

-- Store cities: lectura pública
ALTER TABLE store_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store cities are viewable by everyone" ON store_cities
  FOR SELECT USING (true);

-- Coupons: lectura para usuarios autenticados
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coupons are viewable by authenticated users" ON coupons
  FOR SELECT USING (auth.role() = 'authenticated');

-- WhatsApp automations: solo admin/service_role
ALTER TABLE whatsapp_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Automations managed by service role" ON whatsapp_automations
  FOR ALL USING (true); -- Restringido vía API, no desde el cliente

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Templates managed by service role" ON whatsapp_templates
  FOR ALL USING (true);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Messages managed by service role" ON whatsapp_messages
  FOR ALL USING (true);
