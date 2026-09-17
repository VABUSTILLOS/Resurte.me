-- ============================================================
-- 00160 — Los REVOKE de columna no servían: privilegios reales en
--         `foodos_restaurants`.
--
-- HALLAZGO
-- --------
-- `00085_stripe_connect.sql` hace
--     REVOKE UPDATE (stripe_account_id, stripe_charges_enabled, …) FROM authenticated, anon;
-- creyendo que así el dueño no podría escribir el estado de Connect. **No
-- funcionó.** En Postgres un privilegio de tabla (`GRANT UPDATE ON t`) cubre
-- todas las columnas y **subsume** cualquier REVOKE de columna: el REVOKE
-- crea un registro de columna, pero el privilegio efectivo sigue viniendo del
-- GRANT de tabla. Comprobado con `has_column_privilege`:
--
--     has_table_privilege('authenticated','public.foodos_restaurants','UPDATE')  -> true
--     has_column_privilege('authenticated', …, 'stripe_account_id', 'UPDATE')    -> true
--
-- Como la política RLS "Owner manages restaurants" es `FOR ALL USING
-- (auth.uid() = user_id)`, **cualquier dueño podía hacer desde el navegador**
-- con supabase-js:
--
--     update foodos_restaurants
--        set stripe_account_id = 'acct_del_atacante',
--            stripe_charges_enabled = true,
--            stripe_payouts_enabled = true
--      where user_id = auth.uid();
--
-- Con Connect apagado (`STRIPE_CONNECT_ENABLED` ausente en producción, que es
-- el default) el daño es nulo. Pero `buildDestinationChargeParams()` enruta el
-- cargo a `stripe_account_id` en cuanto la variable se enciende: sería dinero
-- de los comensales liquidado a una cuenta arbitraria. Era una vulnerabilidad
-- latente a un solo cambio de variable de distancia.
--
-- El mismo agujero dejaba sin efecto el gate de nivel de `app_marca` (00159):
-- un dueño por debajo de Diamante podía escribir `app_short_name` /
-- `app_background_color` desde el navegador y la capacidad premium quedaba
-- anunciada sin serlo.
--
-- ARREGLO
-- -------
-- Se retira el UPDATE de tabla y se concede UPDATE **columna por columna**,
-- sólo sobre lo que el dueño realmente edita. La lista es la unión de lo que
-- escriben las rutas que usan un cliente de **sesión de usuario**:
--
--   * `upsertRestaurant` / `setRestaurantStatus`  (src/app/panel/foodos/actions.ts)
--   * `saveSeoProfileAction` -> `saveSeoProfile`  (src/lib/foodos-seo-pages.ts)
--
-- Todo lo demás (Stripe Connect, `platform_fee_percent`, `app_*`, `user_id`,
-- `id`, timestamps) queda escribible sólo por el service role, es decir por
-- Server Actions y rutas que ya pasan por `requireFoodosAuth()` /
-- `requireFoodosFeature()` y verifican propiedad.
--
-- CONSECUENCIA A TENER EN CUENTA
-- ------------------------------
-- Agregar una columna editable por el dueño ahora requiere una migración que
-- la añada a esta lista. Es el precio de que el privilegio sea real; el
-- `$guard$` de abajo hace que el fallo sea ruidoso en lugar de silencioso.
-- ============================================================

REVOKE UPDATE ON public.foodos_restaurants FROM authenticated, anon;

-- Sólo `authenticated`: un cliente anónimo nunca puede pasar la política
-- (`auth.uid() = user_id` es falso para anon), así que no necesita el permiso.
GRANT UPDATE (
  name,
  slug,
  logo_url,
  description,
  collection_id,
  status,
  currency,
  theme_color,
  transfer_clabe,
  transfer_bank,
  transfer_beneficiary,
  meta_pixel_id,
  tiktok_pixel_id,
  tagline,
  about,
  seo_keywords,
  google_business_url
) ON public.foodos_restaurants TO authenticated;

-- INSERT se conserva a nivel de tabla: `upsertRestaurant` crea el restaurante
-- con `user_id` del lado del cliente de sesión y la política WITH CHECK ya
-- exige `auth.uid() = user_id`.

DO $guard$
DECLARE
  v_bad TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 1. Ninguna columna sensible puede quedar escribible por el dueño.
  IF has_column_privilege('authenticated', 'public.foodos_restaurants', 'stripe_account_id', 'UPDATE') THEN
    v_bad := v_bad || 'stripe_account_id';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_restaurants', 'stripe_charges_enabled', 'UPDATE') THEN
    v_bad := v_bad || 'stripe_charges_enabled';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_restaurants', 'stripe_payouts_enabled', 'UPDATE') THEN
    v_bad := v_bad || 'stripe_payouts_enabled';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_restaurants', 'platform_fee_percent', 'UPDATE') THEN
    v_bad := v_bad || 'platform_fee_percent';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_restaurants', 'app_short_name', 'UPDATE') THEN
    v_bad := v_bad || 'app_short_name';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_restaurants', 'app_background_color', 'UPDATE') THEN
    v_bad := v_bad || 'app_background_color';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_restaurants', 'user_id', 'UPDATE') THEN
    v_bad := v_bad || 'user_id';
  END IF;
  IF has_column_privilege('anon', 'public.foodos_restaurants', 'name', 'UPDATE') THEN
    v_bad := v_bad || 'anon:name';
  END IF;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'Siguen escribibles columnas sensibles: %', array_to_string(v_bad, ', ');
  END IF;

  -- 2. El dueño NO puede perder lo que sí edita.
  IF NOT has_column_privilege('authenticated', 'public.foodos_restaurants', 'name', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_restaurants', 'slug', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_restaurants', 'logo_url', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_restaurants', 'theme_color', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_restaurants', 'status', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_restaurants', 'tagline', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_restaurants', 'about', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_restaurants', 'seo_keywords', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_restaurants', 'google_business_url', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_restaurants', 'transfer_clabe', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_restaurants', 'meta_pixel_id', 'UPDATE')
  THEN
    RAISE EXCEPTION 'El dueño perdió columnas que sí debe poder editar';
  END IF;

  -- 3. INSERT y SELECT intactos (crear restaurante y leerlo).
  IF NOT has_table_privilege('authenticated', 'public.foodos_restaurants', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.foodos_restaurants', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.foodos_restaurants', 'SELECT')
  THEN
    RAISE EXCEPTION 'Se rompió INSERT/SELECT en foodos_restaurants';
  END IF;

  -- 4. El service role conserva el control total.
  IF NOT has_column_privilege('service_role', 'public.foodos_restaurants', 'stripe_account_id', 'UPDATE')
     OR NOT has_column_privilege('service_role', 'public.foodos_restaurants', 'platform_fee_percent', 'UPDATE')
     OR NOT has_column_privilege('service_role', 'public.foodos_restaurants', 'app_short_name', 'UPDATE')
  THEN
    RAISE EXCEPTION 'El service role perdió columnas que debe poder escribir';
  END IF;
END $guard$;
