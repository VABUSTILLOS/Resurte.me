# Esquema de productos (fuentes de verdad)

> **Documento de referencia para la tienda.** Explica el drift histórico entre
> el esquema versionado y la base de datos real.

## ✅ Drift reconciliado (migración 00071)

El drift histórico descrito abajo ya está **completamente versionado**: cada
cambio hecho a mano en producción tiene migración (00028, 00031, 00032, 00033,
00052, 00053), las migraciones con guardas faltantes se endurecieron, y
`00071_reconcile_prod_drift.sql` re-afirma de forma idempotente los DEFAULTs,
NOT NULLs, CHECKs, índices, RLS y policies que pudieron quedar incompletos en
prod. Reproducir `00001–00071` desde cero deja el esquema tal como está
documentado aquí.

Los scripts ad-hoc de `supabase/manual/` fueron **eliminados** por estar
cubiertos por las migraciones versionadas (detalle en
`supabase/manual/README.md`).

**Reglas vigentes (desde la reconciliación):**

1. Todo cambio de esquema se hace con `npx supabase migration new <nombre>`,
   se commitea y se aplica con `npx supabase db push`. **Prohibido** editar la
   BD a mano en el SQL Editor del dashboard.
2. Las migraciones deben ser **idempotentes** (`IF NOT EXISTS`,
   `DROP ... IF EXISTS`, `CREATE OR REPLACE`, `DO $$ ... $$` con guardas).
3. Ante la duda sobre el estado real de prod, hacer un pull **de solo lectura**
   (`npx supabase db pull`) y comparar contra `supabase/migrations/` — nunca
   `db reset --linked` ni escrituras directas.

## ✅ `orders.coupon_code` (migración 00114) — resuelto

Segundo drift encontrado después de 00071: **`orders.coupon_code` se usaba en
el código pero nunca se versionó.** `00049` la añadió a `leads` y `00080` a
`foodos_restaurants`; `orders` se quedó sin ella.

**Estado: `00114_orders_coupon_code.sql` está aplicada a producción
(verificado 16-sep-2026 con sonda REST → `200`).**

Consumidores que la escriben o leen:

| Superficie | Uso |
| --- | --- |
| `POST /api/orders` | la escribe al crear el pedido con cupón |
| `GET /admin/pedidos` | la muestra en el panel |
| `/admin/pedidos/[id]/print` | la imprime en el ticket |
| `PATCH /api/orders/[id]/status` | libera la reserva al cancelar |
| `releaseCouponForPaymentIntent` (webhook Stripe) | libera la reserva si el cobro falla |

Consecuencia del drift: `42703 undefined_column`. En el panel de admin **toda
la consulta** fallaba (de ahí "Error al cargar los pedidos"), el checkout con
cupón devolvía 500 y `PATCH /api/orders/[id]/status` respondía 404 en *cualquier*
actualización, porque el error de lectura se confundía con "el pedido no existe".

`00114_orders_coupon_code.sql` la versiona como `TEXT` (referencia lógica a
`coupons.code`, **sin FK**: el histórico del descuento debe sobrevivir al
borrado del cupón). Es aditiva e idempotente, sin backfill.

**Si la migración falta en un entorno nuevo**, el código no se cae:
`src/lib/admin/order-selects.ts` centraliza los SELECT de `orders` y expone
`missingOptionalOrderColumn()`, que detecta el `42703` de una columna opcional
(`coupon_code`, `driver_id`) y reintenta la consulta sin ella. El cupón
simplemente no aparece en el panel ni en el ticket, y el checkout no audita el
descuento.

## ⚠️ `orders.user_id` es nullable (migración 00009) — trampa de render

`00001_initial_schema.sql` declara `user_id UUID NOT NULL REFERENCES
profiles(id)`, pero **`00009_nullable_order_user.sql` hace
`ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL`** para soportar
checkout de invitado. `POST /api/orders` inserta `user_id: userId` donde
`userId = user?.id ?? null`, así que un pedido de invitado **no tiene perfil**.

Consecuencias que no son obvias:

- El embed `profiles` (con hint `orders_user_id_fkey`) llega `null`, y
  `customer_name` también. Cualquier `order.user_id.slice(...)` sin guarda es un
  `null.slice()` que, dentro del `.map` de la tabla, tumba la sección entera de
  `/admin/pedidos` con el error boundary. El nombre visible se resuelve siempre
  con `orderCustomerLabel()` (`src/lib/admin/order-selects.ts`), que cae a
  `"Invitado"`.
- La política RLS de `orders` es `auth.uid() = user_id`. Para un pedido de
  invitado eso evalúa a `NULL`, que **no** es verdadero: la fila es invisible
  desde una sonda con anon key. Los pedidos de invitado solo se ven con
  `service_role`, es decir, únicamente en el panel admin. Una sonda
  `orders?user_id=is.null` que devuelve `[]` **no** prueba que no existan.
- `00071_reconcile_prod_drift.sql` reafirma defaults y `NOT NULL` de otras
  columnas derivadas, pero **nunca toca `user_id`**: la nulabilidad es
  intencional y debe conservarse.

## 🔴 Drift histórico (ya versionado): `products` vs `product_stores`

Las migraciones originales (00001–00027) definían precio/stock **por tienda** en
`product_stores` (`store_id`, `price`, `sale_price`, `is_available`,
`stock_status`). Sin embargo, todo el código de la tienda pública y del admin
consulta esas columnas **directamente en `products`**:

| Archivo | Lectura |
|---|---|
| `src/lib/catalog-cache.ts` | `products` `.eq("is_visible", true)` `.select("*")` |
| `src/lib/catalog.ts` | `products` `.select("name, price, unit")` |
| `src/app/api/orders/route.ts` | `products` `price/sale_price/stock_status` |
| `src/app/admin/visibilidad` | toggle `products.is_visible` |
| `src/app/admin/productos` | `products` `price/stock_status/...` |

**Ninguna migración del repo añadía esas columnas a `products`.** La BD remota
de producción fue alterada manualmente (fuera del versionado) para incluirlas.
Por eso el repositorio no podía reproducir el esquema desde cero.

### La migración `00028` versiona la realidad

`00028_products_store_columns.sql` añade a `products` (idempotente):

- `price DECIMAL(10,2)`
- `sale_price DECIMAL(10,2)`
- `is_visible BOOLEAN DEFAULT true`
- `stock_status stock_status DEFAULT 'in_stock'`

y hace **backfill desde `product_stores`** de la tienda activa para no perder
los datos ya existentes.

## Fuente de verdad actual (de facto)

- **`products.price` / `products.sale_price` / `products.stock_status` /
  `products.is_visible`** → fuente de verdad para la tienda pública y checkout.
- **`product_stores`** → tabla **legado**. Nadie la lee en el flujo público y
  el seed **ya no la escribe** (escribe directo en `products`). Se conserva en
  el esquema por compatibilidad y porque `00028` la usa como fuente de
  backfill histórico.

## Reglas al tocar este esquema

1. **Nunca** cambiar la fuente de verdad de `products` a `product_stores`: la
   tienda pública y el checkout dependen de `products`.
2. Las migraciones deben ser **idempotentes** (`ADD COLUMN IF NOT EXISTS`,
   `UPDATE` con `WHERE NOT EXISTS` o `COALESCE`) y aplicarse con el CLI
   (`npx supabase db push`), nunca a mano en el SQL Editor.
3. El catálogo usa `unstable_cache` (TTL 300–3600s): los cambios de precio/
   stock tardan hasta 5 minutos en reflejarse en la tienda.
4. `stock_status` es un ENUM `in_stock | low_stock | out_of_stock`. No hay
   inventario numérico.

## Flujo de cashback (Créditos Resurte)

> Regla de negocio: **todas** las compras generan cashback a la tasa del nivel
> actual. El mínimo de **$2,500 MXN semanales** no genera puntos por sí solo:
> sirve para **subir de nivel** y ganar mayor porcentaje.

### Niveles (semanas calificadas del mes, `America/Mexico_City`)

Una semana ISO del mes **califica** si el gasto acumulado en compras **pagadas**
de esa semana es ≥ $2,500 MXN. El nivel se calcula sobre el total de semanas
calificadas en el mes:

| Semanas calificadas | Nivel | Cashback |
|---|---|---|
| 0–1 | Verde | 5% |
| 2 | Plata | 10% |
| 3 | Oro | 15% |
| 4+ | Diamante | 20% |

### Cuándo se abona

**El cashback se abona SOLO cuando el pago se confirma** (`payment_status = 'paid'`):

- **Tarjeta (Stripe):** el webhook `payment_intent.succeeded` marca `paid` →
  el trigger `trg_credit_cashback_on_payment` abona la wallet.
- **COD / SPEI / OXXO / Mercado Pago:** el admin confirma el pago manualmente
  (`PATCH /api/orders/[id]/status` con `payment_status: "paid"`).

Al crear la orden (`BEFORE INSERT`, `trg_cashback_on_order`) **solo** se guarda
la metadata estimada (`week_of_month`, `month_year`, `cashback_credits`,
`cashback_tier`) para mostrarla en la confirmación del pedido. El valor REAL
(con nivel final) se fija en el momento del abono.

### Guardas de integridad

- **Anti-doble-abono:** `credit_cashback_on_payment()` no abona si ya existe
  una transacción positiva de cashback para esa orden.
- **Anti-abuso de nivel:** las semanas calificadas solo cuentan órdenes con
  `payment_status = 'paid' AND status <> 'cancelled'` → crear órdenes sin pagar
  NO sube el nivel.
- **Reversión:** al cancelar o fallar el pago, `trg_reverse_cashback` revierte
  los créditos (solo si el cashback fue realmente abonado).

### Caducidad de los créditos (migraciones `00132` y `00133`)

Un crédito abonado caduca **12 meses** después de ganarse. El consumo es
**FIFO**: un canje agota primero el lote que antes vence, así que un usuario que
sigue comprando no pierde nada.

`wallets.balance_credits` es un saldo **agregado** — no hay saldo por lote — así
que el reparto se reconstruye desde `wallet_transactions`.

| Objeto | Migración | Para qué |
| --- | --- | --- |
| `wallet_transactions.expires_at` | `00132` | Fecha de caducidad del abono. La fija el trigger `trg_wallet_credit_expiry` (`BEFORE INSERT`, solo si `amount > 0` y no viene explícita). Un `DEFAULT` de columna **no** sirve: también fecharía los débitos. |
| `wallet_transactions.expiry_settled_at` | `00132` | Marca del lote ya liquidado. Da **idempotencia**: un lote vencido sin restante no genera movimiento pero tampoco se revisa cada día. |
| `idx_wallet_tx_expiry_pending` | `00132` | Índice parcial de los lotes por vencer (`amount > 0 AND expires_at IS NOT NULL AND expiry_settled_at IS NULL`). |
| `notifications.dedupe_key` + `idx_notifications_dedupe` | `00132` | Índice único parcial `(user_id, type, dedupe_key) WHERE dedupe_key IS NOT NULL`. Los avisos que no cuelgan de un pedido no pueden usar `idx_notifications_order_type`. |
| `wallet_credit_lots(p_wallet_id)` | `00133` | Lotes con su restante tras repartir los débitos en FIFO. `p_wallet_id NULL` = todos los monederos. `SECURITY INVOKER`. |
| `expire_wallet_credits(p_now)` | `00133` | Avisa a 30 días y da de baja lo vencido. `SECURITY DEFINER`, `search_path = ''`, `EXECUTE` revocado a `PUBLIC`/`anon`/`authenticated` y concedido solo a `service_role`. Rejugar un corte con `p_now` es idempotente. |
| job `expire-wallet-credits` | `00133` | `pg_cron` diario a las `37 5 * * *` UTC (23:37 CDMX). |

Dos detalles que no son obvios:

- **El backfill no confisca.** A los lotes anteriores al despliegue se les da
  `GREATEST(created_at + 12 months, now() + 12 months)`: la ventana completa
  empieza a contar desde el despliegue, no hacia atrás.
- **La baja toma `FOR UPDATE` sobre `wallets`**, el mismo punto de serialización
  que `credit_cashback_on_payment()` (`00036`) y `redeem_service` (`00035`). Se
  acota con `LEAST(restante_vencido, balance)` porque `balance_credits` tiene
  `CHECK (>= 0)`, y se registra **un solo** débito por monedero con
  `concept = 'Caducidad de créditos'` (no uno por lote).

La aritmética vive en el SQL. `src/lib/wallet-expiry.ts` la replica **solo para
mostrarla** en `/recompensas`; si divergen, manda el SQL.

## Panel admin y control de acceso

### Cómo se valida al admin (código)

`src/lib/admin-auth.ts` expone `requireAdmin()`, usado por:

| Ruta / acción | Protección |
|---|---|
| `PATCH /api/orders/[id]/status` | Solo admin (confirmar pago dispara cashback) |
| `PATCH /api/admin/products/update` | Solo admin |
| `PATCH /api/admin/products/toggle-visibility` | Solo admin |
| `POST /api/payments/stripe/create-intent` | Sesión autenticada (no anónimo) |
| `src/app/admin/actions.ts` (`getAdminOrders`, `getActiveStoresCount`) | Solo admin |
| `/admin` (dashboard y pedidos) | Los datos salen de server actions protegidas |

Fuentes de verdad (en orden): variable de entorno `ADMIN_EMAILS` (lista de
emails separada por coma) → tabla `admin_users` (opcional, requiere migración
`00030_admin_users.sql`). Si `ADMIN_EMAILS` está vacía se consulta la tabla.

> ⚠️ Sin `ADMIN_EMAILS` (o fila en `admin_users`) ningún usuario es admin: las
> rutas devuelven 401/403 y el panel no carga datos. Definirla en Vercel y en
> `.env.local`.

## Tablas de FoodOS (paridad FluxSales, fases 0–9)

Tablas que el programa de paridad con FluxSales añadió o de las que depende.
`foodos_restaurants`, `foodos_menu_*`, `foodos_orders`, `foodos_customers`,
`foodos_automations`, `foodos_branches` y `foodos_campaigns` vienen de
`00023_foodos.sql`; el resto son de las migraciones de cada fase. Detalle
funcional, invariantes y decisiones en `docs/foodos-paridad-fluxsales.md`.

| Tabla | Migración | Para qué |
| --- | --- | --- |
| `foodos_entitlement_overrides` | `00120` | Override manual del nivel (Plata/Oro/Diamante) por restaurante. El nivel normal se **computa en vivo**, no se persiste. |
| `foodos_ai_usage` | `00121` | Contador diario de tokens por restaurante/capacidad. Lo escribe la capa de IA; el tope se aplica en `src/lib/ai/budget.ts` y el dueño lo ve con `src/lib/ai/usage.ts` (tarjeta del tablero). |
| `foodos_ai_sessions` | `00122` | Sesiones del Mesero IA (una conversación de WhatsApp por cliente). |
| `foodos_deliveries` / `foodos_delivery_events` | `00124` | Flotilla: entregas, asignación a repartidor y bitácora de estados. `provider_delivery_id` enlaza con el reparto externo. |
| `foodos_wallet_passes` | `00126` | Tarjeta de lealtad (Apple/Google Wallet) por cliente. |
| `foodos_seo_pages` | `00128` | Sitio IA: páginas generadas. Nacen en `draft` y el dueño las aprueba (`approved_at`). |
| `foodos_pos_connections` / `foodos_pos_sync_log` | `00129` | Integraciones de punto de venta y su bitácora de sincronización (`kind`, `status`). |
| `foodos_catering_packages` / `foodos_catering_requests` | `00130` | Catering por volumen: paquetes y solicitudes. El total lo decide el servidor. |
| `whatsapp_automation_sends` | `00097` | Bitácora de las automatizaciones de WhatsApp de la plataforma. Tiene `UNIQUE (dedupe_key)`; es la mitad "plataforma" del dedupe cruzado. |
| `leads` (`restaurant_name`, `qualification`) | `00131` | Landing B2B `/restaurantes`: amplía el `CHECK` de `source` y guarda el diagnóstico. |
| `error_logs` | `00054` | Bitácora de errores de cliente y servidor. La ingesta de servidor es `reportServerError()` (`src/lib/error-log.ts`); la lectura admin, `getErrorLogs()` (`src/lib/admin-errors.ts`). |
