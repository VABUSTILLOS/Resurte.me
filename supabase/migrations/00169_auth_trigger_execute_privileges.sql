-- ============================================================
-- 00169 — Regresión de `00165`: los registros estaban rotos.
--
-- SÍNTOMA
-- -------
-- `POST /auth/v1/admin/users` devolvía
--     HTTP 500 {"code":500,"error_code":"unexpected_failure",
--               "msg":"Database error creating new user"}
-- es decir: **nadie podía registrarse**. Ni con correo, ni con Google, ni desde
-- el panel. El sitio estaba publicando una puerta de entrada que no abría.
--
-- CAUSA
-- -----
-- `00165_function_execute_privileges.sql` hizo, entre otras cosas:
--     REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- y justificó el barrido de funciones de trigger con esta afirmación:
--
--     "No se invocan nunca desde PostgREST y no necesitan EXECUTE para
--      dispararse: el permiso de una función de trigger se comprueba al CREAR
--      el trigger, no al ejecutarlo."
--
-- **Esa afirmación es falsa.** Postgres comprueba `EXECUTE` sobre la función de
-- trigger **también al dispararla**, contra el rol que ejecuta la sentencia que
-- la dispara. Para un trigger sobre una tabla de `public` disparado por
-- `authenticated` el rol es `authenticated`; para `on_auth_user_created`, el
-- trigger sobre `auth.users`, el rol es **`supabase_auth_admin`**, el rol con el
-- que GoTrue escribe en `auth.users`. Ese rol no tenía concesión directa: su
-- único acceso era el `=X` implícito de `PUBLIC`, y `00165` se lo quitó.
--
-- EVIDENCIA (leída del catálogo en producción, antes de este archivo)
-- -----------------------------------------------------------------
--   public.handle_new_user()  owner=postgres  prosecdef=true
--     proacl = {postgres=X/postgres,service_role=X/postgres}
--   triggers auth.users:  on_auth_user_created -> handle_new_user()
--   has_function_privilege('supabase_auth_admin','public.handle_new_user()','EXECUTE')
--     -> false
--
-- El resto del barrido de `00165` sigue siendo correcto y no se toca: una
-- función que sólo llaman `service_role`/`postgres` no necesita `EXECUTE` para
-- nadie más, y quitárselo a `anon`/`authenticated` cierra una puerta real. Lo
-- que estaba mal era la PREMISA, no el objetivo.
--
-- QUÉ HACE ESTE ARCHIVO
-- ---------------------
-- Devuelve `EXECUTE` **sólo a los roles internos de Supabase** que de verdad
-- disparan triggers, y sólo sobre las funciones que esos triggers invocan. La
-- lista no se escribe a mano: se deduce del catálogo (`pg_trigger` × el esquema
-- de la tabla que dispara), para que valga también para triggers que Supabase
-- añada después y para los que ya existían en `auth.*`/`storage.*`.
--
-- Lo que NO se hace, y por qué:
--
--   1. **No se devuelve `EXECUTE` a `anon` ni a `authenticated`.** Eso
--      restauraría el agujero que `00165` cerró. `handle_new_user()` es
--      `SECURITY DEFINER`: si un cliente pudiera invocarla, podría insertar
--      filas arbitrarias en `public.profiles`.
--   2. **No se devuelve el `=X` de `PUBLIC`.** La concesión a
--      `supabase_auth_admin` es explícita y nominal, así que se puede auditar y
--      retirar; el `=X` era invisible en cualquier revisión.
--   3. **No se toca `public.spatial_ref_sys`** (residual ya documentado en
--      `00167`: su dueño y grantor es `supabase_admin` y `postgres` no puede
--      revocarlo desde una migración).
--   4. **No se revoca nada más.** Este archivo sólo concede.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Devolver EXECUTE a los roles internos que disparan los triggers.
-- ---------------------------------------------------------------------------
DO $grant$
DECLARE
  rec     RECORD;
  v_n     INTEGER := 0;
  v_skip  TEXT := '';
BEGIN
  FOR rec IN
    SELECT DISTINCT
           t.tgfoid::regprocedure::text AS fn,
           nc.nspname                   AS tabla_esquema,
           CASE nc.nspname
             WHEN 'auth'    THEN 'supabase_auth_admin'
             WHEN 'storage' THEN 'supabase_storage_admin'
           END                          AS grantee
      FROM pg_trigger t
      JOIN pg_class     c  ON c.oid  = t.tgrelid
      JOIN pg_namespace nc ON nc.oid = c.relnamespace
      JOIN pg_proc      p  ON p.oid  = t.tgfoid
      JOIN pg_namespace np ON np.oid = p.pronamespace
     WHERE NOT t.tgisinternal
       AND np.nspname = 'public'
       AND nc.nspname <> 'public'
     ORDER BY 1
  LOOP
    IF rec.grantee IS NULL THEN
      v_skip := v_skip || rec.fn || ' (' || rec.tabla_esquema || ') ';
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', rec.fn, rec.grantee);
      v_n := v_n + 1;
      RAISE NOTICE '00169: EXECUTE sobre % concedido a %', rec.fn, rec.grantee;
    END IF;
  END LOOP;

  IF v_skip <> '' THEN
    RAISE NOTICE '00169: triggers en esquemas no mapeados, sin conceder: %', v_skip;
  END IF;

  RAISE NOTICE '00169: concesiones aplicadas: %', v_n;
END
$grant$;

-- ---------------------------------------------------------------------------
-- 2. Guardas. Sin estas comprobaciones el archivo sería una promesa.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_ok     BOOLEAN;
  v_mal    TEXT := '';
  v_n      INTEGER := 0;
  rec      RECORD;
BEGIN
  -- G1: el caso concreto que rompió los registros.
  IF NOT has_function_privilege('supabase_auth_admin', 'public.handle_new_user()', 'EXECUTE') THEN
    v_mal := v_mal || 'G1 handle_new_user sin EXECUTE para supabase_auth_admin; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass
                   AND NOT tgisinternal AND tgfoid = 'public.handle_new_user()'::regprocedure) THEN
    v_mal := v_mal || 'G1 el trigger on_auth_user_created ya no existe: revisar el modelo, no el permiso; ';
  END IF;

  -- G2: todo trigger sobre un esquema de Supabase tiene EXECUTE para su rol.
  FOR rec IN
    SELECT DISTINCT t.tgfoid::regprocedure::text AS fn,
           CASE nc.nspname WHEN 'auth' THEN 'supabase_auth_admin'
                           WHEN 'storage' THEN 'supabase_storage_admin' END AS grantee
      FROM pg_trigger t
      JOIN pg_class     c  ON c.oid  = t.tgrelid
      JOIN pg_namespace nc ON nc.oid = c.relnamespace
      JOIN pg_proc      p  ON p.oid  = t.tgfoid
      JOIN pg_namespace np ON np.oid = p.pronamespace
     WHERE NOT t.tgisinternal AND np.nspname = 'public'
       AND nc.nspname <> 'public' AND nc.nspname IN ('auth','storage')
  LOOP
    IF NOT has_function_privilege(rec.grantee, rec.fn, 'EXECUTE') THEN
      v_mal := v_mal || 'G2 ' || rec.fn || ' sin EXECUTE para ' || rec.grantee || '; ';
    END IF;
  END LOOP;

  -- G3: NO se restauró el agujero. Los clientes siguen sin poder invocarlas.
  FOR rec IN
    SELECT DISTINCT t.tgfoid::regprocedure::text AS fn
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace np ON np.oid = p.pronamespace
     WHERE NOT t.tgisinternal AND np.nspname = 'public'
       AND p.prosecdef
  LOOP
    IF has_function_privilege('anon', rec.fn, 'EXECUTE')
       OR has_function_privilege('authenticated', rec.fn, 'EXECUTE') THEN
      v_mal := v_mal || 'G3 ' || rec.fn || ' quedó ejecutable por un cliente; ';
    END IF;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    v_mal := v_mal || 'G3 no se encontró ninguna función de trigger SECURITY DEFINER: la comprobación no midió nada; ';
  END IF;

  -- G4: `PUBLIC` sigue sin tener el `=X` genérico sobre estas funciones.
  --
  -- OJO con el detector: `proacl::text` de una función endurecida es
  -- `{postgres=X/postgres,service_role=X/postgres}`. Buscar el literal `=X/`
  -- acierta también en `service_role=X/postgres`, que NO es una concesión a
  -- PUBLIC: sería un falso positivo en las 24 funciones. La forma exacta de
  -- preguntarlo es `aclexplode`, donde PUBLIC es `grantee = 0`.
  --
  -- Se acota a las funciones SECURITY DEFINER. Medido en producción: seis
  -- funciones de trigger (`touch_updated_at`, `products_touch_updated_at`,
  -- `set_crm_updated_at`, `sync_active_store_price_to_product`,
  -- `touch_product_city_availability`, `set_wallet_credit_expiry`) conservan
  -- `EXECUTE` para PUBLIC porque `00165` no las tocó. No se revocan aquí:
  --   a) una función que devuelve `TRIGGER` no se puede invocar por RPC
  --      (Postgres responde `0A000 trigger functions can only be called as
  --      triggers`), así que la concesión no abre nada; y
  --   b) revocarla es exactamente la operación que rompió `handle_new_user`,
  --      y todavía no está medido si Postgres comprueba `EXECUTE` contra el rol
  --      que dispara. Medirlo antes de tocar nada más.
  FOR rec IN
    SELECT DISTINCT t.tgfoid AS fnoid, t.tgfoid::regprocedure::text AS fn
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace np ON np.oid = p.pronamespace
     WHERE NOT t.tgisinternal AND np.nspname = 'public' AND p.prosecdef
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = rec.fnoid)) a
       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) INTO v_ok;
    IF v_ok THEN
      v_mal := v_mal || 'G4 ' || rec.fn || ' tiene EXECUTE para PUBLIC (grantee=0); ';
    END IF;
  END LOOP;

  IF v_mal <> '' THEN
    RAISE EXCEPTION '00169 GUARDAS FALLIDAS: %', v_mal;
  END IF;

  RAISE NOTICE '00169 OK: registros restaurados; funciones de trigger revisadas: %', v_n;
END
$guard$;
