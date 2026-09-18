-- 00163 — Panel de prompts GEO: persistencia de las 80 celdas mensuales.
--
-- QUÉ PROBLEMA CIERRA
--
-- `/admin/seo-ia` renderiza una tabla de 20 preguntas × 4 motores = 80 celdas y
-- en cada una imprime un `—` escrito a mano en el JSX. Debajo, un pie de tabla
-- le pide al lector que registre "qué dato se citó" y "si era correcto", y
-- `docs/medicion-seo-ia.md` §2 paso 4 remata con "Guarda los resultados. La
-- comparación mes contra mes es la señal real de progreso."
--
-- O sea: la pantalla y la documentación piden tres cosas que el producto no
-- sabía hacer. El `—` no era un placeholder de diseño, era la ausencia total de
-- almacenamiento. Esta tabla es el almacenamiento.
--
-- MODELO
--
-- Una fila por celda anotada: (mes, pregunta, motor) → los 5 campos de
-- `GEO_PANEL_FIELDS`. No hay tabla de "corridas" a propósito: una corrida queda
-- completamente identificada por su mes, así que una tabla aparte solo tendría
-- la columna `run_month` y una fecha. Un mes sin filas = mes no corrido; un mes
-- a medias se ve en la cobertura (`filas/80`). La entidad no aportaba nada.
--
-- Los 5 campos de `src/lib/geo-queries.ts` se mapean así:
--   citado     → cited            BOOLEAN
--   posicion   → citation_position SMALLINT (NULL = no apareció en la respuesta)
--   dato       → cited_fact       TEXT     (NULL = no se citó ningún dato)
--   exacto     → fact_accuracy    TEXT IN ('si','no','parcial')
--   competidor → competitor_host  TEXT
--
-- POR QUÉ LOS CHECKS SON ESTRICTOS
--
-- `cited = false` con `citation_position = 3` es una contradicción: no puedes
-- estar en la posición 3 de una respuesta que no te citó. La misma lógica aplica
-- a `fact_accuracy`: si no te citaron, no hay dato que evaluar. La restricción
-- va en la base y no solo en el formulario porque el valor de esta tabla es
-- comparar meses: una fila contradictoria contamina la tasa de acierto, que es
-- justo lo que el panel calcula.
--
-- ACCESO — service_role únicamente, y por qué
--
-- `admin_audit_log` tiene solo policy de SELECT (00072/00145): sus INSERT vienen
-- de service_role. Como cada escritura de este panel se audita con
-- `logAdminAction`, el cliente ya tiene que ser service_role; usar un segundo
-- cliente para el dato y otro para la bitácora solo abre la puerta a que uno
-- escriba y el otro no.
--
-- El `REVOKE ALL ... FROM anon, authenticated` es explícito y no decorativo:
-- Supabase concede privilegios de tabla por `ALTER DEFAULT PRIVILEGES`, así que
-- una tabla nueva nace con GRANT para `anon`/`authenticated`. Es exactamente el
-- mecanismo que dejó inertes los REVOKE por columna de 00085 y 00159 (ver
-- §8.14 del plan). Aquí se revoca a nivel de tabla, que es el nivel que manda.
--
-- RLS queda habilitado SIN policy para `authenticated`: fail-closed. Si algún
-- día alguien vuelve a conceder la tabla (o la mete en una lista de privilegios
-- por defecto), el resultado sigue siendo cero filas en vez de datos abiertos.

CREATE TABLE IF NOT EXISTS public.geo_panel_checks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Primer día del mes de la corrida. Se normaliza para que "septiembre" sea
  -- una sola clave y no 30.
  run_month DATE NOT NULL,
  query_id TEXT NOT NULL,
  engine_id TEXT NOT NULL,
  cited BOOLEAN NOT NULL DEFAULT false,
  citation_position SMALLINT,
  cited_fact TEXT,
  fact_accuracy TEXT,
  competitor_host TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT geo_panel_checks_cell_unique UNIQUE (run_month, query_id, engine_id),
  CONSTRAINT geo_panel_checks_month_is_first_day
    CHECK (run_month = date_trunc('month', run_month)::date),
  CONSTRAINT geo_panel_checks_position_range
    CHECK (citation_position IS NULL OR citation_position BETWEEN 1 AND 50),
  CONSTRAINT geo_panel_checks_accuracy_values
    CHECK (fact_accuracy IS NULL OR fact_accuracy IN ('si', 'no', 'parcial')),
  CONSTRAINT geo_panel_checks_fact_length
    CHECK (cited_fact IS NULL OR char_length(cited_fact) <= 300),
  CONSTRAINT geo_panel_checks_competitor_length
    CHECK (competitor_host IS NULL OR char_length(competitor_host) <= 120),
  CONSTRAINT geo_panel_checks_notes_length
    CHECK (notes IS NULL OR char_length(notes) <= 500),
  -- Una celda que no citó no puede tener posición ni veredicto sobre el dato.
  CONSTRAINT geo_panel_checks_cited_consistency
    CHECK (cited OR (citation_position IS NULL AND fact_accuracy IS NULL))
);

COMMENT ON TABLE public.geo_panel_checks IS
  'Una fila por celda (mes × pregunta × motor) del panel de prompts GEO. Los 5 campos son los de GEO_PANEL_FIELDS en src/lib/geo-queries.ts.';
COMMENT ON COLUMN public.geo_panel_checks.run_month IS
  'Primer día del mes de la corrida. Normalizado por CHECK para que la comparación mes contra mes tenga una sola clave.';
COMMENT ON COLUMN public.geo_panel_checks.citation_position IS
  'Posición en la que apareció Resurte.me. NULL si no apareció (o si no se pudo determinar).';
COMMENT ON COLUMN public.geo_panel_checks.fact_accuracy IS
  'si = la cifra coincide; no = la IA dijo otra cosa; parcial = mezcló datos correctos e incorrectos. NULL si no se citó ningún dato.';

-- El panel siempre lee por mes; el índice único ya cubre la celda.
CREATE INDEX IF NOT EXISTS geo_panel_checks_run_month_idx
  ON public.geo_panel_checks (run_month DESC);

DROP TRIGGER IF EXISTS trg_touch_geo_panel_checks ON public.geo_panel_checks;
CREATE TRIGGER trg_touch_geo_panel_checks
  BEFORE UPDATE ON public.geo_panel_checks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.geo_panel_checks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.geo_panel_checks FROM anon, authenticated;
GRANT ALL ON public.geo_panel_checks TO service_role;

-- Autoverificación: la migración falla en vez de aplicar un estado a medias.
DO $guard$
DECLARE
  v_n INTEGER;
BEGIN
  IF to_regclass('public.geo_panel_checks') IS NULL THEN
    RAISE EXCEPTION 'geo_panel_checks no existe';
  END IF;

  -- Las 5 columnas de valor + la clave de la celda.
  SELECT count(*) INTO v_n
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'geo_panel_checks'
    AND column_name IN ('run_month', 'query_id', 'engine_id', 'cited',
                        'citation_position', 'cited_fact', 'fact_accuracy',
                        'competitor_host');
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'Faltan columnas en geo_panel_checks (esperadas 8, hay %)', v_n;
  END IF;

  -- La celda debe ser única: sin esto se pueden duplicar filas del mismo mes.
  SELECT count(*) INTO v_n
  FROM pg_constraint
  WHERE conrelid = 'public.geo_panel_checks'::regclass
    AND conname = 'geo_panel_checks_cell_unique';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Falta la restricción de unicidad de celda';
  END IF;

  SELECT count(*) INTO v_n
  FROM pg_constraint
  WHERE conrelid = 'public.geo_panel_checks'::regclass
    AND conname = 'geo_panel_checks_cited_consistency';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Falta la restricción de coherencia de cita';
  END IF;

  -- RLS habilitado y sin policy: fail-closed.
  SELECT count(*) INTO v_n FROM pg_class
  WHERE oid = 'public.geo_panel_checks'::regclass AND relrowsecurity;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'RLS no está habilitado en geo_panel_checks';
  END IF;

  SELECT count(*) INTO v_n FROM pg_policy
  WHERE polrelid = 'public.geo_panel_checks'::regclass;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'geo_panel_checks no debe tener policies (acceso solo por service_role)';
  END IF;

  -- Y el privilegio de tabla, que es el nivel que manda sobre el de columna.
  IF has_table_privilege('anon', 'public.geo_panel_checks', 'SELECT')
     OR has_table_privilege('authenticated', 'public.geo_panel_checks', 'SELECT')
     OR has_table_privilege('anon', 'public.geo_panel_checks', 'INSERT')
     OR has_table_privilege('authenticated', 'public.geo_panel_checks', 'INSERT') THEN
    RAISE EXCEPTION 'anon/authenticated conservan privilegios sobre geo_panel_checks';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.geo_panel_checks', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.geo_panel_checks', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.geo_panel_checks', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.geo_panel_checks', 'DELETE') THEN
    RAISE EXCEPTION 'service_role no tiene los privilegios necesarios';
  END IF;

  -- El trigger de updated_at reutiliza el helper de 00066.
  SELECT count(*) INTO v_n FROM pg_proc
  WHERE proname = 'touch_updated_at' AND pronamespace = 'public'::regnamespace;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Falta public.touch_updated_at()';
  END IF;
END
$guard$;
