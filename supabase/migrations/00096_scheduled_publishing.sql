-- ============================================================
-- Publicación programada de productos: publish_at/unpublish_at
-- se aplican vía el job scheduled-publishing del cron diario.
-- Aditiva, idempotente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS publish_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unpublish_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_products_publish_at
  ON products(publish_at) WHERE publish_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_unpublish_at
  ON products(unpublish_at) WHERE unpublish_at IS NOT NULL;
