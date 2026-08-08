-- ============================================================
-- 00048_stripe_payment_method.sql
--
-- Persistencia del método de pago de Stripe + email del cliente en orders,
-- necesarios para cobros off-session (1-click upsells) posteriores.
--
-- Se alimentan desde el webhook (payment_intent.succeeded ya trae
-- payment_method, customer) y desde el email capturado en el drawer.
-- Retrocompatible: columnas nuevas, no afectan lecturas existentes.
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT;

COMMENT ON COLUMN public.orders.stripe_customer_id IS
  'ID del Stripe Customer asociado al pago base (para reutilizar el método de pago off-session).';
COMMENT ON COLUMN public.orders.stripe_payment_method_id IS
  'Método de pago de Stripe usado en el cargo base (requerido para 1-click upsells off-session).';
COMMENT ON COLUMN public.orders.customer_email IS
  'Email del cliente capturado en el checkout (lead + notificaciones).';

CREATE INDEX IF NOT EXISTS idx_orders_stripe_pm
  ON public.orders (stripe_payment_method_id)
  WHERE stripe_payment_method_id IS NOT NULL;
