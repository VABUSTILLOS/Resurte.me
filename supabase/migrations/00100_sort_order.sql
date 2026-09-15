-- ============================================================
-- Orden manual del catálogo: sort_order (menor = primero).
-- La tienda ordena por sort_order, name. Aditiva, idempotente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_sort_order ON products(sort_order);
