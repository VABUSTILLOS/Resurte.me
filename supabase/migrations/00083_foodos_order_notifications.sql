-- ============================================================
-- 00083: foodos_order_notifications — bitácora y dedupe de avisos
--        al comensal del micrositio FoodOS
--
-- Al cambiar el estado de un pedido (`updateOrderStatus`) o al
-- confirmar su pago (`markOrderPaid`, `approvePaymentProof`) el
-- comensal recibe un WhatsApp y, si dejó correo en el CRM, un email.
--
-- Sin registro, cada clic repetido en el panel reenviaría el mismo
-- aviso: los botones de estado son idempotentes en BD (el UPDATE deja
-- el mismo valor) pero no en el mensajero. Esta tabla da la
-- idempotencia que el UPDATE no puede dar.
--
-- El índice único es PARCIAL (`status <> 'failed'`) a propósito:
--   * `pending`  → alguien ya tomó el envío (claim), nadie más lo toma.
--   * `sent`     → ya se envió, no se repite nunca.
--   * `failed`   → queda como auditoría pero NO bloquea, así un
--                  reintento posterior (otro cambio de estado, el
--                  cron) puede volver a intentarlo.
--
-- Escritura: sólo service_role (sin política de INSERT/UPDATE). Son
-- avisos salientes del sistema, no datos que el dueño capture.
-- Lectura: el dueño del restaurante, por si después se muestra el
-- historial de notificaciones de un pedido en el panel.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.foodos_order_notifications (
  id            BIGSERIAL PRIMARY KEY,
  order_id      UUID NOT NULL REFERENCES foodos_orders(id) ON DELETE CASCADE,
  -- Desnormalizado a propósito: la política RLS lo necesita sin join.
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  -- Evento lógico, no el estado crudo: 'status:preparing',
  -- 'payment:paid', 'payment:proof_rejected', etc.
  event         TEXT NOT NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  recipient     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent', 'failed')),
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedupe por (pedido, evento, canal). Ver nota de arriba sobre 'failed'.
CREATE UNIQUE INDEX IF NOT EXISTS idx_foodos_order_notifications_dedupe
  ON public.foodos_order_notifications (order_id, event, channel)
  WHERE status <> 'failed';

CREATE INDEX IF NOT EXISTS idx_foodos_order_notifications_order
  ON public.foodos_order_notifications (order_id, created_at DESC);

ALTER TABLE public.foodos_order_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads order notifications" ON public.foodos_order_notifications;
CREATE POLICY "Owner reads order notifications" ON public.foodos_order_notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.foodos_order_notifications IS
  'Bitácora e idempotencia de los avisos al comensal FoodOS (WhatsApp/email). Índice único parcial en (order_id, event, channel) WHERE status <> failed.';
