-- ============================================================
-- Resurte.me — message_id + status en whatsapp_messages
--
-- Permite correlacionar updates de estado de Meta (sent/delivered/
-- read/failed) con el mensaje original y mantener un log de
-- auditoría por message_id (tanto inbound como outbound).
-- ============================================================

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_message_id
  ON public.whatsapp_messages (message_id);

COMMENT ON COLUMN whatsapp_messages.message_id
  IS 'ID del mensaje en la plataforma de Meta (para correlacionar status updates).';

COMMENT ON COLUMN whatsapp_messages.status
  IS 'Último estado reportado por Meta: sent | delivered | read | failed | queued.';
