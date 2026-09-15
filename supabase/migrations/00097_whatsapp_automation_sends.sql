-- ============================================================
-- Automatizaciones WhatsApp (fase WC2/WC3): bitácora y dedupe
-- de envíos. whatsapp_messages no sirve (requiere store_id y no
-- guarda destinatario), así que va tabla ligera propia.
-- dedupe_key UNIQUE evita reenvíos (carrito/pedido/cliente/día).
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_automation_sends (
  id              BIGSERIAL PRIMARY KEY,
  automation_type TEXT NOT NULL,
  recipient       TEXT NOT NULL,          -- teléfono destino
  dedupe_key      TEXT NOT NULL,          -- automationDedupeKey
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  order_id        BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'sent',  -- sent | failed | skipped
  detail          TEXT,                   -- message_id o error
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_wa_automation_sends_type
  ON whatsapp_automation_sends(automation_type, created_at DESC);

ALTER TABLE whatsapp_automation_sends ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo service role (cron + admin).
