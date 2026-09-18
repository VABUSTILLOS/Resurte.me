-- ============================================================
-- 00162 — Mismo agujero de privilegios que 00160, en las otras dos
--         tablas que el dueño puede escribir: `foodos_orders` y `profiles`.
--
-- NOTA DE NUMERACIÓN
-- ------------------
-- Este archivo nació como `00161_order_and_profile_column_privileges.sql` y
-- chocó con `00161_foodos_orders_settlement_columns.sql` (ya commiteado). Se
-- renumeró a `00162` el 18-sep-2026. La renumeración **no es cosmética**:
-- `00161_foodos_orders_settlement_columns.sql` resuelve `foodos_orders` con
-- una **lista negra** (conserva `total`, `items`, `folio`, `tip`, `subtotal`,
-- `discount`, `delivery_fee`, `payment_breakdown`, `payment_method`,
-- `restaurant_id`, `customer_id`, `cashier_user_id`, `pos_shift_id`…), y este
-- archivo la reemplaza por una **lista blanca**. Al ir después, el estado
-- final es el más estricto.
--
-- CONTEXTO
-- --------
-- `00160` documentó el mecanismo: `ALTER DEFAULT PRIVILEGES` de Supabase
-- concede `UPDATE` **a nivel de tabla** a `anon` y `authenticated`, y en
-- Postgres un privilegio de tabla cubre todas las columnas y **subsume**
-- cualquier `REVOKE UPDATE (columna)`. Por eso todo `REVOKE` de columna sin
-- un `REVOKE` de tabla previo es inerte.
--
-- Se buscaron las otras tablas con la misma forma (política RLS de escritura
-- acotada al dueño + privilegio de tabla + columnas que el dueño no debería
-- poder tocar). Salieron dos:
--
--   1. `foodos_orders` — política "Owner updates orders"
--      (`EXISTS (SELECT 1 FROM foodos_restaurants r
--                 WHERE r.id = foodos_orders.restaurant_id
--                   AND r.user_id = auth.uid())`).
--      Sin ningún trigger que proteja las columnas de dinero.
--
--      Un dueño podía, desde el navegador con supabase-js:
--          update foodos_orders set total = 1, tip = 0,
--                 application_fee_amount = 0,
--                 connected_account_id = null
--           where restaurant_id = <el suyo>;
--      Reescribir totales es fraude contra el comensal; reescribir
--      `connected_account_id` / `application_fee_amount` desvía la
--      liquidación de Stripe Connect (el mismo riesgo latente que 00160).
--      Y `payment_status` no es el problema: marcar pagado un pedido de
--      efectivo/transferencia es una acción legítima del dueño
--      (`markOrderPaid`, aprobación manual de comprobantes), así que se
--      conserva.
--
--   2. `profiles` — política "Users can update own profile"
--      (`auth.uid() = id`). La columna `role` **ya estaba protegida** por el
--      trigger `protect_profile_role_trigger` (00067), así que la escalada a
--      admin nunca estuvo abierta. Pero `referred_by` sí:
--
--      `process_referral_reward()` (00147) paga **$100 MXN** al
--      `profiles.referred_by` del usuario cuando su pedido pasa a
--      `confirmed`. El endpoint `/api/workflows/trigger` ya rechaza el
--      autorreferido (`referrer.id === userId`), pero la escritura directa
--      por PostgREST lo saltaba: bastaba
--          PATCH /rest/v1/profiles?id=eq.<tu id>  {"referred_by": "<tu id>"}
--      y hacer una primera compra para acreditarse $100 a sí mismo. Es un
--      exploit repetible por cuenta (registrar cuenta → autorreferirse →
--      comprar → $100 de crédito gratis).
--
-- ARREGLO
-- -------
-- Para cada tabla: `REVOKE UPDATE` de tabla a `authenticated` y `anon`, y
-- `GRANT UPDATE (columnas)` **sólo** con la unión de lo que escriben las
-- rutas que usan un cliente de **sesión de usuario**. La lista se derivó
-- enumerando los 24 sitios de escritura de `foodos_orders` y los 6 de
-- `profiles`, y clasificando cada uno por cliente (sesión vs service role):
--
--   foodos_orders, cliente de sesión:
--     * `updateOrderStatus`      -> status          (src/app/panel/foodos/actions.ts)
--     * `markOrderPaid`          -> payment_status  (src/app/panel/foodos/actions.ts)
--     * `approvePaymentProof`    -> payment_status  (src/app/panel/foodos/payment-proofs.ts)
--     * `cancelOrder`            -> status          (src/app/panel/foodos/mesas-actions.ts)
--     * `repointComandas`        -> table_number, table_ticket_id (mesas-actions.ts)
--     * flotilla/deliveries.ts   -> status
--   Todo lo demás (totales, propina, descuento, envío, folio, items,
--   puntos de lealtad, `payment_breakdown`, IDs de Stripe, `customer_*`,
--   `cashier_user_id`, `pos_shift_id`, `branch_id`) lo escriben el service
--   role (`src/lib/payments.ts`, `stripe-webhook-handlers.ts`,
--   `foodos-payment-reminders.ts`, `api/foodos/pos/**`) o el INSERT.
--
--   profiles, cliente de sesión: **ninguno**. Todos los escritores reales
--   usan `createServiceClient()` (`admin/usuarios/actions.ts`,
--   `lib/admin-auth.ts`, `api/orders`, `api/workflows/trigger`). El único
--   intento desde el navegador (`components/onboarding-wizard.tsx`) hace
--   upsert de una columna `metadata` que **no existe** y falla en silencio
--   dentro de un try/catch, así que no se rompe nada. La lista blanca son
--   las columnas de "perfil propio" que la política promete editar.
--
-- INSERT se conserva a nivel de tabla en ambas: `foodos_orders` porque el
-- comensal anónimo crea su pedido ("Public can place orders", WITH CHECK
-- exige restaurante activo) y `profiles` porque el alta de usuario pasa por
-- INSERT.
--
-- CONSECUENCIA A TENER EN CUENTA
-- ------------------------------
-- Agregar una columna editable por el dueño (p. ej. "editar la dirección de
-- entrega del pedido") ahora requiere una migración que la añada a esta
-- lista. Es el precio de que el privilegio sea real; los `$guard$` de abajo
-- hacen que el fallo sea ruidoso en lugar de silencioso.
-- ============================================================

-- ── 1. foodos_orders ────────────────────────────────────────

REVOKE UPDATE ON public.foodos_orders FROM authenticated, anon;

GRANT UPDATE (
  status,
  payment_status,
  table_number,
  table_ticket_id
) ON public.foodos_orders TO authenticated;

-- No se concede a `anon`: la política "Owner updates orders" exige
-- `auth.uid() = <dueño>`, que es siempre falso para un cliente anónimo.

DO $guard$
DECLARE
  v_bad TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 1. Ninguna columna de dinero, ruteo o identidad puede quedar escribible
  --    por el dueño.
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'total', 'UPDATE') THEN
    v_bad := v_bad || 'total';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'subtotal', 'UPDATE') THEN
    v_bad := v_bad || 'subtotal';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'discount', 'UPDATE') THEN
    v_bad := v_bad || 'discount';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'delivery_fee', 'UPDATE') THEN
    v_bad := v_bad || 'delivery_fee';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'tip', 'UPDATE') THEN
    v_bad := v_bad || 'tip';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'application_fee_amount', 'UPDATE') THEN
    v_bad := v_bad || 'application_fee_amount';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'connected_account_id', 'UPDATE') THEN
    v_bad := v_bad || 'connected_account_id';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'stripe_transfer_id', 'UPDATE') THEN
    v_bad := v_bad || 'stripe_transfer_id';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'stripe_payment_intent_id', 'UPDATE') THEN
    v_bad := v_bad || 'stripe_payment_intent_id';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'loyalty_points_redeemed', 'UPDATE') THEN
    v_bad := v_bad || 'loyalty_points_redeemed';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'loyalty_points_earned', 'UPDATE') THEN
    v_bad := v_bad || 'loyalty_points_earned';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'payment_breakdown', 'UPDATE') THEN
    v_bad := v_bad || 'payment_breakdown';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'items', 'UPDATE') THEN
    v_bad := v_bad || 'items';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'folio', 'UPDATE') THEN
    v_bad := v_bad || 'folio';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'restaurant_id', 'UPDATE') THEN
    v_bad := v_bad || 'restaurant_id';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'customer_id', 'UPDATE') THEN
    v_bad := v_bad || 'customer_id';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'cashier_user_id', 'UPDATE') THEN
    v_bad := v_bad || 'cashier_user_id';
  END IF;
  IF has_column_privilege('authenticated', 'public.foodos_orders', 'pos_shift_id', 'UPDATE') THEN
    v_bad := v_bad || 'pos_shift_id';
  END IF;
  IF has_table_privilege('authenticated', 'public.foodos_orders', 'UPDATE') THEN
    v_bad := v_bad || 'authenticated:UPDATE-de-tabla';
  END IF;
  IF has_table_privilege('anon', 'public.foodos_orders', 'UPDATE')
     OR has_column_privilege('anon', 'public.foodos_orders', 'total', 'UPDATE')
     OR has_column_privilege('anon', 'public.foodos_orders', 'status', 'UPDATE')
  THEN
    v_bad := v_bad || 'anon:UPDATE';
  END IF;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'foodos_orders: siguen escribibles columnas sensibles: %', array_to_string(v_bad, ', ');
  END IF;

  -- 2. El dueño conserva exactamente lo que sí opera.
  IF NOT has_column_privilege('authenticated', 'public.foodos_orders', 'status', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_orders', 'payment_status', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_orders', 'table_number', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.foodos_orders', 'table_ticket_id', 'UPDATE')
  THEN
    RAISE EXCEPTION 'foodos_orders: el dueño perdió columnas que sí debe poder editar';
  END IF;

  -- 3. INSERT intacto: el comensal anónimo crea su pedido.
  IF NOT has_table_privilege('anon', 'public.foodos_orders', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.foodos_orders', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.foodos_orders', 'SELECT')
  THEN
    RAISE EXCEPTION 'foodos_orders: se rompió INSERT/SELECT';
  END IF;

  -- 4. El service role conserva el control total.
  IF NOT has_column_privilege('service_role', 'public.foodos_orders', 'total', 'UPDATE')
     OR NOT has_column_privilege('service_role', 'public.foodos_orders', 'application_fee_amount', 'UPDATE')
     OR NOT has_column_privilege('service_role', 'public.foodos_orders', 'connected_account_id', 'UPDATE')
     OR NOT has_column_privilege('service_role', 'public.foodos_orders', 'loyalty_points_earned', 'UPDATE')
  THEN
    RAISE EXCEPTION 'foodos_orders: el service role perdió columnas que debe poder escribir';
  END IF;
END $guard$;

-- ── 2. profiles ─────────────────────────────────────────────

REVOKE UPDATE ON public.profiles FROM authenticated, anon;

GRANT UPDATE (
  full_name,
  phone,
  birthday,
  avatar_url,
  default_city_id,
  marketing_consent
) ON public.profiles TO authenticated;

-- Fuera de la lista, a propósito:
--   * `role`              — ya lo protegía `protect_profile_role_trigger`
--                           (00067); se retira el privilegio como segunda capa.
--   * `referral_code`     — lo asigna el trigger `set_referral_code` (BEFORE
--                           INSERT). Si el dueño lo reescribe, el programa de
--                           referidos deja de ser confiable.
--   * `referred_by`       — pagaba $100 MXN por autorreferirse (ver arriba).
--   * `rewards_onboarded_at` — marca de estado del servidor.
--   * `id`, `created_at`, `updated_at` — no editables.

DO $guard$
DECLARE
  v_bad TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') THEN
    v_bad := v_bad || 'role';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'referral_code', 'UPDATE') THEN
    v_bad := v_bad || 'referral_code';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'referred_by', 'UPDATE') THEN
    v_bad := v_bad || 'referred_by';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'rewards_onboarded_at', 'UPDATE') THEN
    v_bad := v_bad || 'rewards_onboarded_at';
  END IF;
  IF has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     OR has_table_privilege('anon', 'public.profiles', 'UPDATE')
     OR has_column_privilege('anon', 'public.profiles', 'role', 'UPDATE')
  THEN
    v_bad := v_bad || 'UPDATE-de-tabla';
  END IF;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'profiles: siguen escribibles columnas sensibles: %', array_to_string(v_bad, ', ');
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.profiles', 'phone', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.profiles', 'marketing_consent', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.profiles', 'default_city_id', 'UPDATE')
  THEN
    RAISE EXCEPTION 'profiles: el dueño perdió columnas que sí debe poder editar';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.profiles', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT')
  THEN
    RAISE EXCEPTION 'profiles: se rompió INSERT/SELECT';
  END IF;

  IF NOT has_column_privilege('service_role', 'public.profiles', 'role', 'UPDATE')
     OR NOT has_column_privilege('service_role', 'public.profiles', 'referred_by', 'UPDATE')
  THEN
    RAISE EXCEPTION 'profiles: el service role perdió columnas que debe poder escribir';
  END IF;
END $guard$;

-- ── 3. Invariante de autorreferido ──────────────────────────
-- El privilegio de columna cierra la escritura desde el navegador, pero el
-- autorreferido sigue siendo un dato inválido venga de donde venga. Se
-- declara como restricción para que la base no lo admita nunca más.

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_no_self_referral'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_no_self_referral
      CHECK (referred_by IS NULL OR referred_by IS DISTINCT FROM id);
  END IF;
END $guard$;

COMMENT ON CONSTRAINT profiles_no_self_referral ON public.profiles IS
  'Un usuario no puede ser su propio referidor: process_referral_reward() paga $100 MXN al referidor y el autorreferido sería crédito gratis.';

-- ── 4. Defensa en profundidad en el trigger de dinero ───────
-- Se reproduce el cuerpo vigente (00147) y se le añade el guard de
-- autorreferido. Así el pago se niega incluso si la fila llegó con
-- `referred_by = id` antes de que existiera la restricción.

CREATE OR REPLACE FUNCTION public.process_referral_reward()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referrer_id UUID;
  v_order_count INTEGER;
  v_wallet_id   BIGINT;
  v_reward_amount NUMERIC(10,2) := 100.00;
  v_concept     TEXT;
BEGIN
  -- Solo procesar cuando status cambia a 'confirmed'
  IF NEW.status <> 'confirmed' OR OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Verificar que el usuario fue referido
  SELECT referred_by INTO v_referrer_id FROM public.profiles WHERE id = NEW.user_id;
  IF v_referrer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Guard de autorreferido: `profiles.referred_by` es escribible por el dueño
  -- de la fila (política "Users can update own profile"). Antes de este archivo eso
  -- permitía poner `referred_by = id` y cobrar $100 MXN en el propio monedero
  -- al confirmar la primera compra. El privilegio de columna ya lo cierra;
  -- esto además hace que el trigger de dinero se defienda solo si la fila
  -- llegó con autorreferido por otra vía (service role, importación, dato viejo).
  IF v_referrer_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Verificar que sea la primera compra del referido
  SELECT COUNT(*) INTO v_order_count FROM public.orders
  WHERE user_id = NEW.user_id
    AND id <> NEW.id
    AND status IN ('confirmed', 'preparing', 'out_for_delivery', 'delivered');

  IF v_order_count > 0 THEN
    RETURN NEW; -- No es primera compra, no premiar
  END IF;

  -- La recompensa se paga UNA sola vez por usuario referido: si la orden
  -- se cancela y se vuelve a confirmar (o si el referido confirma otra
  -- orden tras cancelar la primera), v_order_count vuelve a dar 0 y se
  -- pagaría de nuevo. El concepto identifica de forma única al referido.
  v_concept := 'Recompensa por referido — Usuario #' || NEW.user_id::TEXT;

  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    JOIN public.wallets w ON w.id = wt.wallet_id
    WHERE w.user_id = v_referrer_id
      AND wt.concept = v_concept
  ) THEN
    RETURN NEW; -- Ya se pagó esta recompensa
  END IF;

  -- Asegurar que el monedero del referidor existe
  INSERT INTO public.wallets (user_id, balance_credits)
  VALUES (v_referrer_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = v_referrer_id;

  -- Registrar transacción de recompensa
  INSERT INTO public.wallet_transactions (wallet_id, amount, concept, order_id)
  VALUES (v_wallet_id, v_reward_amount, v_concept, NEW.id);

  -- Actualizar saldo
  UPDATE public.wallets
  SET balance_credits = balance_credits + v_reward_amount,
      updated_at = now()
  WHERE id = v_wallet_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.process_referral_reward() IS
  'AFTER UPDATE en orders. Paga $100 MXN de créditos al referidor en la primera compra confirmada del referido. Idempotente: una recompensa por usuario referido (identificada por el concepto). Rechaza el autorreferido (00162). Todas las tablas deben ir calificadas con public. porque la función corre con search_path vacío.';
