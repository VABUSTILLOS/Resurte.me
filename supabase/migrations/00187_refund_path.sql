-- ============================================================
-- 00187 — el camino de reembolso: `partially_refunded` + monto reembolsado.
--
-- Hasta aquí la app sabía **recibir** reembolsos (webhook
-- `charge.refunded` → `handleChargeRefunded`) pero no **iniciarlos**: no
-- existía una sola llamada a `refunds.create` en el repositorio. Un admin
-- que necesitaba devolverle el dinero a un cliente sólo podía abrir el
-- Dashboard de Stripe — y al hacerlo desde ahí, en un *destination charge*,
-- Stripe le devuelve el dinero al cliente con fondos de **la plataforma**
-- mientras el restaurante conserva lo que ya se le liquidó. La plataforma
-- pagaba el reembolso de su bolsillo.
--
-- Este archivo sólo cubre la parte de base. El resto vive en
-- `src/lib/stripe-connect.ts` (`buildRefundParams`), en
-- `POST /api/admin/orders/[id]/refund` y en `handleChargeRefunded`.
--
-- ── 1. Por qué un valor nuevo del enum y no reutilizar `refunded` ──
--
-- `refunded` significa, en todo el esquema, "este cobro ya no existe". No es
-- un adjetivo decorativo: el trigger `reverse_cashback_on_cancel()` (00135)
-- lo lee como **reversión total** y devuelve el cashback completo al
-- monedero; `reversible_payment_confirmation` (00146) lo trata como estado
-- de reversión; `TERMINAL_STATUSES` lo excluye de la reconciliación.
--
-- Marcar como `refunded` un reembolso de $50 sobre un pedido de $800 no era
-- sólo impreciso: **destruía el cashback de una compra que el cliente sí
-- pagó casi entera**. Con `partially_refunded` el trigger de 00135 no se
-- dispara y el cashback se conserva, que es lo correcto.
--
-- Nota de implementación: `ALTER TYPE … ADD VALUE` no puede convivir en la
-- misma transacción con un uso del valor nuevo, así que este archivo no lo
-- usa en ningún CHECK ni en ningún DEFAULT.
--
-- ── 2. `refunded_amount_cents` ──
--
-- El enum dice *que* hubo reembolso parcial; sin el monto no dice *cuánto*.
-- El webhook recibe `charge.amount_refunded` (acumulado, en centavos) y lo
-- ignoraba por completo. Guardarlo permite que el panel muestre la cifra,
-- que la conciliación de dispersiones (`foodos_payout_balances()`, 00157) se
-- pueda ajustar y que un reembolso llegado por partes sea auditable.
--
-- En `orders` es INTEGER y admite NULL porque la tabla ya existía con filas
-- sin el dato; `0` como DEFAULT haría indistinguible "nunca se reembolsó" de
-- "no lo sabemos". En `foodos_orders` es NOT NULL DEFAULT 0 por coherencia
-- con `application_fee_amount` (00085), que sí nació con default.
--
-- `stripe_refund_id` guarda el último reembolso aplicado: sirve de clave de
-- idempotencia para el webhook, que puede reentregarse.
--
-- ── 3. Privilegios ──
--
-- Ninguna de las columnas nuevas se concede a `authenticated`. No hace falta
-- tocarlo: `00162` dejó una **lista blanca** (`status`, `payment_status`,
-- `table_number`, `table_ticket_id`) y todo lo demás quedó revocado, así que
-- las columnas de abajo nacen no-escribibles por el dueño. Se escriben sólo
-- con service role (`/api/admin/orders/[id]/refund` y
-- `stripe-webhook-handlers.ts`), igual que `connected_account_id`.
-- ============================================================

-- ── 1. Enum ─────────────────────────────────────────────────
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'partially_refunded';

-- ── 2. Columnas de reembolso ────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refunded_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT;

ALTER TABLE public.foodos_orders
  ADD COLUMN IF NOT EXISTS refunded_amount_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_refunded_amount_cents_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_refunded_amount_cents_check
      CHECK (refunded_amount_cents IS NULL OR refunded_amount_cents >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'foodos_orders_refunded_amount_cents_check'
  ) THEN
    ALTER TABLE public.foodos_orders
      ADD CONSTRAINT foodos_orders_refunded_amount_cents_check
      CHECK (refunded_amount_cents >= 0);
  END IF;
END
$constraints$;

COMMENT ON COLUMN public.orders.refunded_amount_cents IS
  'Centavos reembolsados acumulados (charge.amount_refunded). NULL = nunca se registró. payment_status pasa a partially_refunded o refunded según el total.';
COMMENT ON COLUMN public.orders.stripe_refund_id IS
  'Último reembolso aplicado. Clave de idempotencia del webhook charge.refunded.';
COMMENT ON COLUMN public.foodos_orders.refunded_amount_cents IS
  'Centavos reembolsados acumulados. 0 = sin reembolso. Sólo lo escribe service role.';
COMMENT ON COLUMN public.foodos_orders.stripe_refund_id IS
  'Último reembolso aplicado. Clave de idempotencia del webhook charge.refunded.';

-- ── 3. Índice de conciliación ───────────────────────────────
-- El panel admin lista pedidos con reembolso para cuadrar caja; el índice
-- parcial evita escanear `orders` completa (la mayoría no tiene reembolso).
CREATE INDEX IF NOT EXISTS idx_orders_refunded
  ON public.orders (created_at DESC)
  WHERE refunded_amount_cents IS NOT NULL AND refunded_amount_cents > 0;
