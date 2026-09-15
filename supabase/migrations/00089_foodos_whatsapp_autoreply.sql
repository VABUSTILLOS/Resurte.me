-- ============================================================
-- FoodOS WhatsApp: auto-respuesta con catálogo ordenado.
-- Cuando un cliente escribe al número del restaurante, se le
-- envía el mensaje product_list con la curaduría (si está activo).
-- Idempotente.
-- ============================================================

ALTER TABLE foodos_whatsapp_connections
  ADD COLUMN IF NOT EXISTS auto_reply_catalog BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_reply_text TEXT;

-- Realtime del inbox (suscripción en /panel/foodos/inbox; RLS filtra)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'foodos_whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.foodos_whatsapp_messages;
  END IF;
END $$;
