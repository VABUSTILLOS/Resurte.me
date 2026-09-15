-- ============================================================
-- Nota interna del producto (solo visible en el panel admin).
-- Aditiva, idempotente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS admin_note TEXT;
