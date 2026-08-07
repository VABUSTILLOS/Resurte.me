# Esquema de productos (fuentes de verdad)

> **Documento de referencia para la tienda.** Explica el drift histórico entre
> el esquema versionado y la base de datos real.

## 🔴 Drift histórico: `products` vs `product_stores`

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
- **`product_stores`** → tabla **legado**. El seed la escribe, pero **nadie la
  lee** en el flujo público. Se conserva para compatibilidad.

## Reglas al tocar este esquema

1. **Nunca** cambiar la fuente de verdad de `products` a `product_stores`: la
   tienda pública y el checkout dependen de `products`.
2. Las migraciones deben ser **idempotentes** (`ADD COLUMN IF NOT EXISTS`,
   `UPDATE` con `WHERE NOT EXISTS` o `COALESCE`) porque se aplican a mano en el
   SQL Editor de Supabase.
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
