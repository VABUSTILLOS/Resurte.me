-- ============================================================================
-- 00165 — Privilegios de ejecución de funciones: normalización del esquema public
-- ============================================================================
--
-- QUÉ ESTABA MAL
--
-- Supabase trae, en `pg_default_acl`, un `ALTER DEFAULT PRIVILEGES IN SCHEMA
-- public GRANT EXECUTE ON FUNCTIONS ...` registrado **dos veces** (por
-- `postgres` y por `supabase_admin`). El efecto es que toda función nueva nace
-- con EXECUTE concedido a:
--
--     PUBLIC   (la entrada `=X` de `pg_proc.proacl`)
--     anon     (grant directo)
--     authenticated (grant directo)
--     service_role  (grant directo)
--
-- Eso hace que las dos formas "obvias" de cerrar una función sean **inertes**,
-- cada una por un motivo distinto, y ambas dejan la función igual de abierta:
--
--   1. `REVOKE ALL ON FUNCTION f(...) FROM PUBLIC;`
--      No toca los grants directos a anon/authenticated. La función sigue
--      siendo ejecutable por cualquiera. (Así quedaron 00039 `consume_rate_limit`,
--      00050 `set_default_address`, 00091 `refresh_price_index`, 00038/00065
--       `get_products_by_collection`, 00111 `get_available_product_ids`,
--      00158 `product_review_feed` y la primera versión de 00164.)
--
--   2. `REVOKE ALL ON FUNCTION f(...) FROM anon, authenticated;`
--      Quita los grants directos pero deja `=X` (PUBLIC). `proacl` se ve
--      "limpio" —`{=X/postgres,postgres=X/postgres,service_role=X/postgres}`—
--      y sin embargo sigue abierta. (Así quedaron 00143, 00151, 00152 y
--      00155 `accrue/pay/cancel_commission_period`.)
--
-- La única forma correcta es nombrar los tres:
--
--     REVOKE ALL ON FUNCTION f(...) FROM PUBLIC, anon, authenticated;
--     GRANT EXECUTE ON FUNCTION f(...) TO <los roles que de verdad la usan>;
--
-- (Es la que ya usaban 00121, 00133, 00143, 00145 y 00157.)
--
-- POR QUÉ IMPORTA
--
-- `pay_commission_period`, `cancel_commission_period` y `accrue_commission_period`
-- son SECURITY DEFINER, validan sus argumentos pero **no** comprueban
-- `is_admin()` ni `auth.uid()`. Con el agujero abierto, un visitante anónimo
-- podía marcar una liquidación de comisiones como pagada, cancelarla, o
-- acumularla con la tasa que quisiera. `consume_rate_limit` recibía el límite
-- como parámetro del llamador, así que cualquiera podía saltarse todos los
-- rate limits de la aplicación pasando un límite enorme. `set_default_address`
-- acepta el `user_id` como parámetro: cualquiera podía cambiar la dirección
-- predeterminada de otra persona.
--
-- QUÉ HACE ESTE ARCHIVO
--
--   1. Cierra los RPC que la aplicación sólo invoca con el cliente de service
--      role (verificado llamador por llamador).
--   2. Cierra los 15 triggers: una función de trigger no necesita EXECUTE para
--      dispararse, así que no tenerlo no rompe nada.
--   3. Deja en `authenticated` los dos RPC que el panel sí invoca con el
--      cliente de cookies, **añadiéndoles dentro la guarda de propiedad que
--      les faltaba** (antes cualquier cuenta podía quemar folios o inflar el
--      uso de cupones de un restaurante ajeno).
--   4. Vuelve a conceder explícitamente lo que sí es público por diseño, para
--      que el archivo sea la declaración completa del estado deseado y no un
--      parche parcial.
--   5. Autocomprueba el resultado y falla entero si algo no quedó como se dice.
--
-- NOTA DE NUMERACIÓN: 00164 se corrigió en sitio (mismo defecto en su propio
-- `REVOKE`), así que una base nueva no lo reproduce. Este archivo repara la base
-- ya desplegada y, además, los ~30 objetos que nunca se cerraron.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. RPC que la aplicación sólo invoca con el cliente de service role.
--
--    Llamadores verificados (todos con `createServiceClient()`):
--      accrue_commission_period   src/app/api/admin/comisiones/route.ts
--      cancel_commission_period   src/app/api/admin/comisiones/[id]/cancel/route.ts
--      pay_commission_period      src/app/api/admin/comisiones/[id]/pay/route.ts
--      set_default_address        src/app/api/orders/route.ts (supabase = service)
--      consume_rate_limit         src/lib/rate-limit.ts (y sus ~28 llamadores,
--                                 todos con service client)
--      refresh_price_index        src/lib/price-index-refresh.ts
--      panel_entry_put            src/app/api/panel/entries/route.ts
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.accrue_commission_period(UUID, DATE, DATE, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accrue_commission_period(UUID, DATE, DATE, NUMERIC, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.cancel_commission_period(BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_commission_period(BIGINT, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.pay_commission_period(BIGINT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_commission_period(BIGINT, UUID, TEXT, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.set_default_address(UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_address(UUID, BIGINT)
  TO service_role;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.refresh_price_index(DATE, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_price_index(DATE, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.panel_entry_put(UUID, UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.panel_entry_put(UUID, UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ)
  TO service_role;


-- ---------------------------------------------------------------------------
-- 2. Funciones de trigger.
--
--    No se invocan nunca desde PostgREST y no necesitan EXECUTE para
--    dispararse: el permiso de una función de trigger se comprueba al CREAR el
--    trigger, no al ejecutarlo. Quitárselo no rompe nada y cierra una puerta
--    que no tenía por qué estar abierta.
--
--    `sync_admin_users_to_profile` no aparece aquí porque ya estaba cerrada.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.credit_cashback_on_payment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foodos_award_loyalty_on_delivery() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foodos_sync_wallet_passes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foodos_upsert_customer_on_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_commission_period_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_redemption_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_cashback_for_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_referral_reward() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_cashback_on_cancel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_crm_prospect_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_redemption_due_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_referral_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_commission_adjustments() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. RPC que el panel SÍ invoca con el cliente de cookies (rol authenticated).
--
--    Estos dos no se pueden cerrar: el panel los llama con la sesión del
--    dueño. Lo que faltaba no era el permiso sino la **guarda de propiedad**
--    dentro de la función: recibían `p_restaurant_id` como parámetro y no
--    comprobaban nada, así que cualquier cuenta autenticada podía quemar
--    números de folio de un restaurante ajeno (`foodos_next_folio`) o inflar
--    el contador de uso de sus cupones (`increment_foodos_coupon_usage`).
--
--    La guarda espeja exactamente la autorización de la aplicación
--    (`loadOwnRestaurantId` en src/lib/foodos-operating.ts): el dueño de un
--    restaurante es `foodos_restaurants.user_id`. No hay tabla de miembros, así
--    que `user_id = auth.uid()` es el modelo completo, no una aproximación.
--
--    Se deja pasar cuando `auth.uid()` es NULL (cliente de service role): ése
--    es el camino de impersonación de un admin, que ya viene autorizado desde
--    `getOperatingContext`. Y se deja pasar a un admin aunque use su propia
--    sesión.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.foodos_next_folio(
  p_restaurant_id UUID,
  p_branch_id UUID DEFAULT NULL::UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_date   DATE := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_number INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.foodos_restaurants r
        WHERE r.id = p_restaurant_id AND r.user_id = auth.uid()
     )
     AND NOT public.is_admin()
  THEN
    RAISE EXCEPTION 'Sin permiso sobre el restaurante %', p_restaurant_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO foodos_order_folios (restaurant_id, branch_id, folio_date, last_number)
  VALUES (p_restaurant_id, p_branch_id, v_date, 1)
  ON CONFLICT (
    restaurant_id,
    (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    folio_date
  )
  DO UPDATE SET last_number = foodos_order_folios.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_number;

  RETURN to_char(v_date, 'YYMMDD') || '-' || lpad(v_number::text, 4, '0');
END;
$fn$;

-- Se conserva `search_path = ''` (lo más restrictivo) y se cualifica todo.
CREATE OR REPLACE FUNCTION public.increment_foodos_coupon_usage(
  p_restaurant_id UUID,
  p_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.foodos_restaurants r
        WHERE r.id = p_restaurant_id AND r.user_id = auth.uid()
     )
     AND NOT public.is_admin()
  THEN
    RAISE EXCEPTION 'Sin permiso sobre el restaurante %', p_restaurant_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.foodos_coupons
     SET usage_count = usage_count + 1
   WHERE restaurant_id = p_restaurant_id AND upper(code) = upper(p_code);
END;
$fn$;

REVOKE ALL ON FUNCTION public.foodos_next_folio(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.foodos_next_folio(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.increment_foodos_coupon_usage(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_foodos_coupon_usage(UUID, TEXT) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. Lo que sí es público por diseño.
--
--    Se vuelve a conceder a propósito (es idempotente) para que este archivo
--    sea la declaración completa del estado deseado: quien lo lea no tiene que
--    adivinar qué quedó abierto a propósito y qué quedó abierto por descuido.
--
--      get_available_product_ids   catálogo público (createPublicClient → anon)
--      get_products_by_collection  catálogo público (createPublicClient → anon)
--      product_review_feed         reseñas en la ficha de producto (ISR estático)
--      is_admin()                  devuelve un booleano; el cliente lo consulta
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.get_available_product_ids(BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_products_by_collection(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.product_review_feed(INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. Autocomprobación.
--
--    `has_function_privilege` es la única fuente de verdad aquí:
--    `information_schema.column_privileges` no refleja privilegios de función,
--    y leer `proacl` a ojo es justo lo que dejó pasar el error (una entrada
--    `=X` se ve limpia al lado de `anon=X`).
--
--    Se comprueban también las cuatro públicas: un guard que sólo mira lo que
--    debe estar cerrado no detecta que el archivo cerró de más.
-- ---------------------------------------------------------------------------

DO $guard$
DECLARE
  v_r   TEXT := '';
  v_oid OID;
  rec   RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      -- firma                                                     anon   auth   service
      ('public.accrue_commission_period(uuid,date,date,numeric,text)', false, false, true),
      ('public.cancel_commission_period(bigint,text)',                 false, false, true),
      ('public.pay_commission_period(bigint,uuid,text,text)',          false, false, true),
      ('public.set_default_address(uuid,bigint)',                      false, false, true),
      ('public.consume_rate_limit(text,integer,integer)',              false, false, true),
      ('public.refresh_price_index(date,integer)',                     false, false, true),
      ('public.panel_entry_put(uuid,uuid,text,text,jsonb,timestamptz)', false, false, true),

      ('public.credit_cashback_on_payment()',                          false, false, true),
      ('public.foodos_award_loyalty_on_delivery()',                    false, false, true),
      ('public.foodos_sync_wallet_passes()',                           false, false, true),
      ('public.foodos_upsert_customer_on_order()',                     false, false, true),
      ('public.guard_commission_period_update()',                      false, false, true),
      ('public.handle_new_user()',                                     false, false, true),
      ('public.log_redemption_created()',                              false, false, true),
      ('public.process_cashback_for_order()',                          false, false, true),
      ('public.process_referral_reward()',                             false, false, true),
      ('public.protect_profile_role()',                                false, false, true),
      ('public.reverse_cashback_on_cancel()',                          false, false, true),
      ('public.set_crm_prospect_code()',                               false, false, true),
      ('public.set_redemption_due_at()',                               false, false, true),
      ('public.set_referral_code()',                                   false, false, true),
      ('public.sync_commission_adjustments()',                         false, false, true),

      ('public.foodos_next_folio(uuid,uuid)',                          false, true,  true),
      ('public.increment_foodos_coupon_usage(uuid,text)',              false, true,  true),

      ('public.get_available_product_ids(bigint)',                     true,  true,  true),
      ('public.get_products_by_collection(text)',                      true,  true,  true),
      ('public.product_review_feed(integer)',                          true,  true,  true),
      ('public.is_admin()',                                            true,  true,  true)
    ) AS t(sig, anon_ok, auth_ok, svc_ok)
  LOOP
    v_oid := to_regprocedure(rec.sig);

    IF v_oid IS NULL THEN
      v_r := v_r || 'FALTA ' || rec.sig || E'\n';
      CONTINUE;
    END IF;

    IF has_function_privilege('anon', v_oid, 'EXECUTE') <> rec.anon_ok THEN
      v_r := v_r || 'FALLO anon ' || rec.sig
                  || ' (esperado ' || rec.anon_ok::text || ')' || E'\n';
    END IF;

    IF has_function_privilege('authenticated', v_oid, 'EXECUTE') <> rec.auth_ok THEN
      v_r := v_r || 'FALLO authenticated ' || rec.sig
                  || ' (esperado ' || rec.auth_ok::text || ')' || E'\n';
    END IF;

    IF has_function_privilege('service_role', v_oid, 'EXECUTE') <> rec.svc_ok THEN
      v_r := v_r || 'FALLO service_role ' || rec.sig
                  || ' (esperado ' || rec.svc_ok::text || ')' || E'\n';
    END IF;
  END LOOP;

  -- Ninguna de las funciones que este archivo cierra puede conservar la
  -- entrada `=X` (PUBLIC) en `proacl`: es la que hace inerte al `REVOKE`.
  FOR rec IN
    SELECT * FROM (VALUES
      ('public.accrue_commission_period(uuid,date,date,numeric,text)'),
      ('public.cancel_commission_period(bigint,text)'),
      ('public.pay_commission_period(bigint,uuid,text,text)'),
      ('public.set_default_address(uuid,bigint)'),
      ('public.consume_rate_limit(text,integer,integer)'),
      ('public.refresh_price_index(date,integer)'),
      ('public.panel_entry_put(uuid,uuid,text,text,jsonb,timestamptz)')
    ) AS t(sig)
  LOOP
    v_oid := to_regprocedure(rec.sig);
    IF v_oid IS NULL THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_proc p
       CROSS JOIN LATERAL unnest(p.proacl) AS a
       WHERE p.oid = v_oid AND a::text LIKE '=X/%'
    ) THEN
      v_r := v_r || 'FALLO queda el grant a PUBLIC en ' || rec.sig || E'\n';
    END IF;
  END LOOP;

  IF v_r <> '' THEN
    RAISE EXCEPTION E'Autocomprobación 00165:\n%', v_r;
  END IF;
END;
$guard$;
