-- Resurte.me — Colecciones Especializadas por Tipo de Restaurante
-- Cada colección agrupa productos por tags (sin duplicar inventario).
--
-- NOTA: El filtrado de productos por tags se hace del lado del servidor
-- (Node.js) porque PostgREST no soporta el casteo automático de jsonb &&
-- jsonb para el operador de overlap. PostgreSQL sí lo soporta nativamente,
-- así que se puede optimizar en el futuro con una función RPC.

-- ============================================================
-- COLECCIONES DE RESTAURANTE
-- ============================================================
CREATE TABLE restaurant_collections (
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

-- ============================================================
-- TAGS EN PRODUCTOS (columna JSONB para agrupación referencial)
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN (tags);

-- ============================================================
-- RLS: lectura pública
-- ============================================================
ALTER TABLE restaurant_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Collections are viewable by everyone" ON restaurant_collections
  FOR SELECT USING (true);
