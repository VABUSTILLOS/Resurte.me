-- ============================================================
-- 00195 — Las credenciales que viajaban en el `GRANT SELECT` de tabla
--         dejan de ser legibles con la llave anónima.
--
-- EL AGUJERO
-- ----------
-- Es el mismo defecto que `00192` cerró en `products` y `00193` en
-- `foodos_restaurants`/`foodos_menu_items`, repetido en trece tablas más.
-- Todas tienen `GRANT SELECT` **a nivel de tabla** para `anon` y
-- `authenticated` —viene del `ALTER DEFAULT PRIVILEGES` de Supabase, el
-- mecanismo que documenta `00160`— y sus políticas RLS filtran **filas, no
-- columnas**. Con la llave anónima que viaja en el navegador bastaba
--
--     GET /rest/v1/orders?select=stripe_payment_intent_id,restore_token
--     GET /rest/v1/foodos_webhooks?select=secret
--     GET /rest/v1/foodos_couriers?select=access_token
--     GET /rest/v1/foodos_delivery_zones?select=payout_mode,payout_value
--
-- para leer: los identificadores de cobro de Stripe de cada pedido, el
-- `restore_token` (que **es** una credencial: con él se sigue y se cancela el
-- pedido de otro), el secreto con el que firmamos los webhooks salientes de
-- cada restaurante, el token de reparto de cada mensajero, la tarifa que le
-- pagamos por entrega y el `token` de las tarjetas de wallet.
--
-- SON 21 COLUMNAS
-- ---------------
--   · `orders` (6): `restore_token`, `stripe_checkout_session_id`,
--     `stripe_customer_id`, `stripe_payment_intent_id`,
--     `stripe_payment_method_id`, `stripe_refund_id`.
--   · `foodos_orders` (3): `stripe_payment_intent_id`, `stripe_refund_id`,
--     `stripe_transfer_id`.
--   · `addresses` (1): `guest_token`.
--   · `foodos_webhooks` (1): `secret`.
--   · `foodos_whatsapp_connections` (1): `access_token_enc`.
--   · `foodos_pos_connections` (1): `webhook_secret`.
--   · `foodos_couriers` (1): `access_token`.
--   · `foodos_deliveries` (1): `courier_payout`.
--   · `foodos_delivery_zones` (2): `payout_mode`, `payout_value`.
--   · `foodos_wallet_passes` (1): `token`.
--   · `foodos_order_payments` (1): `reviewed_by`.
--   · `foodos_ai_usage` (1) y `foodos_ai_messages` (1): `tokens_used`.
--
-- ESTO ES ENDURECIMIENTO, NO UN INCIDENTE
-- ---------------------------------------
-- **Hoy no hay fuga viva**: se comprobó con sonda anónima que las 21 columnas
-- devuelven `[]` (cero filas), porque las políticas RLS de lectura de estas
-- tablas son de dueño (`auth.uid() = user_id`, o un `EXISTS` que entra a
-- `foodos_restaurants` por `user_id`) y para un visitante anónimo `auth.uid()`
-- es `NULL`. Lo que cambia aquí es la **segunda** capa: hoy la columna es
-- ilegible porque RLS tapa la fila; después lo será porque tampoco está
-- concedida. El día que una política se afloje —una vista pública, un
-- `USING (true)` de más— la columna ya no estará ahí.
--
-- LA REGLA
-- --------
-- **Lista blanca, no lista negra.** `REVOKE SELECT (columna)` sobre un `GRANT
-- SELECT` de tabla es **inerte** (Postgres subsume el privilegio de columna en
-- el de tabla, el tropiezo que `00160` dejó escrito), y con lista blanca
-- cualquier columna que se añada mañana nace **privada**: el default es el
-- seguro, y abrirla exige una migración explícita.
--
-- La lista vive en **`src/lib/sensitive-columns.ts`** porque el código la
-- necesita para pedirla, y `src/lib/sensitive-columns.contract.test.ts` compara
-- las dos para que no puedan divergir.
--
-- DOS CONJUNTOS POR TABLA, NO UNO
-- -------------------------------
-- `anon` y `authenticated` no leen lo mismo. El panel del dueño usa el cliente
-- de sesión y **sí** necesita el secreto de sus webhooks
-- (`src/lib/foodos-webhooks.ts`), el token cifrado de su WhatsApp
-- (`src/lib/foodos-whatsapp.ts`), el `webhook_secret` de su POS
-- (`src/lib/pos/connections.ts`), el `access_token` de sus mensajeros (que
-- `src/lib/flotilla/deliveries.ts` usa para **filtrar**), la tarifa de sus zonas
-- y el `courier_payout` de sus entregas, el `token` de sus tarjetas de wallet
-- (`src/lib/foodos-wallet/passes.ts`) y el `tokens_used` de su consumo de IA
-- (`src/lib/ai/usage.ts`). Esas **ocho** tablas conservan sus columnas para
-- `authenticated` y solo se revocan de `anon`.
--
-- El resto —los `stripe_*`, el `restore_token`, el `guest_token`, el
-- `reviewed_by` y `foodos_ai_messages.tokens_used`— los lee **solo**
-- `service_role` (verificado leyendo cada lector: `payments.ts`,
-- `stripe-webhook-handlers.ts`, `order-emails.ts`, `reconcile-payments.ts`,
-- `src/app/api/orders/*`, `src/app/api/addresses/guest`, `upsell-offers.ts`),
-- así que se revocan de los dos roles.
--
-- POR QUÉ HAY QUE CAMBIAR LOS `select("*")` ANTES
-- ----------------------------------------------
-- PostgREST expande `*` a **todas** las columnas de su caché, así que un
-- `select("*")` sobre una tabla con una columna revocada no devuelve una fila
-- incompleta: falla la consulta **entera** con `42501 permission denied`. Por
-- eso, en el mismo cambio, los lectores de cliente que hacían `select("*")`
-- sobre `orders`, `addresses`, `foodos_orders` y `foodos_order_payments` piden
-- ahora las constantes `PUBLIC_*_SELECT` de `src/lib/sensitive-columns.ts`.
--
-- SOLO SE TOCA `SELECT`
-- ---------------------
-- A diferencia de `00192`, aquí **no** se revocan `INSERT`/`UPDATE`/`DELETE`:
-- el dueño sí escribe estas tablas con el cliente de sesión (inserta pedidos,
-- edita zonas y mensajeros, aprueba comprobantes) y `00160` ya había acotado el
-- `UPDATE` de `foodos_restaurants` a 18 columnas. Revocar aquí la escritura
-- desharía ese trabajo y rompería el panel. La guarda de abajo lo afirma en
-- positivo para que nadie lo «limpie» otra vez.
--
-- Idempotente: re-ejecutarla deja el mismo estado.
-- ============================================================

-- ── orders ────────────────────────────────────────────────────
-- El privilegio de tabla va primero: mientras exista, cualquier REVOKE de
-- columna que se escriba después es decorativo.
REVOKE SELECT ON public.orders FROM PUBLIC;
REVOKE SELECT ON public.orders FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  store_id,
  city_id,
  address_id,
  status,
  subtotal,
  delivery_fee,
  total,
  payment_method,
  payment_status,
  scheduled_for,
  source,
  created_at,
  updated_at,
  cashback_credits,
  cashback_tier,
  week_of_month,
  month_year,
  customer_phone,
  discount,
  customer_email,
  driver_id,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_term,
  utm_content,
  coupon_code,
  stock_reserved,
  delivery_proof_path,
  delivery_proof_at,
  delivery_proof_note,
  refunded_amount_cents
) ON public.orders TO anon;

-- La misma lista para `authenticated`: los `stripe_*` y el `restore_token` los
-- lee únicamente `service_role` (pagos, webhooks de Stripe y los correos).
GRANT SELECT (
  id,
  user_id,
  store_id,
  city_id,
  address_id,
  status,
  subtotal,
  delivery_fee,
  total,
  payment_method,
  payment_status,
  scheduled_for,
  source,
  created_at,
  updated_at,
  cashback_credits,
  cashback_tier,
  week_of_month,
  month_year,
  customer_phone,
  discount,
  customer_email,
  driver_id,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_term,
  utm_content,
  coupon_code,
  stock_reserved,
  delivery_proof_path,
  delivery_proof_at,
  delivery_proof_note,
  refunded_amount_cents
) ON public.orders TO authenticated;

-- ── foodos_orders ─────────────────────────────────────────────
REVOKE SELECT ON public.foodos_orders FROM PUBLIC;
REVOKE SELECT ON public.foodos_orders FROM anon, authenticated;

GRANT SELECT (
  id,
  restaurant_id,
  branch_id,
  customer_id,
  items,
  subtotal,
  discount,
  delivery_fee,
  total,
  channel,
  fulfillment,
  status,
  payment_method,
  payment_status,
  slug,
  customer_name,
  customer_phone,
  note,
  created_at,
  table_number,
  tip,
  coupon_code,
  loyalty_points_redeemed,
  loyalty_points_earned,
  updated_at,
  application_fee_amount,
  connected_account_id,
  scheduled_for,
  delivery_address,
  delivery_lat,
  delivery_lng,
  delivery_notes,
  folio,
  cashier_user_id,
  pos_shift_id,
  table_ticket_id,
  payment_breakdown,
  refunded_amount_cents
) ON public.foodos_orders TO anon;

GRANT SELECT (
  id,
  restaurant_id,
  branch_id,
  customer_id,
  items,
  subtotal,
  discount,
  delivery_fee,
  total,
  channel,
  fulfillment,
  status,
  payment_method,
  payment_status,
  slug,
  customer_name,
  customer_phone,
  note,
  created_at,
  table_number,
  tip,
  coupon_code,
  loyalty_points_redeemed,
  loyalty_points_earned,
  updated_at,
  application_fee_amount,
  connected_account_id,
  scheduled_for,
  delivery_address,
  delivery_lat,
  delivery_lng,
  delivery_notes,
  folio,
  cashier_user_id,
  pos_shift_id,
  table_ticket_id,
  payment_breakdown,
  refunded_amount_cents
) ON public.foodos_orders TO authenticated;

-- ── addresses ─────────────────────────────────────────────────
REVOKE SELECT ON public.addresses FROM PUBLIC;
REVOKE SELECT ON public.addresses FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  label,
  street,
  number,
  interior,
  neighborhood,
  city,
  state,
  zip_code,
  "references",
  lat,
  lng,
  created_at,
  is_default,
  city_id,
  last_used_at,
  deleted_at
) ON public.addresses TO anon, authenticated;

-- ── foodos_webhooks ───────────────────────────────────────────
REVOKE SELECT ON public.foodos_webhooks FROM PUBLIC;
REVOKE SELECT ON public.foodos_webhooks FROM anon, authenticated;

GRANT SELECT (id, restaurant_id, url, is_active, created_at) ON public.foodos_webhooks TO anon;

-- `authenticated` sí necesita `secret`: es el dueño el que firma y verifica sus
-- propios webhooks (`src/lib/foodos-webhooks.ts`, `listWebhooks`).
GRANT SELECT (
  id,
  restaurant_id,
  url,
  secret,
  is_active,
  created_at
) ON public.foodos_webhooks TO authenticated;

-- ── foodos_whatsapp_connections ───────────────────────────────
REVOKE SELECT ON public.foodos_whatsapp_connections FROM PUBLIC;
REVOKE SELECT ON public.foodos_whatsapp_connections FROM anon, authenticated;

GRANT SELECT (
  id,
  restaurant_id,
  phone_number_id,
  waba_id,
  display_phone,
  status,
  status_detail,
  verified_at,
  created_at,
  auto_reply_catalog,
  auto_reply_text
) ON public.foodos_whatsapp_connections TO anon;

GRANT SELECT (
  id,
  restaurant_id,
  phone_number_id,
  waba_id,
  access_token_enc,
  display_phone,
  status,
  status_detail,
  verified_at,
  created_at,
  auto_reply_catalog,
  auto_reply_text
) ON public.foodos_whatsapp_connections TO authenticated;

-- ── foodos_pos_connections ────────────────────────────────────
REVOKE SELECT ON public.foodos_pos_connections FROM PUBLIC;
REVOKE SELECT ON public.foodos_pos_connections FROM anon, authenticated;

GRANT SELECT (
  id,
  restaurant_id,
  provider,
  status,
  credentials,
  external_location_id,
  last_sync_at,
  last_error,
  created_at,
  updated_at
) ON public.foodos_pos_connections TO anon;

GRANT SELECT (
  id,
  restaurant_id,
  provider,
  status,
  credentials,
  external_location_id,
  webhook_secret,
  last_sync_at,
  last_error,
  created_at,
  updated_at
) ON public.foodos_pos_connections TO authenticated;

-- ── foodos_couriers ───────────────────────────────────────────
REVOKE SELECT ON public.foodos_couriers FROM PUBLIC;
REVOKE SELECT ON public.foodos_couriers FROM anon, authenticated;

GRANT SELECT (
  id,
  restaurant_id,
  name,
  phone,
  vehicle,
  capacity,
  shift_start,
  shift_end,
  is_active,
  notes,
  created_at,
  updated_at
) ON public.foodos_couriers TO anon;

-- `access_token` se conserva para `authenticated` porque
-- `src/lib/flotilla/deliveries.ts` **filtra** por él para resolver qué
-- mensajero corresponde a un token de reparto; filtrar exige privilegio de
-- `SELECT` sobre la columna.
GRANT SELECT (
  id,
  restaurant_id,
  name,
  phone,
  vehicle,
  capacity,
  shift_start,
  shift_end,
  is_active,
  notes,
  created_at,
  updated_at,
  access_token
) ON public.foodos_couriers TO authenticated;

-- ── foodos_deliveries ─────────────────────────────────────────
REVOKE SELECT ON public.foodos_deliveries FROM PUBLIC;
REVOKE SELECT ON public.foodos_deliveries FROM anon, authenticated;

GRANT SELECT (
  id,
  restaurant_id,
  order_id,
  branch_id,
  zone_id,
  courier_id,
  provider,
  provider_delivery_id,
  provider_tracking_url,
  status,
  pickup_address,
  dropoff_address,
  dropoff_lat,
  dropoff_lng,
  dropoff_notes,
  zone_name,
  fee,
  distance_km,
  eta_minutes,
  assigned_at,
  picked_up_at,
  delivered_at,
  failed_reason,
  last_lat,
  last_lng,
  last_ping_at,
  created_at,
  updated_at,
  proof_pin,
  proof_photo_path,
  proof_verified,
  proof_at,
  cancel_reason
) ON public.foodos_deliveries TO anon;

GRANT SELECT (
  id,
  restaurant_id,
  order_id,
  branch_id,
  zone_id,
  courier_id,
  provider,
  provider_delivery_id,
  provider_tracking_url,
  status,
  pickup_address,
  dropoff_address,
  dropoff_lat,
  dropoff_lng,
  dropoff_notes,
  zone_name,
  fee,
  courier_payout,
  distance_km,
  eta_minutes,
  assigned_at,
  picked_up_at,
  delivered_at,
  failed_reason,
  last_lat,
  last_lng,
  last_ping_at,
  created_at,
  updated_at,
  proof_pin,
  proof_photo_path,
  proof_verified,
  proof_at,
  cancel_reason
) ON public.foodos_deliveries TO authenticated;

-- ── foodos_delivery_zones ─────────────────────────────────────
REVOKE SELECT ON public.foodos_delivery_zones FROM PUBLIC;
REVOKE SELECT ON public.foodos_delivery_zones FROM anon, authenticated;

GRANT SELECT (
  id,
  restaurant_id,
  branch_id,
  name,
  center_lat,
  center_lng,
  radius_km,
  fee,
  min_order,
  eta_minutes,
  color,
  sort_order,
  is_active,
  created_at,
  updated_at
) ON public.foodos_delivery_zones TO anon;

GRANT SELECT (
  id,
  restaurant_id,
  branch_id,
  name,
  center_lat,
  center_lng,
  radius_km,
  fee,
  min_order,
  eta_minutes,
  payout_mode,
  payout_value,
  color,
  sort_order,
  is_active,
  created_at,
  updated_at
) ON public.foodos_delivery_zones TO authenticated;

-- ── foodos_wallet_passes ──────────────────────────────────────
REVOKE SELECT ON public.foodos_wallet_passes FROM PUBLIC;
REVOKE SELECT ON public.foodos_wallet_passes FROM anon, authenticated;

GRANT SELECT (
  id,
  restaurant_id,
  customer_id,
  platform,
  serial,
  points,
  points_value,
  reward_label,
  reward_threshold,
  is_active,
  snapshot_at,
  pushed_at,
  push_count,
  created_at,
  updated_at
) ON public.foodos_wallet_passes TO anon;

GRANT SELECT (
  id,
  restaurant_id,
  customer_id,
  platform,
  serial,
  token,
  points,
  points_value,
  reward_label,
  reward_threshold,
  is_active,
  snapshot_at,
  pushed_at,
  push_count,
  created_at,
  updated_at
) ON public.foodos_wallet_passes TO authenticated;

-- ── foodos_order_payments ─────────────────────────────────────
REVOKE SELECT ON public.foodos_order_payments FROM PUBLIC;
REVOKE SELECT ON public.foodos_order_payments FROM anon, authenticated;

-- `reviewed_by` es auditoría interna. El panel del dueño sigue **escribiéndola**
-- al aprobar un comprobante: eso es privilegio de `UPDATE`, que aquí no se toca.
GRANT SELECT (
  id,
  order_id,
  restaurant_id,
  method,
  amount,
  proof_path,
  reference,
  status,
  reviewed_at,
  notes,
  created_at
) ON public.foodos_order_payments TO anon, authenticated;

-- ── foodos_ai_usage ───────────────────────────────────────────
REVOKE SELECT ON public.foodos_ai_usage FROM PUBLIC;
REVOKE SELECT ON public.foodos_ai_usage FROM anon, authenticated;

GRANT SELECT (restaurant_id, day, calls, fallbacks, updated_at) ON public.foodos_ai_usage TO anon;

-- `src/lib/ai/usage.ts` lee `tokens_used` con el cliente de sesión para pintar
-- el aviso del 80 % del tope diario: se conserva para `authenticated`.
GRANT SELECT (
  restaurant_id,
  day,
  tokens_used,
  calls,
  fallbacks,
  updated_at
) ON public.foodos_ai_usage TO authenticated;

-- ── foodos_ai_messages ────────────────────────────────────────
REVOKE SELECT ON public.foodos_ai_messages FROM PUBLIC;
REVOKE SELECT ON public.foodos_ai_messages FROM anon, authenticated;

-- Aquí sí se revoca de los dos: `listMeseroMessages` pide columnas explícitas
-- sin `tokens_used`, y el `insert` del orquestador no pide representación
-- (`return=minimal`), así que el `INSERT` sigue funcionando sin privilegio de
-- `SELECT` sobre la columna.
GRANT SELECT (
  id,
  session_id,
  restaurant_id,
  direction,
  content,
  source,
  state_before,
  state_after,
  created_at
) ON public.foodos_ai_messages TO anon, authenticated;

-- `service_role` conserva la tabla completa en las trece: es quien lee los
-- `stripe_*`, el `restore_token`, los secretos y el consumo de IA.
GRANT SELECT ON public.orders TO service_role;
GRANT SELECT ON public.foodos_orders TO service_role;
GRANT SELECT ON public.addresses TO service_role;
GRANT SELECT ON public.foodos_webhooks TO service_role;
GRANT SELECT ON public.foodos_whatsapp_connections TO service_role;
GRANT SELECT ON public.foodos_pos_connections TO service_role;
GRANT SELECT ON public.foodos_couriers TO service_role;
GRANT SELECT ON public.foodos_deliveries TO service_role;
GRANT SELECT ON public.foodos_delivery_zones TO service_role;
GRANT SELECT ON public.foodos_wallet_passes TO service_role;
GRANT SELECT ON public.foodos_order_payments TO service_role;
GRANT SELECT ON public.foodos_ai_usage TO service_role;
GRANT SELECT ON public.foodos_ai_messages TO service_role;

-- RLS sigue siendo la primera capa (filtra filas); esto reafirma que nadie la
-- apagó de paso.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_pos_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_wallet_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_ai_messages ENABLE ROW LEVEL SECURITY;

-- Guarda ruidosa: si el privilegio no quedó donde dice el comentario, la
-- migración falla en vez de dejar el agujero abierto en silencio.
--
-- Afirma una invariante **exacta**, no una muestra: para cada tabla, `anon`
-- puede leer una columna si y solo si no está en la lista privada, y lo mismo
-- `authenticated`. Eso cubre los dos errores que importan —una columna privada
-- que se quedó legible, y una pública que se perdió y dejaría la pantalla en
-- blanco con `42501`— y además falla el día que alguien añada una columna a una
-- de estas tablas sin actualizar la lista blanca, que es justo lo que hay que
-- notar.
DO $guard$
DECLARE
  v_tablas CONSTANT TEXT[] := ARRAY[
    'orders', 'foodos_orders', 'addresses', 'foodos_webhooks',
    'foodos_whatsapp_connections', 'foodos_pos_connections', 'foodos_couriers',
    'foodos_deliveries', 'foodos_delivery_zones', 'foodos_wallet_passes',
    'foodos_order_payments', 'foodos_ai_usage', 'foodos_ai_messages'
  ];
  -- Las 21 revocadas de `anon`.
  v_privadas_anon CONSTANT TEXT[] := ARRAY[
    'orders.restore_token',
    'orders.stripe_checkout_session_id',
    'orders.stripe_customer_id',
    'orders.stripe_payment_intent_id',
    'orders.stripe_payment_method_id',
    'orders.stripe_refund_id',
    'foodos_orders.stripe_payment_intent_id',
    'foodos_orders.stripe_refund_id',
    'foodos_orders.stripe_transfer_id',
    'addresses.guest_token',
    'foodos_webhooks.secret',
    'foodos_whatsapp_connections.access_token_enc',
    'foodos_pos_connections.webhook_secret',
    'foodos_couriers.access_token',
    'foodos_deliveries.courier_payout',
    'foodos_delivery_zones.payout_mode',
    'foodos_delivery_zones.payout_value',
    'foodos_wallet_passes.token',
    'foodos_order_payments.reviewed_by',
    'foodos_ai_usage.tokens_used',
    'foodos_ai_messages.tokens_used'
  ];
  -- Las 12 que tampoco lee `authenticated`.
  v_privadas_auth CONSTANT TEXT[] := ARRAY[
    'orders.restore_token',
    'orders.stripe_checkout_session_id',
    'orders.stripe_customer_id',
    'orders.stripe_payment_intent_id',
    'orders.stripe_payment_method_id',
    'orders.stripe_refund_id',
    'foodos_orders.stripe_payment_intent_id',
    'foodos_orders.stripe_refund_id',
    'foodos_orders.stripe_transfer_id',
    'addresses.guest_token',
    'foodos_order_payments.reviewed_by',
    'foodos_ai_messages.tokens_used'
  ];
  v_tabla TEXT;
  v_col TEXT;
  v_par TEXT;
  v_fuga TEXT[] := ARRAY[]::TEXT[];
  v_falta TEXT[] := ARRAY[]::TEXT[];
  v_privada BOOLEAN;
BEGIN
  -- Primero: ninguna entrada de la lista puede ser un typo. Si una columna
  -- nombrada aquí no existe, el barrido de abajo no la vería nunca y la guarda
  -- pasaría en silencio.
  FOREACH v_par IN ARRAY v_privadas_anon LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = split_part(v_par, '.', 1)
        AND c.column_name = split_part(v_par, '.', 2)
    ) THEN
      RAISE EXCEPTION '00195: la lista privada nombra una columna que no existe: %', v_par;
    END IF;
  END LOOP;

  FOREACH v_tabla IN ARRAY v_tablas LOOP
    FOR v_col IN
      SELECT c.column_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = v_tabla
      ORDER BY c.ordinal_position
    LOOP
      v_par := v_tabla || '.' || v_col;

      v_privada := v_par = ANY (v_privadas_anon);
      IF v_privada THEN
        IF has_column_privilege('anon', 'public.' || v_tabla, v_col, 'SELECT') THEN
          v_fuga := v_fuga || ('anon:' || v_par);
        END IF;
      ELSIF NOT has_column_privilege('anon', 'public.' || v_tabla, v_col, 'SELECT') THEN
        v_falta := v_falta || ('anon:' || v_par);
      END IF;

      v_privada := v_par = ANY (v_privadas_auth);
      IF v_privada THEN
        IF has_column_privilege('authenticated', 'public.' || v_tabla, v_col, 'SELECT') THEN
          v_fuga := v_fuga || ('authenticated:' || v_par);
        END IF;
      ELSIF NOT has_column_privilege('authenticated', 'public.' || v_tabla, v_col, 'SELECT') THEN
        v_falta := v_falta || ('authenticated:' || v_par);
      END IF;
    END LOOP;

    IF has_table_privilege('anon', 'public.' || v_tabla, 'SELECT') THEN
      RAISE EXCEPTION '00195: anon conserva SELECT a nivel de tabla en %', v_tabla;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || v_tabla, 'SELECT') THEN
      RAISE EXCEPTION '00195: service_role perdio SELECT en %', v_tabla;
    END IF;

    -- Solo se tocó la lectura: el dueño sigue escribiendo con el cliente de
    -- sesión (inserta pedidos, edita zonas y mensajeros, aprueba comprobantes).
    -- `foodos_orders` se exceptúa del `UPDATE` porque **ya venía así**: el
    -- `ALTER DEFAULT PRIVILEGES` no le dio `UPDATE` de tabla a `authenticated`
    -- (se comprobó antes de escribir esto), y afirmarlo aquí sería afirmar algo
    -- que este archivo no puede conceder.
    IF NOT has_table_privilege('authenticated', 'public.' || v_tabla, 'INSERT')
       OR NOT has_table_privilege('authenticated', 'public.' || v_tabla, 'DELETE')
       OR (v_tabla <> 'foodos_orders'
           AND NOT has_table_privilege('authenticated', 'public.' || v_tabla, 'UPDATE')) THEN
      RAISE EXCEPTION '00195: se perdio escritura de authenticated en %', v_tabla;
    END IF;
  END LOOP;

  IF array_length(v_fuga, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00195: anon/authenticated todavia pueden leer %', v_fuga;
  END IF;
  IF array_length(v_falta, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00195: la superficie publica perdio acceso a %', v_falta;
  END IF;

  RAISE NOTICE '00195: % tablas endurecidas, % columnas revocadas de anon (% de authenticated); SELECT de tabla revocado.',
    array_length(v_tablas, 1), array_length(v_privadas_anon, 1), array_length(v_privadas_auth, 1);
END $guard$;
