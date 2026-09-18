-- ============================================================================
-- 00179 — REPARACIÓN DEL REGISTRO: `search_path` en la cadena de alta de usuario
-- ============================================================================
--
-- SINTOMA (producción, 2026-09-18). NADIE PODÍA REGISTRARSE:
--
--   POST /auth/v1/signup       → 500 {"error_code":"unexpected_failure",
--                                     "msg":"Database error saving new user"}
--   POST /auth/v1/admin/users  → 500 {"error_code":"unexpected_failure",
--                                     "msg":"Database error creating new user"}
--
--   Ambos mensajes son el mismo fallo: la transacción que inserta en
--   `auth.users` aborta. No es un problema de GoTrue, ni de email, ni de la API
--   key: es un trigger de Postgres que lanza una excepción.
--
--
-- CAUSA RAÍZ (medida en la base de datos en vivo, no inferida)
-- ------------------------------------------------------------
--
--   1. El rol con el que GoTrue conecta tiene un `search_path` que NO incluye
--      `public`:
--
--        pg_roles.rolconfig de supabase_auth_admin
--          = {search_path=auth, idle_in_transaction_session_timeout=60000, log_statement=none}
--
--      (comparar: `postgres` = {search_path="$user", public, extensions};
--                 `supabase_admin` = {search_path="$user", public, auth, extensions})
--
--   2. La cadena de alta es ésta:
--
--        GoTrue  INSERT INTO auth.users
--          └─ trigger on_auth_user_created → public.handle_new_user()
--               └─ INSERT INTO public.profiles
--                    └─ trigger trg_set_referral_code → public.set_referral_code()
--                         └─ generate_referral_code()          ← SIN CALIFICAR
--
--   3. `set_referral_code()` es SECURITY DEFINER pero NO fijaba `search_path`.
--      Un SECURITY DEFINER **no** hereda el `search_path` del definidor: si la
--      función no lo fija, la resolución de nombres usa el `search_path` de la
--      SESIÓN. La sesión es la de GoTrue (`auth`), y `generate_referral_code()`
--      vive en `public`. Resultado medido:
--
--        42883 :: function generate_referral_code() does not exist
--                 :: PL/pgSQL function public.set_referral_code() line 4 at assignment
--
--      La función SÍ existe:
--        to_regprocedure('public.generate_referral_code()') = generate_referral_code()
--
--   4. La excepción sube por `handle_new_user()` —que no la captura—, aborta el
--      INSERT en `auth.users` y GoTrue devuelve 500. El alta queda imposible.
--
--
-- POR QUÉ SE ROMPIÓ AHORA Y NO ANTES
-- ----------------------------------
--   El `search_path` de `supabase_auth_admin` es configuración de la plataforma
--   de Supabase, no de este repositorio. Los tres perfiles existentes
--   (2026-08-04, 2026-08-05, 2026-08-29) se crearon cuando la resolución de
--   `generate_referral_code()` aún alcanzaba `public`. **No es una regresión
--   introducida por una migración de este repo**: es una dependencia latente de
--   un `search_path` ajeno que la plataforma cambió. Ese es exactamente el tipo
--   de dependencia que un `SET search_path` fijo elimina.
--
--
-- ARREGLO — tres capas, de dentro hacia fuera
-- -------------------------------------------
--   (1) `set_referral_code()`: califica `public.generate_referral_code()` y fija
--       `SET search_path = ''`. La resolución deja de depender de la sesión.
--   (2) `generate_referral_code()`: fija `SET search_path = ''` y califica
--       `public.profiles`. Sigue siendo SECURITY INVOKER (como en 00018): ya
--       corre con los privilegios de `postgres` a través de la cadena de
--       definidores, y no se le añade escalada de privilegios.
--   (3) `handle_new_user()`: fija `SET search_path = ''` y CAPTURA el error del
--       INSERT del perfil. **Crear la cuenta es el dato crítico; crear el perfil
--       es un efecto secundario.** Un fallo al crear el perfil nunca debe volver
--       a dejar a nadie sin poder registrarse. Si el INSERT falla, se emite un
--       WARNING con SQLSTATE/SQLERRM y el alta continúa.
--
--   (4) Se añade una guarda permanente que falla si cualquier función de trigger
--       SECURITY DEFINER de la cadena de alta vuelve a quedarse sin
--       `search_path` fijo. Esta guarda habría detenido el fallo antes de
--       llegar a producción.
--
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. generate_referral_code() — search_path fijo, todo calificado
-- ---------------------------------------------------------------------------
-- Cuerpo idéntico al de 00018 (mismo algoritmo RESU-XXXXXX, mismo bucle de
-- unicidad). Lo único que cambia es `SET search_path = ''` y el
-- `public.profiles` calificado.

CREATE OR REPLACE FUNCTION public.generate_referral_code()
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
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_referral_code() TO service_role;

COMMENT ON FUNCTION public.generate_referral_code() IS
  'Código de referido único (RESU-XXXXXX). search_path fijo (00179): sin él la resolución de public.profiles dependía del search_path de la sesión y el alta de usuarios fallaba con 42883.';


-- ---------------------------------------------------------------------------
-- 2. set_referral_code() — la línea que rompía el registro
-- ---------------------------------------------------------------------------
-- Antes: `NEW.referral_code := generate_referral_code();` sin calificar y sin
-- `SET search_path`. Bajo la sesión de GoTrue (`search_path = auth`) esa llamada
-- no se resolvía y abortaba el alta completa.

CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_referral_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_referral_code() TO service_role;

COMMENT ON FUNCTION public.set_referral_code() IS
  'BEFORE INSERT en public.profiles: asigna referral_code si viene NULL. search_path fijo y llamada calificada (00179): la versión anterior sin calificar abortaba el registro de usuarios cuando la sesión no tenía public en el search_path (GoTrue).';


-- ---------------------------------------------------------------------------
-- 3. handle_new_user() — el alta no puede depender de un efecto secundario
-- ---------------------------------------------------------------------------
-- El INSERT del perfil se conserva tal cual (mismas columnas, mismo origen de
-- datos). Lo que cambia:
--   * `SET search_path = ''` y nombres calificados.
--   * Un bloque EXCEPTION alrededor del INSERT: si el perfil no se puede crear,
--     se registra un WARNING y la cuenta se crea igual. Antes, cualquier fallo
--     aquí impedía registrarse a todo el mundo.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'avatar_url'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Crear la cuenta nunca debe depender de crear el perfil. Si esto se
    -- dispara, hay un perfil pendiente de reparar; el alta ya se completó.
    RAISE WARNING 'handle_new_user: no se pudo crear el perfil de % — % (%)',
      NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- GoTrue ejecuta este trigger con `supabase_auth_admin`. Sin este GRANT el
-- INSERT en auth.users falla con 42501 antes siquiera de entrar al cuerpo.
-- (00169 ya lo concedía; se reafirma aquí para que la migración sea autónoma.)
DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
  END IF;
END
$grant$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'AFTER INSERT en auth.users: crea el perfil. search_path fijo y el INSERT del perfil envuelto en un bloque EXCEPTION (00179): crear la cuenta no puede depender de un efecto secundario.';


-- ---------------------------------------------------------------------------
-- 4. Retirada de la instrumentación de diagnóstico
-- ---------------------------------------------------------------------------
-- Durante el diagnóstico se instalaron sondas temporales para capturar el
-- error real. Se retiran todas: la tabla de log, las funciones de sonda y el
-- trigger BEFORE sobre auth.users.

DROP TRIGGER IF EXISTS zz_before_ins ON auth.users;
DROP FUNCTION IF EXISTS public.zz_before();
DROP FUNCTION IF EXISTS public.zz_probe(uuid, text, text);
DROP FUNCTION IF EXISTS public.zz_probe_def(uuid);
DROP FUNCTION IF EXISTS public.zz_probe_inv(uuid);
DROP TABLE IF EXISTS public.zz_diag_log;


-- ---------------------------------------------------------------------------
-- 5. Guardas
-- ---------------------------------------------------------------------------

-- G1 — set_referral_code() fija search_path y llama calificada.
DO $g1$
DECLARE v_cfg TEXT; v_src TEXT;
BEGIN
  SELECT coalesce(array_to_string(p.proconfig, ','), ''), pg_get_functiondef(p.oid)
    INTO v_cfg, v_src
    FROM pg_proc p
   WHERE p.oid = 'public.set_referral_code()'::regprocedure;

  IF v_cfg NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION '00179 G1: set_referral_code() no fija search_path (config=%)', v_cfg;
  END IF;
  IF v_src NOT LIKE '%public.generate_referral_code()%' THEN
    RAISE EXCEPTION '00179 G1: set_referral_code() no llama calificada a public.generate_referral_code()';
  END IF;
END
$g1$;

-- G2 — handle_new_user() fija search_path y captura el fallo del perfil.
DO $g2$
DECLARE v_cfg TEXT; v_src TEXT;
BEGIN
  SELECT coalesce(array_to_string(p.proconfig, ','), ''), pg_get_functiondef(p.oid)
    INTO v_cfg, v_src
    FROM pg_proc p
   WHERE p.oid = 'public.handle_new_user()'::regprocedure;

  IF v_cfg NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION '00179 G2: handle_new_user() no fija search_path (config=%)', v_cfg;
  END IF;
  IF v_src NOT LIKE '%EXCEPTION WHEN OTHERS%' THEN
    RAISE EXCEPTION '00179 G2: handle_new_user() no captura el fallo del INSERT del perfil';
  END IF;
  IF NOT has_function_privilege('supabase_auth_admin', 'public.handle_new_user()', 'EXECUTE') THEN
    RAISE EXCEPTION '00179 G2: supabase_auth_admin no puede ejecutar handle_new_user()';
  END IF;
END
$g2$;

-- G3 — generate_referral_code() fija search_path.
DO $g3$
DECLARE v_cfg TEXT;
BEGIN
  SELECT coalesce(array_to_string(p.proconfig, ','), '')
    INTO v_cfg FROM pg_proc p WHERE p.oid = 'public.generate_referral_code()'::regprocedure;
  IF v_cfg NOT LIKE '%search_path=%' THEN
    RAISE EXCEPTION '00179 G3: generate_referral_code() no fija search_path (config=%)', v_cfg;
  END IF;
END
$g3$;

-- G4 — PRUEBA FUNCIONAL DE EXTREMO A EXTREMO, con el search_path de GoTrue.
--
--   Ésta es la guarda que importa. No comprueba el texto de una función:
--   reproduce las condiciones reales del fallo.
--     1. Fija el search_path a `auth`, exactamente como la sesión de GoTrue.
--     2. Inserta un usuario en auth.users, lo que dispara toda la cadena:
--        handle_new_user → INSERT profiles → set_referral_code.
--     3. Verifica que el perfil existe y que tiene referral_code.
--     4. Borra el usuario y el perfil de prueba (la migración commitea limpia).
--
--   Antes de esta migración, el paso 2 abortaba con 42883.
DO $g4$
DECLARE
  v_uid  UUID := gen_random_uuid();
  v_code TEXT;
  v_prev TEXT := current_setting('search_path');
BEGIN
  SET LOCAL search_path = auth;
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'zz-guard-00179-' || v_uid || '@resurte.invalid', '',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', '', '', ''
  );
  SET LOCAL search_path = public, pg_temp;

  SELECT p.referral_code INTO v_code FROM public.profiles p WHERE p.id = v_uid;

  DELETE FROM public.profiles WHERE id = v_uid;
  DELETE FROM auth.users     WHERE id = v_uid;

  IF v_code IS NULL THEN
    RAISE EXCEPTION '00179 G4: el alta con search_path=auth no creó el perfil con referral_code';
  END IF;

  RAISE NOTICE '00179 G4 OK: alta simulada con search_path=auth → perfil creado, referral_code=%', v_code;
EXCEPTION WHEN OTHERS THEN
  -- Limpieza defensiva por si el fallo ocurrió después del INSERT.
  BEGIN
    DELETE FROM public.profiles WHERE id = v_uid;
    DELETE FROM auth.users     WHERE id = v_uid;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE EXCEPTION '00179 G4 FALLO (search_path de la prueba: %): % (%)', v_prev, SQLERRM, SQLSTATE;
END
$g4$;

-- G5 — GUARDA PERMANENTE DE CLASE.
--   Toda función de trigger SECURITY DEFINER que se dispare desde `auth.*` o
--   desde `public.profiles` debe fijar `search_path`. Una función de trigger
--   corre con el search_path de la SESIÓN que provocó el INSERT, así que
--   cualquier referencia sin calificar ahí es una bomba de relojería: el día
--   que la plataforma cambie ese search_path, el alta de usuarios se cae.
--   Esta guarda es la que habría detenido el fallo de 2026-09-18.
DO $g5$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(DISTINCT p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_bad
    FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_proc  p     ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND p.prosecdef
     AND (c.relnamespace = 'auth'::regnamespace OR c.oid = 'public.profiles'::regclass)
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) x WHERE x LIKE 'search_path=%'));

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '00179 G5: funciones de trigger SECURITY DEFINER sin search_path fijo en la cadena de alta: %', v_bad;
  END IF;
END
$g5$;

-- G6 — ningún resto de la instrumentación de diagnóstico.
DO $g6$
DECLARE v_left TEXT;
BEGIN
  SELECT string_agg(x.nombre, ', ') INTO v_left FROM (
    SELECT 'tabla public.zz_diag_log' AS nombre WHERE to_regclass('public.zz_diag_log') IS NOT NULL
    UNION ALL
    SELECT 'función public.zz_before()'   WHERE to_regprocedure('public.zz_before()') IS NOT NULL
    UNION ALL
    SELECT 'función public.zz_probe_def(uuid)' WHERE to_regprocedure('public.zz_probe_def(uuid)') IS NOT NULL
    UNION ALL
    SELECT 'función public.zz_probe_inv(uuid)' WHERE to_regprocedure('public.zz_probe_inv(uuid)') IS NOT NULL
    UNION ALL
    SELECT 'trigger zz_before_ins' WHERE EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'zz_before_ins' AND NOT tgisinternal)
  ) x;

  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION '00179 G6: quedan restos de diagnóstico: %', v_left;
  END IF;
END
$g6$;

DO $ok$
BEGIN
  RAISE NOTICE '00179: registro reparado (search_path fijo en toda la cadena de alta)';
END
$ok$;
