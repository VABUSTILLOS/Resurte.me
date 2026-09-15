-- ============================================================
-- FoodOS WhatsApp Business por restaurante (supera a take.app):
-- 1. Conexión WABA propia por restaurante (token cifrado)
-- 2. Catálogo curado y ORDENABLE (take.app no permite ordenar
--    ni seleccionar: whatsapp_visible + whatsapp_position)
-- 3. Mensajes del inbox por restaurante
-- Idempotente.
-- ============================================================

-- 1. CONEXIÓN WHATSAPP BUSINESS --------------------------------
-- El access token se guarda cifrado (AES-GCM app-level); solo las
-- API routes con service role lo descifran. Nunca sale al cliente.
CREATE TABLE IF NOT EXISTS foodos_whatsapp_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID NOT NULL UNIQUE REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  phone_number_id   TEXT NOT NULL,
  waba_id           TEXT NOT NULL,
  access_token_enc  TEXT NOT NULL,
  display_phone     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending | connected | error
  status_detail     TEXT,
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. CURADURÍA DEL CATÁLOGO (selección + orden) ----------------
-- whatsapp_visible: aparece en el catálogo de WhatsApp
-- whatsapp_position: orden exacto elegido por el restaurante
ALTER TABLE foodos_menu_items
  ADD COLUMN IF NOT EXISTS whatsapp_visible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_position INTEGER;

CREATE INDEX IF NOT EXISTS idx_foodos_items_whatsapp
  ON foodos_menu_items(restaurant_id, whatsapp_visible, whatsapp_position);

-- 3. MENSAJES DEL INBOX ----------------------------------------
CREATE TABLE IF NOT EXISTS foodos_whatsapp_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  wa_message_id   TEXT,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  customer_phone  TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'text',
  content         TEXT,
  status          TEXT NOT NULL DEFAULT 'received',  -- received | sent | delivered | read | failed
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foodos_wa_msgs_rest
  ON foodos_whatsapp_messages(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_foodos_wa_msgs_customer
  ON foodos_whatsapp_messages(restaurant_id, customer_phone, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_foodos_wa_msgs_waid
  ON foodos_whatsapp_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- ============================================================
-- RLS (solo dueño del restaurante)
-- ============================================================
ALTER TABLE foodos_whatsapp_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages wa connection" ON foodos_whatsapp_connections;
CREATE POLICY "Owner manages wa connection" ON foodos_whatsapp_connections
  FOR ALL USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

ALTER TABLE foodos_whatsapp_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner reads wa messages" ON foodos_whatsapp_messages;
CREATE POLICY "Owner reads wa messages" ON foodos_whatsapp_messages
  FOR SELECT USING (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "Owner sends wa messages" ON foodos_whatsapp_messages;
CREATE POLICY "Owner sends wa messages" ON foodos_whatsapp_messages
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid()));
