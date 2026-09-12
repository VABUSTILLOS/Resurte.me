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
