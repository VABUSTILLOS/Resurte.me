-- ============================================================
-- Stock numérico: cantidad disponible por producto (informativa
-- para admin; la tienda sigue leyendo stock_status, que el panel
-- deriva de la cantidad al ajustarla). Aditiva, idempotente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER;
