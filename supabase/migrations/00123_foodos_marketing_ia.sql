-- ============================================================
-- 00123 — FoodOS: Marketing IA multicanal (nivel Plata)
-- ============================================================
-- Fase 3 del roadmap de paridad con FluxSales.
--
-- Extiende el motor de recurrencia que ya existía (automatizaciones de
-- WhatsApp + campañas) con lo que faltaba para considerarlo "marketing":
--
--   1. Automatizaciones nuevas: cumpleaños, carrito abandonado y
--      solicitud de reseña.
--   2. Audiencias RFM: la automatización puede apuntar a una audiencia
--      (champions, en riesgo, dormidos...) además del segmento simple.
--   3. Pruebas A/B: un segundo mensaje y una marca por envío.
--   4. Multicanal: WhatsApp (Meta) o SMS (adaptador), con registro del
--      proveedor que efectivamente envió.
--   5. Cumpleaños del cliente y opt-in de SMS.
--
-- DECISIÓN: las audiencias RFM NO se cachean en una columna. Se computan
-- en vivo (ver `src/lib/foodos-rfm.ts`) para que exista una sola fuente de
-- verdad; una columna desnormalizada se desincronizaría con el tiempo,
-- igual que el `segment` heredado.
--
-- DECISIÓN: el SMS es de plataforma (credenciales en variables de entorno,
-- ver `src/lib/messaging/sms.ts`), no por restaurante. Guardar credenciales
-- de SMS por restaurante exigiría cifrado y no aporta en esta fase.
--
-- Aditiva e idempotente.
-- ============================================================

-- ============================================================
-- 1. AUTOMATIZACIONES: tipos nuevos + A/B + audiencia + canal
-- ============================================================

-- El CHECK original (00023) solo permitía 6 tipos. Se reemplaza por uno
-- que además admite los tres nuevos.
ALTER TABLE foodos_automations
  DROP CONSTRAINT IF EXISTS foodos_automations_type_check;
ALTER TABLE foodos_automations
  ADD CONSTRAINT foodos_automations_type_check CHECK (
    type IN (
      'order_confirmation',
      'thank_you',
      'winback',
      'season_promo',
      'off_hours',
      'new_product',
      'birthday',
      'abandoned_cart',
      'review_request'
    )
  );

ALTER TABLE foodos_automations
  -- Mensaje alternativo de la prueba A/B. NULL = sin experimento.
  ADD COLUMN IF NOT EXISTS message_b TEXT,
  -- Si true y hay `message_b`, cada destinatario cae en A o B de forma
  -- determinista (hash del id del cliente): la misma persona siempre ve
  -- la misma variante, y el reparto es reproducible entre corridas.
  ADD COLUMN IF NOT EXISTS ab_test BOOLEAN NOT NULL DEFAULT false,
  -- Clave de audiencia RFM (ver FOODOS_AUDIENCES en foodos-rfm.ts).
  -- NULL = se usa `trigger_config.target_segment` (comportamiento previo).
  ADD COLUMN IF NOT EXISTS audience TEXT,
  -- Canal preferido. `both` intenta SMS solo para quien dio opt-in.
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';

ALTER TABLE foodos_automations
  DROP CONSTRAINT IF EXISTS foodos_automations_channel_check;
ALTER TABLE foodos_automations
  ADD CONSTRAINT foodos_automations_channel_check
  CHECK (channel IN ('whatsapp', 'sms', 'both'));

-- La lista de audiencias debe coincidir EXACTAMENTE con FOODOS_AUDIENCE_KEYS
-- de `src/lib/foodos-rfm.ts`; hay un test que compara ambos y falla si
-- alguien agrega una audiencia en un solo lado.
ALTER TABLE foodos_automations
  DROP CONSTRAINT IF EXISTS foodos_automations_audience_check;
ALTER TABLE foodos_automations
  ADD CONSTRAINT foodos_automations_audience_check CHECK (
    audience IS NULL OR audience IN (
      'champions',
      'cant_lose',
      'at_risk',
      'loyal',
      'potential_loyalist',
      'new',
      'needs_attention',
      'about_to_sleep',
      'hibernating',
      'lost'
    )
  );

-- ============================================================
-- 2. CLIENTES: cumpleaños y opt-in de SMS
-- ============================================================
ALTER TABLE foodos_customers
  -- Fecha de nacimiento. Solo se usan mes y día (el año no se muestra).
  ADD COLUMN IF NOT EXISTS birthday DATE,
  -- Consentimiento explícito para SMS. Sin esto no se envía SMS nunca.
  ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_foodos_customers_birthday
  ON foodos_customers (restaurant_id, birthday)
  WHERE birthday IS NOT NULL;

-- ============================================================
-- 3. CAMPAÑAS: variante A/B, audiencia y proveedor
-- ============================================================
ALTER TABLE foodos_campaigns
  -- Variante efectivamente enviada ('a' | 'b'). NULL = sin experimento.
  ADD COLUMN IF NOT EXISTS variant TEXT,
  -- Audiencia usada al ejecutar (auditoría de a quién se apuntó).
  ADD COLUMN IF NOT EXISTS audience TEXT,
  -- Proveedor que envió ('meta' | 'twilio'). NULL = aún no se envió.
  ADD COLUMN IF NOT EXISTS provider TEXT;

ALTER TABLE foodos_campaigns
  DROP CONSTRAINT IF EXISTS foodos_campaigns_variant_check;
ALTER TABLE foodos_campaigns
  ADD CONSTRAINT foodos_campaigns_variant_check
  CHECK (variant IS NULL OR variant IN ('a', 'b'));

-- Canales válidos. Se normaliza primero cualquier valor heredado para que
-- la restricción no falle sobre datos existentes.
UPDATE foodos_campaigns
  SET channel = 'whatsapp'
  WHERE channel IS DISTINCT FROM 'whatsapp' AND channel IS DISTINCT FROM 'sms';

ALTER TABLE foodos_campaigns
  DROP CONSTRAINT IF EXISTS foodos_campaigns_channel_check;
ALTER TABLE foodos_campaigns
  ADD CONSTRAINT foodos_campaigns_channel_check
  CHECK (channel IN ('whatsapp', 'sms'));

-- Los hijos de una campaña se leen por restaurante + fecha para armar el
-- reporte de A/B; el índice evita un scan por restaurante grande.
CREATE INDEX IF NOT EXISTS idx_foodos_campaigns_variant
  ON foodos_campaigns (restaurant_id, automation_id, variant, status);
