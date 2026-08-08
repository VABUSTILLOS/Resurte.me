-- ============================================================
-- 00047_order_upsells.sql
--
-- Pagos 1-click post-compra (upsells/downsells) asociados a la orden base.
--
-- REGLA CRÍTICA de compatibilidad: orders.total se congela en el total base
-- (ya validado por el webhook para el cargo principal y por el trigger de
-- cashback). El upsell NO muta orders.total/payment_status; su monto vive
-- aquí (order_upsells.amount) y sus items en order_items con
-- item_type='upsell'. El resumen consolidado = orders.total + upsells pagados.
--
-- Cada PaymentIntent de Stripe tiene su propio id (stripe_payment_intent_id),
-- por lo que el webhook puede distinguir un cargo de upsell de uno base.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_upsells (
  id                      BIGSERIAL PRIMARY KEY,
  order_id                BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id              BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity                INTEGER NOT NULL DEFAULT 1,
  unit_price              DECIMAL(10,2) NOT NULL,
  stripe_payment_intent_id TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending',
  amount                  DECIMAL(10,2) NOT NULL,
  idempotency_key         TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at                 TIMESTAMPTZ,
  CONSTRAINT order_upsells_status_check
    CHECK (status IN ('pending', 'requires_action', 'paid', 'failed', 'declined', 'canceled'))
);

COMMENT ON TABLE public.order_upsells IS
  'Cargos 1-click post-pago (upsell/downsell) ligados a la orden base. Nunca muta orders.total.';

CREATE INDEX IF NOT EXISTS idx_order_upsells_order
  ON public.order_upsells (order_id);

CREATE INDEX IF NOT EXISTS idx_order_upsells_pi
  ON public.order_upsells (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_upsells_idempotency
  ON public.order_upsells (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
