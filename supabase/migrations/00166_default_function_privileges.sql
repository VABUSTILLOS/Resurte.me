-- ============================================================================
-- 00166 — Privilegios por defecto de funciones: cerrar la causa raíz
-- ============================================================================
--
-- 00165 normalizó los objetos que ya existían. Este archivo ataca la causa:
-- mientras `pg_default_acl` siga concediendo EXECUTE a anon y authenticated,
-- **toda función nueva nace abierta** y el agujero vuelve con la siguiente
-- migración que cree un RPC.
--
-- QUÉ HABÍA
--
--   grantor=postgres       objtype=f  {postgres=X, anon=X, authenticated=X, service_role=X}
--   grantor=supabase_admin objtype=f  {postgres=X, anon=X, authenticated=X, service_role=X}
--
-- QUÉ QUEDA
--
--   grantor=postgres       objtype=f  {postgres=X, service_role=X}
--   grantor=supabase_admin objtype=f  {postgres=X, anon=X, authenticated=X, service_role=X}
--                                     ^ sin cambios: `ALTER DEFAULT PRIVILEGES
--                                       FOR ROLE supabase_admin` responde
--                                       `42501: permission denied to change
--                                       default privileges`.
--
-- Consecuencia práctica: `postgres` es el rol con el que se aplican las
-- migraciones (CLI y MCP), así que **todo lo que cree este repositorio nace
-- cerrado**. Lo que cree `supabase_admin` (infraestructura de Supabase, no
-- nuestras migraciones) sigue naciendo abierto. Si algún día aparece una función
-- nuestra ejecutable por anon sin querer, `00165` es el archivo a re-ejecutar;
-- la autocomprobación de este archivo lo detecta.
--
-- NOTA: el `=X` (PUBLIC) que aparece en `proacl` de las funciones **no** viene
-- de aquí: es el grant implícito de PostgreSQL a PUBLIC en `CREATE FUNCTION`, y
-- no se almacena en `defaclacl`. Por eso `REVOKE ... FROM PUBLIC` sí funciona
-- (quita el `=X`); lo que no funcionaba era confiar sólo en él, porque los
-- grants directos a anon/authenticated sobrevivían. Al desaparecer esos grants
-- directos, `REVOKE ... FROM PUBLIC` vuelve a ser suficiente — pero nombrar los
-- tres roles sigue siendo la forma recomendada y la que usan 00121, 00133,
-- 00143, 00145 y 00157.
--
-- NO SE TOCA el privilegio por defecto de las RELACIONES (`objtype = 'r'`:
-- `{anon=arwdDxtm, authenticated=arwdDxtm}`). Las tablas de este proyecto se
-- apoyan a propósito en ese grant y usan RLS como puerta, y varias migraciones
-- dependen de que `authenticated` tenga GRANT a nivel de tabla para poder
-- revocar sólo columnas concretas (ver 00160 y 00162). Cambiarlo es una decisión
-- de modelo de seguridad distinta, con otro radio de impacto, y no forma parte
-- del defecto que corrige este archivo.
-- ============================================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- Autocomprobación: (a) el ACL por defecto de `postgres` ya no nombra a anon ni
-- a authenticated; (b) sigue nombrando a service_role, para no haber cerrado de
-- más; (c) la superficie real sigue sin SECURITY DEFINER ejecutables por anon
-- fuera de lo previsto por diseño (repite el chequeo de 00165, para que este
-- archivo falle por su cuenta si se aplicara sobre una base sin normalizar).
-- ---------------------------------------------------------------------------

DO $guard$
DECLARE
  v_r   TEXT := '';
  v_txt TEXT;
  v_bad TEXT;
  v_n   INTEGER;
BEGIN
  SELECT coalesce(string_agg(d.defaclacl::text, ' '), '')
    INTO v_txt
    FROM pg_default_acl d
   WHERE d.defaclnamespace = 'public'::regnamespace
     AND d.defaclobjtype = 'f'
     AND d.defaclrole = 'postgres'::regrole;

  IF v_txt = '' THEN
    v_r := v_r || 'FALTA el ACL por defecto de postgres para funciones' || E'\n';
  ELSE
    SELECT string_agg(tok, ', ') INTO v_bad
      FROM regexp_split_to_table(v_txt, '[{},]') AS tok
     WHERE tok LIKE 'anon=%' OR tok LIKE 'authenticated=%';
    v_r := v_r || CASE WHEN v_bad IS NULL
      THEN 'OK el ACL por defecto de postgres ya no nombra a anon ni authenticated'
      ELSE 'FALLO el ACL por defecto de postgres sigue con: ' || v_bad END || E'\n';

    v_r := v_r || CASE WHEN v_txt LIKE '%service_role=X%'
      THEN 'OK el ACL por defecto conserva service_role'
      ELSE 'FALLO el ACL por defecto perdió service_role: ' || v_txt END || E'\n';
  END IF;

  SELECT count(*), coalesce(string_agg(p.proname || '(' ||
           pg_get_function_identity_arguments(p.oid) || ')', E'\n  '), '—')
    INTO v_n, v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid AND NOT t.tgisinternal)
     AND p.proname NOT IN ('get_available_product_ids','get_products_by_collection',
                           'product_review_feed','is_admin')
     AND p.proname NOT LIKE 'st\_estimatedextent%';

  v_r := v_r || CASE WHEN v_n = 0
    THEN 'OK ningún SECURITY DEFINER ejecutable por anon fuera de lo previsto'
    ELSE 'FALLO quedan ' || v_n || ' ejecutables por anon:' || E'\n  ' || v_bad END || E'\n';

  IF v_r LIKE '%FALTA%' OR v_r LIKE '%FALLO%' THEN
    RAISE EXCEPTION E'Autocomprobación 00166:\n%', v_r;
  END IF;
END;
$guard$;
