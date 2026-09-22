/**
 * Columnas que la superficie pública **no** puede leer, tabla por tabla.
 *
 * POR QUÉ EXISTE ESTA LISTA
 * -------------------------
 * Es el mismo defecto que `00192` cerró en `products` y `00193` en
 * `foodos_restaurants`/`foodos_menu_items`, repetido en trece tablas más.
 * Todas tienen `GRANT SELECT` **a nivel de tabla** para `anon` y
 * `authenticated` (viene del `ALTER DEFAULT PRIVILEGES` de Supabase, el
 * mecanismo que documenta `00160`) y sus políticas RLS filtran **filas, no
 * columnas**. Bastaba
 *
 *     GET /rest/v1/orders?select=stripe_payment_intent_id,restore_token
 *     GET /rest/v1/foodos_webhooks?select=secret
 *     GET /rest/v1/foodos_couriers?select=access_token
 *     GET /rest/v1/foodos_delivery_zones?select=payout_mode,payout_value
 *
 * para leer, con la llave anónima que viaja en el navegador: los identificadores
 * de Stripe de cada pedido, el `restore_token` (que **es** una credencial: con
 * él se sigue y se cancela el pedido de otro), el secreto con el que firmamos
 * los webhooks salientes de cada restaurante, el token de reparto de cada
 * mensajero, la tarifa que le pagamos por entrega y el `token` de las tarjetas
 * de wallet.
 *
 * **Hoy no hay fuga viva**: se comprobó con sonda anónima que las 21 columnas
 * devuelven `[]` (cero filas) porque las políticas RLS de lectura son de dueño
 * (`auth.uid() = user_id`) y para un visitante anónimo `auth.uid()` es `NULL`.
 * Esto es **endurecimiento**, no incidente: quita la dependencia de que RLS
 * siga tapando filas. El día que una política se afloje —una vista pública, un
 * `USING (true)` de más— la columna ya no estará concedida.
 *
 * POR QUÉ ES LISTA BLANCA
 * -----------------------
 * `REVOKE SELECT (columna)` sobre un `GRANT SELECT` de tabla es **inerte**
 * (Postgres subsume el privilegio de columna en el de tabla), y con lista
 * blanca cualquier columna que se añada mañana nace **privada**: el default es
 * el seguro. Abrirla exige una migración explícita.
 *
 * DOS CONJUNTOS POR TABLA, NO UNO
 * -------------------------------
 * `anon` y `authenticated` no leen lo mismo. El panel del dueño usa el cliente
 * de sesión (`authenticated`) para leer el secreto de sus webhooks, el token
 * cifrado de su WhatsApp, el `webhook_secret` de su POS, el token de reparto de
 * sus mensajeros, la tarifa de sus zonas y el `tokens_used` de su consumo de
 * IA. Esos se **conservan** para `authenticated` y solo se revocan de `anon`.
 * El resto —los `stripe_*`, el `restore_token`, el `guest_token` de las
 * direcciones, el `reviewed_by` de los comprobantes— los lee **solo**
 * `service_role`, así que se revocan de los dos.
 *
 * POR QUÉ HAY QUE CAMBIAR LOS `select("*")` ANTES
 * ----------------------------------------------
 * PostgREST expande `*` a **todas** las columnas de su caché, así que un
 * `select("*")` sobre una tabla con una columna revocada no devuelve una fila
 * incompleta: falla la consulta **entera** con `42501 permission denied`. Por
 * eso los lectores de cliente usan las constantes `PUBLIC_*_SELECT` de aquí, y
 * `src/lib/sensitive-columns.contract.test.ts` vigila que ninguno vuelva a
 * pedir `*` ni una columna privada.
 *
 * SOLO SE TOCA `SELECT`
 * ---------------------
 * No se revoca `INSERT`/`UPDATE`/`DELETE` en ninguna tabla: el dueño sigue
 * editando su menú, sus zonas y sus mensajeros con el cliente de sesión, y
 * `00160` ya había acotado el `UPDATE` de `foodos_restaurants` a 18 columnas.
 * Revocar aquí la escritura desharía ese trabajo.
 *
 * `foodos_ai_messages.tokens_used` y `foodos_ai_usage.tokens_used` son las dos
 * de menor sensibilidad de la lista (revelan cuánto gasta el restaurante en
 * IA, no una credencial). Se incluyen porque son gratis: `ai_messages` no tiene
 * lector de sesión que la pida, y `ai_usage` la conserva para `authenticated`.
 */

/**
 * Columnas de `orders` que solo lee `service_role`.
 *
 * `restore_token` no es un identificador, es una **credencial**: la capability
 * URL con la que el invitado sigue y cancela su pedido. Los `stripe_*` son los
 * identificadores de cobro del pedido. Todos los lectores
 * (`src/lib/payments.ts`, `src/lib/stripe-webhook-handlers.ts`,
 * `src/lib/order-emails.ts`, `src/app/api/orders/*`) van con
 * `createServiceClient()`, así que se revocan de `anon` **y** de
 * `authenticated`.
 */
export const PRIVATE_ORDERS_COLUMNS = [
  "restore_token",
  "stripe_checkout_session_id",
  "stripe_customer_id",
  "stripe_payment_intent_id",
  "stripe_payment_method_id",
  "stripe_refund_id",
] as const

/**
 * Lo que la superficie pública puede leer de `orders`.
 *
 * Es un literal con `as const` a propósito: supabase-js infiere el tipo de la
 * fila del **literal** del select, y con una cadena construida en runtime cae a
 * `GenericStringError` y cada acceso a `.id` deja de compilar.
 */
export const PUBLIC_ORDERS_SELECT =
  "id, user_id, store_id, city_id, address_id, status, subtotal, delivery_fee, total, payment_method, payment_status, scheduled_for, source, created_at, updated_at, cashback_credits, cashback_tier, week_of_month, month_year, customer_phone, discount, customer_email, driver_id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, coupon_code, stock_reserved, delivery_proof_path, delivery_proof_at, delivery_proof_note, refunded_amount_cents" as const

export const PUBLIC_ORDERS_COLUMNS = PUBLIC_ORDERS_SELECT.split(", ")

/**
 * Los embeds que acompañan a `PUBLIC_ORDERS_SELECT` en las dos pantallas que
 * pintan un pedido con sus líneas. Van aquí y no escritos a mano en cada
 * lector para que el `select` completo se derive del registro y no pueda
 * quedarse con una columna privada al añadir otra.
 */
export const PUBLIC_ORDER_ITEMS_EMBED =
  "order_items(*, products(id, name, image_url, slug))" as const

export const PUBLIC_ORDERS_WITH_ITEMS_SELECT = `${PUBLIC_ORDERS_SELECT}, ${PUBLIC_ORDER_ITEMS_EMBED}` as const

/**
 * Columnas de `foodos_orders` que solo lee `service_role`.
 *
 * Los tres son identificadores de Stripe del cobro (`payments.ts`,
 * `reconcile-payments.ts`, `stripe-webhook-handlers.ts`, la ruta de reembolso
 * del admin): el dueño no los necesita para operar, y el panel de pedidos los
 * pedía solo porque hacía `select("*")`.
 */
export const PRIVATE_FOODOS_ORDERS_COLUMNS = [
  "stripe_payment_intent_id",
  "stripe_refund_id",
  "stripe_transfer_id",
] as const

export const PUBLIC_FOODOS_ORDERS_SELECT =
  "id, restaurant_id, branch_id, customer_id, items, subtotal, discount, delivery_fee, total, channel, fulfillment, status, payment_method, payment_status, slug, customer_name, customer_phone, note, created_at, table_number, tip, coupon_code, loyalty_points_redeemed, loyalty_points_earned, updated_at, application_fee_amount, connected_account_id, scheduled_for, delivery_address, delivery_lat, delivery_lng, delivery_notes, folio, cashier_user_id, pos_shift_id, table_ticket_id, payment_breakdown, refunded_amount_cents" as const

export const PUBLIC_FOODOS_ORDERS_COLUMNS = PUBLIC_FOODOS_ORDERS_SELECT.split(", ")

/**
 * Columnas de `addresses` que solo lee `service_role`.
 *
 * `guest_token` es la credencial del libro de direcciones de un invitado
 * (`src/app/api/addresses/guest/route.ts`, `src/lib/payments.ts`,
 * `src/lib/upsell-offers.ts`), y esas tres rutas van con
 * `createServiceClient()`. Las pantallas de cliente (`mis-direcciones`,
 * `use-checkout-order`) hacían `select("*")`; ahora piden la lista pública.
 */
export const PRIVATE_ADDRESSES_COLUMNS = ["guest_token"] as const

export const PUBLIC_ADDRESSES_SELECT =
  "id, user_id, label, street, number, interior, neighborhood, city, state, zip_code, references, lat, lng, created_at, is_default, city_id, last_used_at, deleted_at" as const

export const PUBLIC_ADDRESSES_COLUMNS = PUBLIC_ADDRESSES_SELECT.split(", ")

/**
 * El detalle del pedido de `/mis-pedidos/[orderId]`: el pedido, sus líneas y la
 * dirección. Se compone aquí —y no a mano en el lector— para que no pueda
 * quedarse con una columna privada; y la dirección entra por
 * `PUBLIC_ADDRESSES_SELECT`, que es lo que evita pedir su `guest_token`.
 */
export const PUBLIC_ORDERS_DETAIL_SELECT = `${PUBLIC_ORDERS_WITH_ITEMS_SELECT}, addresses(${PUBLIC_ADDRESSES_SELECT})` as const

/**
 * Columnas de `foodos_webhooks` que solo lee `service_role`.
 *
 * `secret` firma los webhooks salientes del restaurante: quien lo tenga puede
 * falsificar un aviso de pedido. `authenticated` **sí** lo lee
 * (`src/lib/foodos-webhooks.ts` y `listWebhooks` lo piden con el cliente de
 * sesión, después de `requireFoodosAuth()`), así que solo se revoca de `anon`.
 */
export const PRIVATE_FOODOS_WEBHOOKS_COLUMNS = ["secret"] as const

export const PUBLIC_FOODOS_WEBHOOKS_SELECT =
  "id, restaurant_id, url, is_active, created_at" as const

export const PUBLIC_FOODOS_WEBHOOKS_COLUMNS = PUBLIC_FOODOS_WEBHOOKS_SELECT.split(", ")

/** `authenticated` conserva `secret`: es el dueño el que firma sus webhooks. */
export const AUTHENTICATED_FOODOS_WEBHOOKS_COLUMNS = [
  ...PUBLIC_FOODOS_WEBHOOKS_COLUMNS,
  "secret",
]

/**
 * Columnas de `foodos_whatsapp_connections` que solo lee `service_role`.
 *
 * `access_token_enc` es el token de la Cloud API de Meta, cifrado con
 * `encryptToken()`; descifrarlo permite enviar WhatsApp en nombre del
 * restaurante. `src/lib/foodos-whatsapp.ts` y el panel del dueño lo leen con el
 * cliente de sesión, así que se conserva para `authenticated`.
 */
export const PRIVATE_FOODOS_WHATSAPP_CONNECTIONS_COLUMNS = ["access_token_enc"] as const

export const PUBLIC_FOODOS_WHATSAPP_CONNECTIONS_SELECT =
  "id, restaurant_id, phone_number_id, waba_id, display_phone, status, status_detail, verified_at, created_at, auto_reply_catalog, auto_reply_text" as const

export const PUBLIC_FOODOS_WHATSAPP_CONNECTIONS_COLUMNS =
  PUBLIC_FOODOS_WHATSAPP_CONNECTIONS_SELECT.split(", ")

export const AUTHENTICATED_FOODOS_WHATSAPP_CONNECTIONS_COLUMNS = [
  ...PUBLIC_FOODOS_WHATSAPP_CONNECTIONS_COLUMNS,
  "access_token_enc",
]

/**
 * Columnas de `foodos_pos_connections` que solo lee `service_role`.
 *
 * `webhook_secret` autentica los avisos que manda el punto de venta. Lo lee
 * `src/lib/pos/connections.ts` con el cliente de sesión, así que se conserva
 * para `authenticated`.
 */
export const PRIVATE_FOODOS_POS_CONNECTIONS_COLUMNS = ["webhook_secret"] as const

export const PUBLIC_FOODOS_POS_CONNECTIONS_SELECT =
  "id, restaurant_id, provider, status, credentials, external_location_id, last_sync_at, last_error, created_at, updated_at" as const

export const PUBLIC_FOODOS_POS_CONNECTIONS_COLUMNS =
  PUBLIC_FOODOS_POS_CONNECTIONS_SELECT.split(", ")

export const AUTHENTICATED_FOODOS_POS_CONNECTIONS_COLUMNS = [
  ...PUBLIC_FOODOS_POS_CONNECTIONS_COLUMNS,
  "webhook_secret",
]

/**
 * Columnas de `foodos_couriers` que solo lee `service_role`.
 *
 * `access_token` es la credencial del mensajero: con ella se entra a
 * `/reparto/<token>` y se marcan entregas. `src/lib/flotilla/deliveries.ts`
 * **filtra** por ella con el cliente de sesión (para resolver a qué mensajero
 * pertenece un token), así que se conserva para `authenticated`.
 */
export const PRIVATE_FOODOS_COURIERS_COLUMNS = ["access_token"] as const

export const PUBLIC_FOODOS_COURIERS_SELECT =
  "id, restaurant_id, name, phone, vehicle, capacity, shift_start, shift_end, is_active, notes, created_at, updated_at" as const

export const PUBLIC_FOODOS_COURIERS_COLUMNS = PUBLIC_FOODOS_COURIERS_SELECT.split(", ")

export const AUTHENTICATED_FOODOS_COURIERS_COLUMNS = [
  ...PUBLIC_FOODOS_COURIERS_COLUMNS,
  "access_token",
]

/**
 * Columnas de `foodos_deliveries` que solo lee `service_role`.
 *
 * `courier_payout` es lo que le pagamos al mensajero por esa entrega: revela
 * nuestro costo por reparto. El panel de flotilla y `src/lib/foodos-flotilla.ts`
 * lo leen con el cliente de sesión, así que se conserva para `authenticated`.
 */
export const PRIVATE_FOODOS_DELIVERIES_COLUMNS = ["courier_payout"] as const

export const PUBLIC_FOODOS_DELIVERIES_SELECT =
  "id, restaurant_id, order_id, branch_id, zone_id, courier_id, provider, provider_delivery_id, provider_tracking_url, status, pickup_address, dropoff_address, dropoff_lat, dropoff_lng, dropoff_notes, zone_name, fee, distance_km, eta_minutes, assigned_at, picked_up_at, delivered_at, failed_reason, last_lat, last_lng, last_ping_at, created_at, updated_at, proof_pin, proof_photo_path, proof_verified, proof_at, cancel_reason" as const

export const PUBLIC_FOODOS_DELIVERIES_COLUMNS = PUBLIC_FOODOS_DELIVERIES_SELECT.split(", ")

export const AUTHENTICATED_FOODOS_DELIVERIES_COLUMNS = [
  ...PUBLIC_FOODOS_DELIVERIES_COLUMNS,
  "courier_payout",
]

/**
 * Columnas de `foodos_delivery_zones` que solo lee `service_role`.
 *
 * `payout_mode` y `payout_value` son la tarifa que le pagamos al mensajero por
 * zona. El panel de flotilla las lee y las edita con el cliente de sesión, así
 * que se conservan para `authenticated`.
 */
export const PRIVATE_FOODOS_DELIVERY_ZONES_COLUMNS = ["payout_mode", "payout_value"] as const

export const PUBLIC_FOODOS_DELIVERY_ZONES_SELECT =
  "id, restaurant_id, branch_id, name, center_lat, center_lng, radius_km, fee, min_order, eta_minutes, color, sort_order, is_active, created_at, updated_at" as const

export const PUBLIC_FOODOS_DELIVERY_ZONES_COLUMNS =
  PUBLIC_FOODOS_DELIVERY_ZONES_SELECT.split(", ")

export const AUTHENTICATED_FOODOS_DELIVERY_ZONES_COLUMNS = [
  ...PUBLIC_FOODOS_DELIVERY_ZONES_COLUMNS,
  "payout_mode",
  "payout_value",
]

/**
 * Columnas de `foodos_wallet_passes` que solo lee `service_role`.
 *
 * `token` es la credencial de la tarjeta de wallet: con ella se entra a
 * `/r/<slug>/tarjeta/<token>` y se consultan los puntos del comensal.
 * `src/lib/foodos-wallet/passes.ts` la lee con el cliente de sesión, así que se
 * conserva para `authenticated`.
 */
export const PRIVATE_FOODOS_WALLET_PASSES_COLUMNS = ["token"] as const

export const PUBLIC_FOODOS_WALLET_PASSES_SELECT =
  "id, restaurant_id, customer_id, platform, serial, points, points_value, reward_label, reward_threshold, is_active, snapshot_at, pushed_at, push_count, created_at, updated_at" as const

export const PUBLIC_FOODOS_WALLET_PASSES_COLUMNS =
  PUBLIC_FOODOS_WALLET_PASSES_SELECT.split(", ")

export const AUTHENTICATED_FOODOS_WALLET_PASSES_COLUMNS = [
  ...PUBLIC_FOODOS_WALLET_PASSES_COLUMNS,
  "token",
]

/**
 * Columnas de `foodos_order_payments` que solo lee `service_role`.
 *
 * `reviewed_by` es el UUID del usuario que aprobó o rechazó el comprobante: es
 * una columna interna de auditoría. El panel de comprobantes hacía
 * `select("*")` con el cliente de sesión; ahora pide la lista pública (sigue
 * **escribiendo** `reviewed_by`, que es privilegio de `UPDATE`, no de `SELECT`).
 */
export const PRIVATE_FOODOS_ORDER_PAYMENTS_COLUMNS = ["reviewed_by"] as const

export const PUBLIC_FOODOS_ORDER_PAYMENTS_SELECT =
  "id, order_id, restaurant_id, method, amount, proof_path, reference, status, reviewed_at, notes, created_at" as const

export const PUBLIC_FOODOS_ORDER_PAYMENTS_COLUMNS =
  PUBLIC_FOODOS_ORDER_PAYMENTS_SELECT.split(", ")

/**
 * Columnas de `foodos_ai_usage` que solo lee `service_role`.
 *
 * `tokens_used` es el consumo de IA del día. `src/lib/ai/usage.ts` lo lee con
 * el cliente de sesión (`getAiUsage` → `ctx.client`) para pintar el aviso del
 * 80 % del tope, así que se conserva para `authenticated`.
 */
export const PRIVATE_FOODOS_AI_USAGE_COLUMNS = ["tokens_used"] as const

export const PUBLIC_FOODOS_AI_USAGE_SELECT =
  "restaurant_id, day, calls, fallbacks, updated_at" as const

export const PUBLIC_FOODOS_AI_USAGE_COLUMNS = PUBLIC_FOODOS_AI_USAGE_SELECT.split(", ")

export const AUTHENTICATED_FOODOS_AI_USAGE_COLUMNS = [
  ...PUBLIC_FOODOS_AI_USAGE_COLUMNS,
  "tokens_used",
]

/**
 * Columnas de `foodos_ai_messages` que solo lee `service_role`.
 *
 * Mismo caso que `foodos_ai_usage.tokens_used`, y aquí además **ningún** lector
 * de sesión la pide: `listMeseroMessages` selecciona columnas explícitas sin
 * ella y el `insert` del orquestador no pide representación (`return=minimal`),
 * que es lo que permite revocarla de `authenticated` sin tocar el `INSERT`.
 */
export const PRIVATE_FOODOS_AI_MESSAGES_COLUMNS = ["tokens_used"] as const

export const PUBLIC_FOODOS_AI_MESSAGES_SELECT =
  "id, session_id, restaurant_id, direction, content, source, state_before, state_after, created_at" as const

export const PUBLIC_FOODOS_AI_MESSAGES_COLUMNS =
  PUBLIC_FOODOS_AI_MESSAGES_SELECT.split(", ")

/** Una tabla endurecida: qué lee cada rol y qué deja de leerse. */
export interface SensitiveTable {
  table: string
  /** Columnas que conserva `anon`. */
  publicColumns: readonly string[]
  /** Columnas que conserva `authenticated` (incluye las privadas que sí lee). */
  authenticatedColumns: readonly string[]
  /** Columnas revocadas de `anon`. */
  privateColumns: readonly string[]
}

/**
 * El registro completo, en el mismo orden en que lo escribe `00195`.
 *
 * `src/lib/sensitive-columns.contract.test.ts` compara cada lista con el
 * `GRANT SELECT ( … )` de la migración: si divergen, PostgREST falla la
 * consulta entera con `42501` y la pantalla se queda en blanco.
 */
export const SENSITIVE_TABLES: readonly SensitiveTable[] = [
  {
    table: "orders",
    publicColumns: PUBLIC_ORDERS_COLUMNS,
    authenticatedColumns: PUBLIC_ORDERS_COLUMNS,
    privateColumns: PRIVATE_ORDERS_COLUMNS,
  },
  {
    table: "foodos_orders",
    publicColumns: PUBLIC_FOODOS_ORDERS_COLUMNS,
    authenticatedColumns: PUBLIC_FOODOS_ORDERS_COLUMNS,
    privateColumns: PRIVATE_FOODOS_ORDERS_COLUMNS,
  },
  {
    table: "addresses",
    publicColumns: PUBLIC_ADDRESSES_COLUMNS,
    authenticatedColumns: PUBLIC_ADDRESSES_COLUMNS,
    privateColumns: PRIVATE_ADDRESSES_COLUMNS,
  },
  {
    table: "foodos_webhooks",
    publicColumns: PUBLIC_FOODOS_WEBHOOKS_COLUMNS,
    authenticatedColumns: AUTHENTICATED_FOODOS_WEBHOOKS_COLUMNS,
    privateColumns: PRIVATE_FOODOS_WEBHOOKS_COLUMNS,
  },
  {
    table: "foodos_whatsapp_connections",
    publicColumns: PUBLIC_FOODOS_WHATSAPP_CONNECTIONS_COLUMNS,
    authenticatedColumns: AUTHENTICATED_FOODOS_WHATSAPP_CONNECTIONS_COLUMNS,
    privateColumns: PRIVATE_FOODOS_WHATSAPP_CONNECTIONS_COLUMNS,
  },
  {
    table: "foodos_pos_connections",
    publicColumns: PUBLIC_FOODOS_POS_CONNECTIONS_COLUMNS,
    authenticatedColumns: AUTHENTICATED_FOODOS_POS_CONNECTIONS_COLUMNS,
    privateColumns: PRIVATE_FOODOS_POS_CONNECTIONS_COLUMNS,
  },
  {
    table: "foodos_couriers",
    publicColumns: PUBLIC_FOODOS_COURIERS_COLUMNS,
    authenticatedColumns: AUTHENTICATED_FOODOS_COURIERS_COLUMNS,
    privateColumns: PRIVATE_FOODOS_COURIERS_COLUMNS,
  },
  {
    table: "foodos_deliveries",
    publicColumns: PUBLIC_FOODOS_DELIVERIES_COLUMNS,
    authenticatedColumns: AUTHENTICATED_FOODOS_DELIVERIES_COLUMNS,
    privateColumns: PRIVATE_FOODOS_DELIVERIES_COLUMNS,
  },
  {
    table: "foodos_delivery_zones",
    publicColumns: PUBLIC_FOODOS_DELIVERY_ZONES_COLUMNS,
    authenticatedColumns: AUTHENTICATED_FOODOS_DELIVERY_ZONES_COLUMNS,
    privateColumns: PRIVATE_FOODOS_DELIVERY_ZONES_COLUMNS,
  },
  {
    table: "foodos_wallet_passes",
    publicColumns: PUBLIC_FOODOS_WALLET_PASSES_COLUMNS,
    authenticatedColumns: AUTHENTICATED_FOODOS_WALLET_PASSES_COLUMNS,
    privateColumns: PRIVATE_FOODOS_WALLET_PASSES_COLUMNS,
  },
  {
    table: "foodos_order_payments",
    publicColumns: PUBLIC_FOODOS_ORDER_PAYMENTS_COLUMNS,
    authenticatedColumns: PUBLIC_FOODOS_ORDER_PAYMENTS_COLUMNS,
    privateColumns: PRIVATE_FOODOS_ORDER_PAYMENTS_COLUMNS,
  },
  {
    table: "foodos_ai_usage",
    publicColumns: PUBLIC_FOODOS_AI_USAGE_COLUMNS,
    authenticatedColumns: AUTHENTICATED_FOODOS_AI_USAGE_COLUMNS,
    privateColumns: PRIVATE_FOODOS_AI_USAGE_COLUMNS,
  },
  {
    table: "foodos_ai_messages",
    publicColumns: PUBLIC_FOODOS_AI_MESSAGES_COLUMNS,
    authenticatedColumns: PUBLIC_FOODOS_AI_MESSAGES_COLUMNS,
    privateColumns: PRIVATE_FOODOS_AI_MESSAGES_COLUMNS,
  },
]

/**
 * Las 21 columnas privadas, con la tabla delante.
 *
 * Se usa en el contrato y en el informe del `$guard$`; tenerlas en un solo
 * sitio evita que una tabla se quede fuera al añadir la siguiente.
 */
export const PRIVATE_COLUMNS: readonly string[] = SENSITIVE_TABLES.flatMap((t) =>
  t.privateColumns.map((c) => `${t.table}.${c}`)
)
