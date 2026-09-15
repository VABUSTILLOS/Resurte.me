-- ============================================================
-- Distribución del catálogo WhatsApp (fase WF1): número público
-- del catálogo para enlaces wa.me y QR. El phone_number_id de
-- Meta no siempre revela el número real, así que se captura
-- manualmente. NULL = sin enlaces de distribución disponibles.
-- Idempotente.
-- ============================================================

ALTER TABLE whatsapp_catalogs
  ADD COLUMN IF NOT EXISTS display_phone TEXT;

COMMENT ON COLUMN whatsapp_catalogs.display_phone IS
  'Número público del catálogo (formato libre, p. ej. 52 1 614 123 4567) para enlaces wa.me y QR.';
