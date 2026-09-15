-- ============================================================
-- Multi-catálogo WhatsApp de la plataforma (master admin):
-- 1. Catálogos curados por ciudad (selección + orden propio)
-- 2. Credenciales WABA opcionales por catálogo (NULL = WABA plataforma)
-- 3. Seed del catálogo de Chihuahua (primera ciudad de operación)
-- Admin-only: se accede vía service role (requireAdmin en las actions).
-- Idempotente.
-- ============================================================

-- 1. CATÁLOGOS --------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_catalogs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  city_id           BIGINT REFERENCES cities(id) ON DELETE SET NULL,  -- NULL = global
  phone_number_id   TEXT,        -- NULL = usa la WABA de la plataforma (env)
  waba_id           TEXT,
  access_token_enc  TEXT,        -- AES-GCM app-level (mismo esquema que FoodOS)
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. ITEMS CURADOS (selección + orden del admin) ----------------
CREATE TABLE IF NOT EXISTS whatsapp_catalog_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id  UUID NOT NULL REFERENCES whatsapp_catalogs(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  is_visible  BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (catalog_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_catalog_items_order
  ON whatsapp_catalog_items(catalog_id, is_visible, position);

-- ============================================================
-- RLS: solo service role (admin vía requireAdmin + service client)
-- ============================================================
ALTER TABLE whatsapp_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_catalog_items ENABLE ROW LEVEL SECURITY;

-- Sin políticas para anon/authenticated: solo service role pasa.
-- (Las acciones admin usan createServiceClient tras requireAdmin.)

-- 3. SEED: catálogo de Chihuahua --------------------------------
INSERT INTO whatsapp_catalogs (slug, name, city_id)
SELECT 'chihuahua', 'Chihuahua', c.id
FROM cities c
WHERE c.slug = 'chihuahua'
ON CONFLICT (slug) DO NOTHING;

-- Catálogo global (fallback para ciudades sin catálogo propio)
INSERT INTO whatsapp_catalogs (slug, name, city_id)
VALUES ('global', 'Catálogo general', NULL)
ON CONFLICT (slug) DO NOTHING;
