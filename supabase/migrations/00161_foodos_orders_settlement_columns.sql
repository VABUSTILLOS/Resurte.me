-- ============================================================
-- 00161 — `foodos_orders`: las columnas de liquidación no son del dueño.
--
-- Mismo hallazgo que 00160, otra tabla. La política RLS
-- "Owner updates orders" es `FOR UPDATE` con USING y WITH CHECK de propiedad
-- (`foodos_restaurants.user_id = auth.uid()`), pero `authenticated` tiene
-- UPDATE a nivel de tabla, así que el dueño del restaurante podía escribir
-- **cualquier** columna de sus propios pedidos, incluidas las de enrutamiento
-- de dinero:
--
--   stripe_payment_intent_id, application_fee_amount,
--   connected_account_id, stripe_transfer_id
--
-- El más grave es `connected_account_id`, y no por el cobro (que ya ocurrió)
-- sino por la **conciliación**: `foodos_payout_balances()` (00157) calcula
--   gross_collected = pedidos pagados donde connected_account_id IS NULL
-- es decir "el dinero que la plataforma recibió y todavía no liquidó".
-- Un dueño con acceso al navegador podía poner un `acct_…` cualquiera en sus
-- pedidos ya pagados y **borrar su propia deuda del reporte de dispersiones**.
-- El saldo que el admin lee para decidir cuánto transferir dejaba de ser
-- confiable: la pantalla seguía mostrando números, sólo que ya no eran ciertos.
--
-- `loyalty_points_earned` se suma a la lista por el mismo motivo: se acuña
-- desde el trigger `trg_foodos_award_loyalty` (BEFORE UPDATE OF status), no
-- desde el cliente, y una asignación de trigger no exige privilegio de
-- columna al que ejecuta el UPDATE. Dejarla fuera de la lista no rompe el
-- trigger; dejarla dentro evita que un dueño se acredite puntos a mano.
--
-- SUPERADA POR 00162 (18-sep-2026)
-- --------------------------------
-- Aquí la lista es **negra**: conserva `UPDATE` para el dueño en las 36
-- columnas que no están abajo. `00162_order_and_profile_column_privileges.sql`
-- la reemplaza por una lista **blanca** (`status`, `payment_status`,
-- `table_number`, `table_ticket_id`) y, al ir después, el estado final es el
-- suyo. La lista negra dejaba al dueño reescribir `total`, `subtotal`,
-- `discount`, `delivery_fee`, `tip`, `items`, `folio`… de un pedido ya
-- cobrado: comisión de plataforma evadible y puntos de lealtad inflables.
--
-- La premisa de la lista negra («una lista blanca incompleta rompería el panel
-- en tiempo de ejecución») resultó **falsa**. Barridas las 8 rutas con cliente
-- de sesión que tocan `foodos_orders`, todas escriben sólo `status`,
-- `payment_status`, `table_ticket_id` o `table_number`; el resto de columnas
-- operativas se fijan en el `INSERT` de `createFoodosOrder`
-- (`src/lib/foodos-order-create.ts:516`), que no está sujeto a
-- `REVOKE UPDATE`. El `$guard$` #2 de abajo se acotó a ese conjunto para no
-- afirmar lo contrario.
--
-- Ninguna ruta con cliente de **sesión de usuario** escribe las columnas
-- denegadas: `stripe_payment_intent_id` / `application_fee_amount` /
-- `connected_account_id` sólo se escriben en `src/lib/payments.ts` y
-- `src/lib/stripe-webhook-handlers.ts`, ambos con service role.
-- ============================================================

DO $fix$
DECLARE
  v_deny TEXT[] := ARRAY[
    'stripe_payment_intent_id',
    'application_fee_amount',
    'connected_account_id',
    'stripe_transfer_id',
    'loyalty_points_earned'
  ];
  v_cols TEXT;
BEGIN
  -- Si `total` ya no es escribible por `authenticated`, la lista blanca de
  -- 00162 ya está en vigor: volver a conceder aquí reabriría el agujero en
  -- silencio (las guardas de abajo pasarían igual, porque el GRANT se
  -- reaplicaría antes de que se ejecuten). Se corta con un error explícito.
  IF NOT has_column_privilege('authenticated', 'public.foodos_orders', 'total', 'UPDATE') THEN
    RAISE EXCEPTION 'La lista blanca de 00162 ya está aplicada. Re-ejecutar 00161 volvería a conceder UPDATE sobre las columnas de dinero; no la re-ejecutes.';
  END IF;

  -- Sin este REVOKE, el GRANT por columna de abajo sería decorativo: el
  -- privilegio de tabla cubre todas las columnas (ver 00160).
  REVOKE UPDATE ON public.foodos_orders FROM authenticated, anon;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'foodos_orders'
     AND column_name <> ALL (v_deny);

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'No se encontraron columnas en foodos_orders';
  END IF;

  EXECUTE 'GRANT UPDATE (' || v_cols || ') ON public.foodos_orders TO authenticated';
END $fix$;

DO $guard$
DECLARE
  v_bad TEXT[] := ARRAY[]::TEXT[];
  v_missing TEXT[] := ARRAY[]::TEXT[];
  c TEXT;
BEGIN
  -- 1. Ninguna columna de liquidación puede quedar escribible por el dueño.
  FOREACH c IN ARRAY ARRAY[
    'stripe_payment_intent_id', 'application_fee_amount',
    'connected_account_id', 'stripe_transfer_id', 'loyalty_points_earned'
  ] LOOP
    IF has_column_privilege('authenticated', 'public.foodos_orders', c, 'UPDATE') THEN
      v_bad := v_bad || c;
    END IF;
  END LOOP;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'Siguen escribibles columnas de liquidación: %', array_to_string(v_bad, ', ');
  END IF;

  -- 2. El panel no puede perder las columnas que escribe con `UPDATE` — las
  --    cuatro de la lista blanca de 00162 (verificado barriendo las rutas con
  --    cliente de sesión). Acotado a estas cuatro, el guard sigue siendo
  --    cierto si esta migración se re-ejecuta después de 00162.
  FOREACH c IN ARRAY ARRAY[
    'status', 'payment_status', 'table_ticket_id', 'table_number'
  ] LOOP
    IF NOT has_column_privilege('authenticated', 'public.foodos_orders', c, 'UPDATE') THEN
      v_missing := v_missing || c;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'El dueño perdió columnas operativas: %', array_to_string(v_missing, ', ');
  END IF;

  -- 3. INSERT intacto: el POS y el mostrador crean pedidos con el cliente de
  --    sesión, y la política "Public can place orders" ya valida el restaurante.
  IF NOT has_table_privilege('authenticated', 'public.foodos_orders', 'INSERT')
     OR NOT has_table_privilege('anon', 'public.foodos_orders', 'INSERT')
     OR NOT has_table_privilege('anon', 'public.foodos_orders', 'SELECT')
  THEN
    RAISE EXCEPTION 'Se rompió INSERT/SELECT en foodos_orders';
  END IF;

  -- 4. anon no gana UPDATE (no lo necesita: no puede pasar la política).
  IF has_table_privilege('anon', 'public.foodos_orders', 'UPDATE') THEN
    RAISE EXCEPTION 'anon conserva UPDATE en foodos_orders';
  END IF;

  -- 5. El service role conserva las columnas de liquidación.
  FOREACH c IN ARRAY ARRAY[
    'stripe_payment_intent_id', 'application_fee_amount',
    'connected_account_id', 'stripe_transfer_id'
  ] LOOP
    IF NOT has_column_privilege('service_role', 'public.foodos_orders', c, 'UPDATE') THEN
      RAISE EXCEPTION 'El service role perdió UPDATE sobre %', c;
    END IF;
  END LOOP;
END $guard$;
