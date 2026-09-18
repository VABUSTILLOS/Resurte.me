-- ============================================================================
-- 00180 — La misma bomba de relojería, en el segundo par de funciones
-- ============================================================================
--
-- CONTEXTO
-- --------
-- 00179 reparó la cadena de alta de usuarios: `set_referral_code()` llamaba
-- `generate_referral_code()` sin calificar y sin fijar `search_path`, así que
-- la resolución dependía del `search_path` de la sesión. Bajo la sesión de
-- GoTrue (`search_path = auth`) eso rompía el registro de TODO el sitio.
--
-- Una auditoría de clase —«¿qué otras funciones tienen esta forma?»— encontró
-- el mismo patrón, byte por byte, en la cadena de prospectos del CRM:
--
--   public.set_crm_prospect_code()   SECURITY DEFINER, SIN search_path,
--                                    trigger trg_set_crm_prospect_code
--                                    sobre crm_prospects, y llama
--                                    `generate_crm_prospect_code()` SIN CALIFICAR.
--
--   public.generate_crm_prospect_code()   INVOKER, SIN search_path, y consulta
--                                         `crm_prospects` SIN CALIFICAR.
--
-- HOY NO FALLA, Y ESO ES EXACTAMENTE EL PROBLEMA
-- ----------------------------------------------
-- `anon`, `authenticated` y `service_role` no tienen `search_path` en su
-- `rolconfig`, así que heredan el de la sesión, que PostgREST fija en `public`.
-- Por eso hoy un INSERT en `crm_prospects` desde la app funciona. Pero eso es
-- una dependencia de una configuración que este repositorio NO controla: el día
-- que cambie —como cambió la de `supabase_auth_admin` y tumbó el registro— el
-- alta de prospectos se cae con 42883. La diferencia con 00179 es sólo que ahí
-- ya había explotado.
--
-- ARREGLO — la misma forma que 00179
-- ----------------------------------
--   * `set_crm_prospect_code()`: `SET search_path = ''` + llamada calificada.
--   * `generate_crm_prospect_code()`: `SET search_path = ''` + `public.` en la
--     consulta de unicidad. Sigue siendo INVOKER (como en 00052): no se le
--     añade escalada de privilegios.
--   * `ALTER FUNCTION … SET search_path = public, pg_temp` sobre las funciones
--     de PostGIS que aparecen en la auditoría. Esas NO se pueden reescribir
--     (se revertirían en la próxima actualización de PostGIS) y no las invoca
--     ningún trigger, así que basta con fijar su resolución sin tocar el cuerpo.
--
-- GUARDA PERMANENTE (G3)
-- ----------------------
--   Generaliza la lección: **toda** función SECURITY DEFINER de `public` que
--   sea invocada por un trigger debe fijar `search_path`. Una función de trigger
--   corre con el `search_path` de la sesión que provocó el INSERT; cualquier
--   referencia sin calificar ahí es una dependencia de una configuración ajena.
--   Esta guarda habría detenido los dos fallos antes de llegar a producción.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. generate_crm_prospect_code() — search_path fijo, consulta calificada
-- ---------------------------------------------------------------------------
-- Cuerpo idéntico al de 00052 (mismo algoritmo RESU-XXXXXX, mismo bucle de
-- unicidad sobre crm_prospects). Sólo cambia `SET search_path = ''` y el
-- `public.crm_prospects` calificado.

CREATE OR REPLACE FUNCTION public.generate_crm_prospect_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := 'RESU-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
    SELECT EXISTS (SELECT 1 FROM public.crm_prospects WHERE referral_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_crm_prospect_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_crm_prospect_code() TO service_role;

COMMENT ON FUNCTION public.generate_crm_prospect_code() IS
  'Código único del link de registro del prospecto (RESU-XXXXXX). search_path fijo (00180): sin él la resolución de public.crm_prospects dependía del search_path de la sesión.';


-- ---------------------------------------------------------------------------
-- 2. set_crm_prospect_code() — la misma llamada sin calificar que 00179
-- ---------------------------------------------------------------------------
-- Antes: `NEW.referral_code := generate_crm_prospect_code();` sin calificar y
-- sin `SET search_path`. Funciona hoy sólo porque la sesión de PostgREST trae
-- `public` en su `search_path`.

CREATE OR REPLACE FUNCTION public.set_crm_prospect_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_crm_prospect_code();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_crm_prospect_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_crm_prospect_code() TO service_role;

COMMENT ON FUNCTION public.set_crm_prospect_code() IS
  'BEFORE INSERT en public.crm_prospects: asigna referral_code si viene NULL. search_path fijo y llamada calificada (00180): mismo defecto que 00179 en la cadena de alta.';


-- ---------------------------------------------------------------------------
-- 3. PostGIS: residual aceptado, NO reparable desde migraciones
-- ---------------------------------------------------------------------------
-- `st_estimatedextent(...)` (3 sobrecargas) aparece en la auditoría como
-- SECURITY DEFINER sin `search_path`. NO se puede reparar desde aquí:
--
--   * su propietario es `supabase_admin` (la extensión PostGIS la instala la
--     plataforma), y `ALTER FUNCTION` exige ser propietario → 42501
--     «must be owner of function st_estimatedextent»;
--   * `postgres` no es superusuario (`rolsuper = false`) ni miembro de
--     `supabase_admin` (`pg_has_role('postgres','supabase_admin','MEMBER')` =
--     false), así que no hay puerta de entrada.
--
-- Es el mismo caso que `spatial_ref_sys` (00167): estado de la plataforma, no
-- de este repositorio. **No es un agujero de esta aplicación**: ninguna de las
-- tres sobrecargas la invoca un trigger, y la guarda G3 de más abajo sólo mira
-- funciones de trigger, así que quedan fuera por construcción y no silencian
-- la guarda.
--
-- SE DEJA CONSTANCIA Y NO SE FUERZA. Se intenta el ALTER de forma tolerante
-- para que, si algún día la propiedad cambia, la migración lo recoja sola.

DO $postgis$
DECLARE
  r RECORD;
  v_ok   INT := 0;
  v_skip TEXT := '';
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig,
           (p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)) AS es_mio
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname LIKE 'st_estimatedextent%'
       AND p.prosecdef
       AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) x WHERE x LIKE 'search_path=%'))
  LOOP
    IF NOT r.es_mio THEN
      v_skip := v_skip || CASE WHEN v_skip = '' THEN '' ELSE ', ' END || r.sig;
      CONTINUE;
    END IF;
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
      v_ok := v_ok + 1;
    EXCEPTION WHEN insufficient_privilege THEN
      v_skip := v_skip || CASE WHEN v_skip = '' THEN '' ELSE ', ' END || r.sig;
    END;
  END LOOP;

  IF v_ok > 0 THEN
    RAISE NOTICE '00180: % función(es) de PostGIS con search_path fijado', v_ok;
  END IF;
  IF v_skip <> '' THEN
    RAISE NOTICE '00180 RESIDUAL ACEPTADO: PostGIS sin search_path fijo y sin poder alterarse (owner supabase_admin): %. No las invoca ningún trigger; requiere solicitud a soporte de Supabase.', v_skip;
  END IF;
END
$postgis$;


-- ---------------------------------------------------------------------------
-- 4. Guardas
-- ---------------------------------------------------------------------------

-- G1 — set_crm_prospect_code() fija search_path y llama calificada.
DO $g1$
DECLARE v_cfg TEXT; v_src TEXT;
BEGIN
  SELECT coalesce(array_to_string(p.proconfig, ','), ''), pg_get_functiondef(p.oid)
    INTO v_cfg, v_src
    FROM pg_proc p WHERE p.oid = 'public.set_crm_prospect_code()'::regprocedure;

  IF v_cfg NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION '00180 G1: set_crm_prospect_code() no fija search_path (config=%)', v_cfg;
  END IF;
  IF v_src NOT LIKE '%public.generate_crm_prospect_code()%' THEN
    RAISE EXCEPTION '00180 G1: set_crm_prospect_code() no llama calificada a public.generate_crm_prospect_code()';
  END IF;
END
$g1$;

-- G2 — generate_crm_prospect_code() fija search_path.
DO $g2$
DECLARE v_cfg TEXT;
BEGIN
  SELECT coalesce(array_to_string(p.proconfig, ','), '')
    INTO v_cfg FROM pg_proc p WHERE p.oid = 'public.generate_crm_prospect_code()'::regprocedure;
  IF v_cfg NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION '00180 G2: generate_crm_prospect_code() no fija search_path (config=%)', v_cfg;
  END IF;
END
$g2$;

-- G3 — GUARDA PERMANENTE DE CLASE, generalizada.
--   Toda función SECURITY DEFINER de `public` invocada por un trigger debe fijar
--   `search_path`. Ésta es la guarda que habría detenido 00179 y 00180.
DO $g3$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(DISTINCT p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid AND NOT t.tgisinternal)
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) x WHERE x LIKE 'search_path=%'));

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '00180 G3: funciones de trigger SECURITY DEFINER sin search_path fijo: %', v_bad;
  END IF;
END
$g3$;

-- G4 — la guarda G3 no puede pasar por vacío: debe haber funciones de trigger
--      SECURITY DEFINER en la base. Si no las hay, la consulta está mal escrita.
DO $g4$
DECLARE v_n INT;
BEGIN
  SELECT count(DISTINCT p.oid) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid AND NOT t.tgisinternal);
  IF v_n < 5 THEN
    RAISE EXCEPTION '00180 G4: sólo % funciones de trigger SECURITY DEFINER — la guarda G3 estaría midiendo el vacío', v_n;
  END IF;
END
$g4$;

DO $ok$
BEGIN
  RAISE NOTICE '00180: cadena de prospectos reparada; guarda de clase generalizada';
END
$ok$;
