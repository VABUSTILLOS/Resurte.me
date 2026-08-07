-- ============================================================
-- Resurte.me — DEFAULT de store_id en whatsapp_messages
--
-- whatsapp_messages.store_id es NOT NULL (migración 00001) y los
-- inserts de workflows/trigger/send-template no envían store_id,
-- por lo que el log de auditoría de WhatsApp falla en runtime con
-- NOT NULL violation. Se aplica el mismo patrón que 00026 para
-- orders: resolver la tienda activa (única) como DEFAULT.
-- ============================================================

ALTER TABLE public.whatsapp_messages
  ALTER COLUMN store_id SET DEFAULT public.default_order_store_id();

COMMENT ON COLUMN whatsapp_messages.store_id
  IS 'Tienda del mensaje. DEFAULT = única tienda activa (por ahora Resurte).';
