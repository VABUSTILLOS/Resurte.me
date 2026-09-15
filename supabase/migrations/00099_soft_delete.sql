-- ============================================================
-- Papelera de productos (soft delete): eliminar marca deleted_at y
-- fuerza is_visible=false; el historial de pedidos se preserva
-- (order_items referencia la fila, que sigue existiendo).
-- Aditiva, idempotente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at
  ON products(deleted_at) WHERE deleted_at IS NOT NULL;
