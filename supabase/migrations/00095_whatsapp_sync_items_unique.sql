-- ============================================================
-- Sync de catálogo WhatsApp (fase WB3): un item por producto y
-- corrida, para permitir upsert en reintentos individuales.
-- Idempotente.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_sync_items_run_product
  ON whatsapp_sync_items(run_id, product_id);
