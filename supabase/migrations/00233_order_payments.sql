-- ============================================================
-- Pagos por pedido y link de pago de Stripe (Ola 4).
--
-- order_payments: libro de pagos de UN pedido. Cada fila es un
-- abono registrado: un pago con link de Stripe (lo escribe el
-- webhook al acreditarse, origen 'stripe_link') o un pago que el
-- staff registra a mano en el panel (SPEI confirmado, efectivo,
-- etc., origen 'manual'). El saldo del pedido es derivado:
-- total − Σ filas con status 'recorded'. `orders.payment_status`
-- sigue siendo el estado oficial: solo pasa a 'paid' cuando el
-- libro cubre el total (o por las vías previas, que el libro
-- refleja registrando el saldo restante al confirmar a mano).
--
-- La fila de Stripe lleva su PaymentIntent con índice único
-- parcial: el webhook puede re-entregar el evento y el pago se
-- registra UNA vez. `status 'voided'` anula un registro erróneo
-- sin borrar el historial; las filas anuladas no suman.
--
-- Columnas payment_link_* en orders: el último link de pago de
-- Stripe generado para el pedido (Checkout Session hospedada).
-- Se reutiliza mientras no caduque y sea por el saldo vigente;
-- si el saldo cambia, se genera otro. Son best-effort: el código
-- las lee y escribe tolerando su ausencia (42703).
--
-- Sin políticas: solo service role (webhook, rutas de servidor
-- y panel). El código degrada si esta migración aún no se
-- aplica (42P01 en la tabla, 42703 en las columnas).
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_payments (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                   BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount                     NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  method                     TEXT NOT NULL CHECK (method IN (
                               'card', 'spei', 'oxxo', 'cash_on_delivery',
                               'mercado_pago', 'codi', 'stripe'
                             )),
  origin                     TEXT NOT NULL CHECK (origin IN ('stripe_link', 'manual')),
  status                     TEXT NOT NULL DEFAULT 'recorded'
                             CHECK (status IN ('recorded', 'voided')),
  stripe_payment_intent_id   TEXT,
  stripe_checkout_session_id TEXT,
  note                       TEXT,
  created_by                 UUID,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotencia del webhook: un PaymentIntent se registra una sola vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payments_stripe_pi_unique
  ON order_payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_payments_order
  ON order_payments (order_id, created_at);

ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo service role.

COMMENT ON TABLE order_payments IS
  'Libro de pagos por pedido (Ola 4, 00233): abonos con link de Stripe y registros manuales del panel. Acceso solo con service_role (src/lib/order-payments.ts).';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_link_session_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_link_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_link_amount NUMERIC(12, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_link_created_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.payment_link_session_id IS
  'Última Checkout Session de Stripe generada como link de pago del pedido (00233). Best-effort: el código tolera su ausencia.';
COMMENT ON COLUMN orders.payment_link_url IS
  'URL hospedada por Stripe del último link de pago generado (00233). Caduca con la sesión (~24 h).';
COMMENT ON COLUMN orders.payment_link_amount IS
  'Monto por el que se generó el último link de pago (00233). Si el saldo cambia, el link ya no se reutiliza.';
COMMENT ON COLUMN orders.payment_link_created_at IS
  'Cuándo se generó el último link de pago (00233). Junto con el monto decide si el link se reutiliza.';
