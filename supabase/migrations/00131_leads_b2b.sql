-- ============================================================
-- 00131_leads_b2b.sql — Leads B2B de la landing /restaurantes (Fase 8)
-- ============================================================
-- Decisiones:
--
-- 1. El CHECK de `leads.source` (00049) solo admitía 'checkout_drawer' y
--    'exit_intent'. La ruta /api/leads es fail-open a propósito, así que un
--    source nuevo sin migración NO habría fallado de forma visible: habría
--    respondido 200 y tirado cada lead de la landing en silencio. Se recrea el
--    CHECK con el source nuevo.
--
-- 2. `qualification` guarda el diagnóstico del calificador ya derivado por el
--    SERVIDOR, no las respuestas crudas. Así queda la foto de lo que se
--    concluyó en el momento del alta, y el navegador nunca puede inflar su
--    propio puntaje. Las respuestas crudas viajan en el mismo JSON para poder
--    auditar el puntaje después.
--
-- 3. `restaurant_name` va en su propia columna (no dentro del JSON) porque es
--    el dato por el que un humano busca el lead en el panel.
--
-- 4. Aditivo y compatible: las columnas son nullable y los leads existentes
--    quedan con `qualification = NULL`. `getAdminLeads` sigue seleccionando
--    columnas explícitas, así que la vista previa no cambia por accidente.
-- ============================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS restaurant_name TEXT,
  ADD COLUMN IF NOT EXISTS qualification   JSONB;

-- El CHECK original se llamaba leads_source_check y enumeraba los sources.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_check CHECK (
    source IN ('checkout_drawer', 'exit_intent', 'restaurantes_landing')
  );

COMMENT ON COLUMN public.leads.restaurant_name IS
  'Nombre del restaurante, solo para leads B2B de /restaurantes.';
COMMENT ON COLUMN public.leads.qualification IS
  'Diagnóstico del calificador derivado en el servidor: { score, segment, recommended_tier, recommended_features, reasons, answers }. NULL en leads del checkout.';

COMMENT ON TABLE public.leads IS
  'Leads capturados en el checkout drawer (email onBlur y exit-intent) y en la landing B2B /restaurantes. No afecta el flujo de órdenes.';

-- El panel filtra por source y ordena por fecha; el índice del correo (00049)
-- no sirve para ese patrón.
CREATE INDEX IF NOT EXISTS idx_leads_source_created_at
  ON public.leads (source, created_at DESC);

-- RLS: sin cambios. `leads` no tiene políticas para usuarios finales (se
-- escribe con service role desde la ruta), así que el dueño de un restaurante
-- no puede leer los leads de nadie, ni siquiera los suyos.
