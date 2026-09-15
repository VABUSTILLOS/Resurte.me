-- ============================================================
-- Sync de catálogo WhatsApp (fase WA1):
-- catalog_id de Meta por catálogo curado. NULL = fallback al
-- catálogo de la plataforma (env WHATSAPP_CATALOG_ID) o waba_id.
-- Idempotente.
-- ============================================================

ALTER TABLE whatsapp_catalogs
  ADD COLUMN IF NOT EXISTS catalog_id TEXT;

COMMENT ON COLUMN whatsapp_catalogs.catalog_id IS
  'ID del catálogo de productos en Meta Commerce. NULL = fallback a WHATSAPP_CATALOG_ID (env) o al waba_id.';
