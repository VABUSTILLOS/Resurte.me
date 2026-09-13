-- ============================================================
-- 00082: foodos_order_payments — comprobantes de pago manuales
--
-- Antes, cuando un comensal elegía pagar por transferencia (o el
-- restaurante aceptaba OXXO/efectivo fuera de Stripe), la pantalla de
-- éxito sólo mostraba la CLABE y un texto "manda tu comprobante por
-- WhatsApp": no había forma de subirlo ni de que el restaurante lo
-- revisara dentro del producto. El pedido quedaba en `pending` para
-- siempre y el dinero se conciliaba a mano.
--
-- Este modelo guarda el comprobante en Storage (bucket privado
-- `comprobantes`) y crea una fila por envío con estado de revisión.
-- Al aprobar, el panel marca `foodos_orders.payment_status = 'paid'`
-- (markOrderPaid), con lo que el pedido entra a las ventas del panel:
-- `listOrdersForSync` ya filtra por payment_status = 'paid'.
--
-- Quién escribe qué:
--   * INSERT: sólo service_role. El cliente del micrositio NO es un
--     usuario de Supabase (es un capability URL: UUID del pedido +
--     slug), así que el alta pasa por /api/foodos/orders/[id]/
--     payment-proof, que valida ambos y sube el archivo con la
--     service key. Por eso no hay política de INSERT para anon.
--   * SELECT / UPDATE: el dueño del restaurante, vía su sesión (RLS).
--     Revisar/decidir es una acción del panel, nunca del comensal.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.foodos_order_payments (
  id            BIGSERIAL PRIMARY KEY,
  order_id      UUID NOT NULL REFERENCES foodos_orders(id) ON DELETE CASCADE,
  -- Desnormalizado a propósito: el panel lista "por revisar" filtrando
  -- por restaurante, y la política RLS lo necesita sin join.
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  method        TEXT NOT NULL DEFAULT 'transfer'
                CHECK (method IN ('transfer', 'oxxo', 'efectivo', 'otro')),
  amount        NUMERIC(10,2),   -- lo que el cliente dice haber pagado
  proof_path    TEXT NOT NULL,   -- ruta en el bucket `comprobantes`
  reference     TEXT,            -- folio/autorización de la transferencia
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  notes         TEXT,            -- motivo del rechazo o nota de revisión
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT foodos_order_payments_amount_nonneg
    CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT foodos_order_payments_approved_has_reviewer
    CHECK (status = 'pending' OR reviewed_at IS NOT NULL)
);

-- Cola de revisión del panel: restaurante + pendientes primero.
CREATE INDEX IF NOT EXISTS idx_foodos_order_payments_review
  ON public.foodos_order_payments (restaurant_id, status, created_at DESC);
-- Historial por pedido (tracking del cliente).
CREATE INDEX IF NOT EXISTS idx_foodos_order_payments_order
  ON public.foodos_order_payments (order_id, created_at DESC);
-- Un solo comprobante pendiente por pedido evita que el cliente suba
-- diez veces y sature la cola de revisión.
CREATE UNIQUE INDEX IF NOT EXISTS idx_foodos_order_payments_one_pending
  ON public.foodos_order_payments (order_id)
  WHERE status = 'pending';

ALTER TABLE public.foodos_order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads order payments" ON public.foodos_order_payments;
CREATE POLICY "Owner reads order payments" ON public.foodos_order_payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

-- Sólo se permite pasar de 'pending' a aprobado/rechazado: el
-- WITH CHECK impide que un dueño reescriba un comprobante ya revisado
-- (y el historial de conciliación se mantiene auditable).
DROP POLICY IF EXISTS "Owner reviews order payments" ON public.foodos_order_payments;
CREATE POLICY "Owner reviews order payments" ON public.foodos_order_payments
  FOR UPDATE
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('approved', 'rejected')
    AND EXISTS (
      SELECT 1 FROM foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.foodos_order_payments IS
  'Comprobantes de pago manual (transferencia/OXXO/efectivo) subidos por el comensal del micrositio FoodOS. La aprobación marca foodos_orders.payment_status = paid.';

-- ── Storage: bucket privado `comprobantes` ──────────────────
-- Sin políticas para anon/authenticated: la subida la hace el route
-- handler con la service key (el comensal no tiene sesión) y la
-- lectura en el panel se resuelve con URLs firmadas generadas en el
-- servidor. Así el bucket no es enumerable ni público.
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes', 'comprobantes', false)
ON CONFLICT (id) DO NOTHING;
