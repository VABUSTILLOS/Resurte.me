-- ============================================================
-- 00139_leads_crm_conversion.sql — Lead web → prospecto CRM (Ronda 5, L1)
-- ============================================================
-- Decisiones:
--
-- 1. `crm_prospects.seller_id` era NOT NULL (00052). Un lead web no tiene
--    vendedor: entra al pipeline SIN ASIGNAR y el admin lo reparte después.
--    Se elimina el NOT NULL. La política RLS existente
--    (`crm_prospects_owner_all`, USING seller_id = auth.uid()) ya deja los NULL
--    invisibles para vendedores, que es el comportamiento correcto: nadie ve
--    la cartera sin repartir. No se toca ninguna política a propósito.
--
-- 2. La conversión debe ser IDEMPOTENTE: dos clics (o dos pestañas) no pueden
--    crear dos prospectos del mismo lead. Se resuelve con un índice único
--    PARCIAL sobre `lead_id`, que además sirve la búsqueda inversa. Es parcial
--    y no total porque la mayoría de prospectos son manuales (`lead_id IS NULL`)
--    y no deben competir por unicidad entre ellos.
--
-- 3. El vínculo se guarda en AMBOS lados a propósito:
--      crm_prospects.lead_id        → de dónde salió el prospecto
--      leads.converted_prospect_id  → si el lead ya se convirtió
--    Sin la columna en `leads`, la bandeja tendría que resolver "¿ya se
--    convirtió?" con un NOT EXISTS (o un embed inverso de PostgREST, que aquí
--    sería ambiguo porque hay dos FK entre las tablas). Ambas columnas son
--    nullable con ON DELETE SET NULL, así que ninguna borrada deja basura.
--    La acción de conversión escribe las dos en la misma operación.
--
-- 4. `leads.status` ('nuevo' | 'convertido' | 'descartado') saca de la bandeja
--    los leads que no sirven sin borrarlos. `descartado` entra desde el inicio
--    porque es el único desenlace realista para un exit-intent con datos falsos.
--    NO afecta la captura: /api/leads es fail-open e inserta siempre 'nuevo'.
--
-- 5. Índices compuestos alineados al patrón real de consulta del panel
--    (filtrar por estado y ordenar por seguimiento / fecha), no índices sueltos.
-- ============================================================

-- 1. Prospectos sin asignar ---------------------------------------------------
ALTER TABLE public.crm_prospects
  ALTER COLUMN seller_id DROP NOT NULL;

COMMENT ON COLUMN public.crm_prospects.seller_id IS
  'Vendedor asignado. NULL = sin asignar (p.ej. un lead web convertido que el admin aún no reparte). Los NULL no son visibles para vendedores por RLS.';

-- 2. Vínculo lead ↔ prospecto -------------------------------------------------
ALTER TABLE public.crm_prospects
  ADD COLUMN IF NOT EXISTS lead_id BIGINT
    REFERENCES public.leads(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.crm_prospects.lead_id IS
  'Lead web del que se convirtió este prospecto. NULL en prospectos manuales o importados.';

-- Un lead → como máximo un prospecto. Parcial: los manuales no compiten.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_prospects_lead_id
  ON public.crm_prospects (lead_id)
  WHERE lead_id IS NOT NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS converted_prospect_id BIGINT
    REFERENCES public.crm_prospects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'nuevo';

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_check CHECK (status IN ('nuevo', 'convertido', 'descartado'));

COMMENT ON COLUMN public.leads.status IS
  'Bandeja del lead en el panel: nuevo = pendiente, convertido = ya es prospecto, descartado = descartado a mano. La captura en /api/leads siempre inserta nuevo.';

COMMENT ON COLUMN public.leads.converted_prospect_id IS
  'Prospecto CRM creado a partir de este lead. NULL mientras no se convierta.';

COMMENT ON COLUMN public.leads.converted_at IS
  'Momento de la conversión a prospecto. NULL mientras no se convierta.';

-- 3. Índices de filtro --------------------------------------------------------
-- El tablero agrupa por estado y ordena/filtra por seguimiento dentro del estado.
CREATE INDEX IF NOT EXISTS idx_crm_prospects_status_follow_up
  ON public.crm_prospects (status, next_follow_up_at);

-- "Sin asignar" es una vista de primera clase en el panel, no un caso raro.
CREATE INDEX IF NOT EXISTS idx_crm_prospects_unassigned
  ON public.crm_prospects (created_at DESC)
  WHERE seller_id IS NULL;

-- Bandeja de leads: "nuevos, más recientes primero".
CREATE INDEX IF NOT EXISTS idx_leads_status_created_at
  ON public.leads (status, created_at DESC);

-- Contador de la alerta `new_leads`: solo lo pendiente y sin convertir.
CREATE INDEX IF NOT EXISTS idx_leads_pending
  ON public.leads (created_at DESC)
  WHERE status = 'nuevo' AND converted_prospect_id IS NULL;

-- 4. RLS: sin cambios ---------------------------------------------------------
-- `crm_prospects_owner_all` sigue siendo la única política sobre crm_prospects y
-- ya excluye los prospectos sin asignar para vendedores (NULL = auth.uid() nunca
-- es true). No se añade ningún `OR seller_id IS NULL`: eso expondría la cartera
-- sin repartir a todos los vendedores.
-- `leads` no tiene políticas para usuarios finales; se escribe y lee con
-- service_role desde el panel.
