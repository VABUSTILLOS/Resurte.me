-- ============================================================
-- Costo del producto (para margen en el panel admin).
-- Aditiva, idempotente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cost DECIMAL(10,2);
