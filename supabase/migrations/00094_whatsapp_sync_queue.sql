-- ============================================================
-- Sync de catálogo WhatsApp (fase WA5): cola de sync automático.
-- Cambios en productos (precio, imagen, stock, visibilidad,
-- disponibilidad por ciudad) encolan items; el cron diario los
-- vacía con un sync incremental (trigger_kind = 'auto').
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_sync_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id   UUID NOT NULL REFERENCES whatsapp_catalogs(id) ON DELETE CASCADE,
  product_id   BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL DEFAULT 'product_update',
  attempts     INTEGER NOT NULL DEFAULT 0,
  queued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (catalog_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_sync_queue_pending
  ON whatsapp_sync_queue(catalog_id)
  WHERE processed_at IS NULL;

ALTER TABLE whatsapp_sync_queue ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo service role (admin actions + cron).
