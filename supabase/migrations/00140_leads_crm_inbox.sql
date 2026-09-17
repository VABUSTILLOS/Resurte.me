-- ============================================================
-- 00140 — Leads CRM: bandeja de conversaciones, etiquetas y secuencias
--
-- Ronda 6 del panel /admin/leads (inspirada en los pilares de Pabbly Chatflow).
-- Aporta los cuatro cimientos que faltaban:
--
-- 1. Etiquetas de prospecto (`tags`) para segmentar la cartera sin abrir una
--    tabla de segmentos: un arreglo de texto + índice GIN resuelve `@>` y `&&`.
--
-- 2. Clave de teléfono normalizada en `whatsapp_messages`. El webhook ya guarda
--    los mensajes entrantes desde 00041, pero NADIE los leía: no existía vista de
--    conversación. `from_number` guarda el número tal como lo manda Meta
--    (`+52 614 123 4567`, `526141234567`, `6141234567`), así que unirlos con
--    `leads.phone` o `crm_prospects.phone` era imposible sin normalizar.
--    `from_digits` es una columna GENERADA: no hay que tocar el webhook, no hay
--    backfill y no puede desincronizarse. La expresión es exactamente
--    `phoneKey()` de `src/lib/crm-pipeline.ts` (últimos 10 dígitos; en México el
--    nacional son 10 y la lada del país varía según quién capturó el número).
--
-- 3. Respuestas rápidas (`crm_quick_replies`): texto reutilizable para contestar
--    sin reescribir. Se guardan las variables como texto literal; el renderizado
--    es responsabilidad de `src/lib/crm-inbox.ts`.
--
-- 4. Secuencias de goteo (`crm_sequences` + pasos + inscripciones). Una secuencia
--    nace APAGADA (`is_active = false`) y una inscripción solo ENCOLA el
--    siguiente paso: nunca se envía en bloque desde la interfaz. Los envíos se
--    registran en `whatsapp_automation_sends` (00097) con
--    `automation_type = 'crm_sequence'`, reutilizando su `dedupe_key UNIQUE`.
--
-- Decisión de diseño: NO se denormaliza "último mensaje" en `crm_prospects`
-- (`last_inbound_at` / `last_message_preview`). El panel pide una página de como
-- mucho 50 prospectos y resuelve su timeline con una segunda consulta por
-- `from_digits`; así no hay columnas que se queden obsoletas ni escrituras
-- extra en el webhook (ruta caliente y con HMAC).
--
-- RLS: las tablas nuevas son de uso exclusivo del panel (service_role). No se
-- añaden políticas para vendedores, igual que `whatsapp_automation_sends`.
-- ============================================================

-- 1. Etiquetas de prospecto ------------------------------------------------
ALTER TABLE public.crm_prospects
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.crm_prospects.tags IS
  'Etiquetas libres del prospecto (p.ej. {vip,mayoreo}). Vacío = sin etiquetar. Se filtran con el operador de contención (@>).';

CREATE INDEX IF NOT EXISTS idx_crm_prospects_tags
  ON public.crm_prospects USING GIN (tags);

-- 2. Clave de teléfono normalizada de los mensajes --------------------------
-- `right(regexp_replace(...))` es IMMUTABLE, así que sirve para columna generada
-- e índice. NULLIF deja NULL (no cadena vacía) cuando no hay dígitos, para que
-- coincida con `phoneKey()`, que devuelve null en ese caso.
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS from_digits TEXT
    GENERATED ALWAYS AS (
      NULLIF(right(regexp_replace(from_number, '\D', '', 'g'), 10), '')
    ) STORED;

COMMENT ON COLUMN public.whatsapp_messages.from_digits IS
  'Últimos 10 dígitos de from_number. Equivale a phoneKey() de src/lib/crm-pipeline.ts y es la llave para unir un mensaje con leads.phone / crm_prospects.phone. Generada: nunca se escribe a mano.';

-- Cubre la consulta real del panel: el timeline de una conversación (igualdad
-- por clave, más recientes primero).
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_from_digits
  ON public.whatsapp_messages (from_digits, created_at DESC);

-- 3. Respuestas rápidas -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_quick_replies (
  id         BIGSERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  category   TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_quick_replies_title_unique UNIQUE (title)
);

COMMENT ON TABLE public.crm_quick_replies IS
  'Plantillas de texto para contestar en la bandeja. Solo las activas se ofrecen al vendedor.';

CREATE INDEX IF NOT EXISTS idx_crm_quick_replies_active
  ON public.crm_quick_replies (sort_order, title)
  WHERE is_active;

DROP TRIGGER IF EXISTS trg_crm_quick_replies_updated_at ON public.crm_quick_replies;

CREATE TRIGGER trg_crm_quick_replies_updated_at
  BEFORE UPDATE ON public.crm_quick_replies
  FOR EACH ROW
  EXECUTE FUNCTION set_crm_updated_at();

-- 4. Secuencias de goteo ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_sequences (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_sequences_name_unique UNIQUE (name)
);

COMMENT ON TABLE public.crm_sequences IS
  'Secuencia de mensajes programados. Nace apagada (is_active = false): activarla es un acto explícito del admin.';

CREATE TABLE IF NOT EXISTS public.crm_sequence_steps (
  id            BIGSERIAL PRIMARY KEY,
  sequence_id   BIGINT NOT NULL REFERENCES public.crm_sequences(id) ON DELETE CASCADE,
  step_order    INTEGER NOT NULL CHECK (step_order > 0),
  delay_hours   INTEGER NOT NULL DEFAULT 24 CHECK (delay_hours >= 0),
  template_name TEXT,
  body          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_sequence_steps_order_unique UNIQUE (sequence_id, step_order),
  CONSTRAINT crm_sequence_steps_payload_check
    CHECK (template_name IS NOT NULL OR body IS NOT NULL)
);

COMMENT ON COLUMN public.crm_sequence_steps.delay_hours IS
  'Horas de espera desde el paso anterior (o desde la inscripción, en el paso 1) antes de enviar.';

COMMENT ON COLUMN public.crm_sequence_steps.template_name IS
  'Plantilla aprobada por Meta. Obligatoria cuando la ventana de 24 h está cerrada; el motor decide.';

CREATE TABLE IF NOT EXISTS public.crm_sequence_enrollments (
  id           BIGSERIAL PRIMARY KEY,
  sequence_id  BIGINT NOT NULL REFERENCES public.crm_sequences(id) ON DELETE CASCADE,
  prospect_id  BIGINT NOT NULL REFERENCES public.crm_prospects(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  next_run_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'activa'
    CHECK (status IN ('activa', 'pausada', 'completada', 'cancelada')),
  enrolled_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_sequence_enrollments_unique UNIQUE (sequence_id, prospect_id)
);

COMMENT ON TABLE public.crm_sequence_enrollments IS
  'Un prospecto inscrito en una secuencia. La UNIQUE evita inscribirlo dos veces en la misma secuencia; el motor lo inscribe en otra secuencia sin problema.';

COMMENT ON COLUMN public.crm_sequence_enrollments.current_step IS
  'Último paso enviado (0 = inscrito, todavía sin enviar). El siguiente a enviar es current_step + 1.';

-- El cron busca solo lo vencido y activo: índice parcial, no uno completo.
CREATE INDEX IF NOT EXISTS idx_crm_sequence_enrollments_due
  ON public.crm_sequence_enrollments (next_run_at)
  WHERE status = 'activa';

CREATE INDEX IF NOT EXISTS idx_crm_sequence_enrollments_prospect
  ON public.crm_sequence_enrollments (prospect_id);

DROP TRIGGER IF EXISTS trg_crm_sequences_updated_at ON public.crm_sequences;

CREATE TRIGGER trg_crm_sequences_updated_at
  BEFORE UPDATE ON public.crm_sequences
  FOR EACH ROW
  EXECUTE FUNCTION set_crm_updated_at();

DROP TRIGGER IF EXISTS trg_crm_sequence_enrollments_updated_at ON public.crm_sequence_enrollments;

CREATE TRIGGER trg_crm_sequence_enrollments_updated_at
  BEFORE UPDATE ON public.crm_sequence_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION set_crm_updated_at();

-- 5. RLS: solo service_role ------------------------------------------------
ALTER TABLE public.crm_quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;

-- Sin políticas a propósito: las cuatro tablas las lee y escribe el panel con
-- service_role, igual que whatsapp_automation_sends. Habilitar RLS sin políticas
-- deja fuera a `anon` y `authenticated`, que es justo lo que se busca.
