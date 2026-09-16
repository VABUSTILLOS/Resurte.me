-- ============================================================
-- Productos relacionados (ronda 7): cross-sell curado desde el
-- panel. El detalle de producto los muestra en "También te puede
-- interesar" y, si están vacíos, cae a la heurística actual
-- (misma categoría). Aditiva, idempotente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS related_product_ids BIGINT[];

COMMENT ON COLUMN products.related_product_ids IS
  'Ids de productos sugeridos en el detalle (cross-sell manual). Vacío/NULL = heurística automática.';
