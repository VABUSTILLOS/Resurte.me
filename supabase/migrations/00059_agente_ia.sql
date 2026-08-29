-- ============================================================
-- Resurte.me — Agente de Ventas IA (Comercialización)
--
-- Extiende el CRM de vendedores con:
--   1. Segmentación de prospectos (tier, zona, volumen, empleados)
--      según el Plan de Prospección Chihuahua.
--   2. Tipo de actividad 'demo' (KPI diario del agente).
--   3. crm_agent_messages: mensajes redactados por el agente IA con
--      flujo de aprobación humana (borrador → aprobado → enviado).
--   4. crm_agent_goals: metas diarias/mensuales configurables por
--      vendedor (defaults del plan: 8 visitas, 15 WA, 5 llamadas,
--      3 demos; mes 1: 20 registros / 12 activos / $100k).
--
-- Idempotente: se aplica a mano en el SQL Editor de Supabase.
-- ============================================================

-- 1. Segmentación de prospectos (Plan de Prospección Chihuahua)
ALTER TABLE crm_prospects
  ADD COLUMN IF NOT EXISTS tier               SMALLINT CHECK (tier IN (1, 2, 3)),
  ADD COLUMN IF NOT EXISTS zone               TEXT,
  ADD COLUMN IF NOT EXISTS employees          INTEGER,
  ADD COLUMN IF NOT EXISTS instagram          TEXT,
  ADD COLUMN IF NOT EXISTS weekly_volume_min  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS weekly_volume_max  NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_crm_prospects_tier ON crm_prospects(tier);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_zone ON crm_prospects(zone);

COMMENT ON COLUMN crm_prospects.tier IS '1 = Early Adopter, 2 = Growth, 3 = Long Tail (Plan Chihuahua)';
COMMENT ON COLUMN crm_prospects.zone IS 'Zona de prospección: centro | distrito_uno | paseo_central | periferico';

-- 2. 'demo' como tipo de actividad (el agente registra demos de la app)
ALTER TABLE crm_activities DROP CONSTRAINT IF EXISTS crm_activities_type_check;
ALTER TABLE crm_activities
  ADD CONSTRAINT crm_activities_type_check
  CHECK (type IN ('llamada','whatsapp','correo','visita','nota','pedido','demo'));

-- 3. Mensajes generados por el agente IA (aprobación humana)
CREATE TABLE IF NOT EXISTS public.crm_agent_messages (
  id           BIGSERIAL PRIMARY KEY,
  seller_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prospect_id  BIGINT NOT NULL REFERENCES public.crm_prospects(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN (
                 'primer_contacto','seguimiento','cierre_urgencia',
                 'reorden','reactivacion','upsell')),
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'borrador'
                 CHECK (status IN ('borrador','aprobado','enviado','descartado')),
  model        TEXT, -- modelo usado ('plantilla' si fue fallback determinista)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at  TIMESTAMPTZ,
  sent_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_agent_messages_seller   ON crm_agent_messages(seller_id);
CREATE INDEX IF NOT EXISTS idx_crm_agent_messages_prospect ON crm_agent_messages(prospect_id);
CREATE INDEX IF NOT EXISTS idx_crm_agent_messages_status   ON crm_agent_messages(status);

-- 4. Metas del agente por vendedor (defaults del Plan Chihuahua)
CREATE TABLE IF NOT EXISTS public.crm_agent_goals (
  seller_id          UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  daily_visitas      INTEGER NOT NULL DEFAULT 8,
  daily_whatsapp     INTEGER NOT NULL DEFAULT 15,
  daily_llamadas     INTEGER NOT NULL DEFAULT 5,
  daily_demos        INTEGER NOT NULL DEFAULT 3,
  monthly_registros  INTEGER NOT NULL DEFAULT 20,
  monthly_activos    INTEGER NOT NULL DEFAULT 12,
  monthly_ventas     NUMERIC(12,2) NOT NULL DEFAULT 100000,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. RLS (mismo patrón que el CRM: dueño + service_role)
ALTER TABLE public.crm_agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_agent_goals    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_agent_messages_owner_all" ON public.crm_agent_messages;
CREATE POLICY "crm_agent_messages_owner_all"
  ON public.crm_agent_messages
  FOR ALL TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "crm_agent_messages_service_all" ON public.crm_agent_messages;
CREATE POLICY "crm_agent_messages_service_all"
  ON public.crm_agent_messages
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "crm_agent_goals_owner_all" ON public.crm_agent_goals;
CREATE POLICY "crm_agent_goals_owner_all"
  ON public.crm_agent_goals
  FOR ALL TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "crm_agent_goals_service_all" ON public.crm_agent_goals;
CREATE POLICY "crm_agent_goals_service_all"
  ON public.crm_agent_goals
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
