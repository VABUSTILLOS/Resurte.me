-- ============================================================
-- 00070: notifications + onboarding de recompensas persistente
--
-- La campana de /recompensas derivaba notificaciones en el cliente y
-- guardaba "leído" en localStorage: se perdía entre dispositivos y no
-- había eventos reales. `notifications` persiste los eventos (pedido,
-- cashback, canje, factura) por usuario; la campana los lee vía
-- /api/notifications y marca leídos server-side.
--
-- `profiles.rewards_onboarded_at` persiste el onboarding de recompensas
-- (hoy solo localStorage "cashback-onboarded").
-- ============================================================

CREATE TABLE public.notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,            -- 'order_confirmation', 'order_status_*', 'cashback', 'redemption', 'invoice_*'
  title       TEXT NOT NULL,
  body        TEXT,
  action_url  TEXT,
  order_id    BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC);
-- Dedupe de eventos de pedido: un solo registro por (pedido, tipo).
CREATE UNIQUE INDEX idx_notifications_order_type
  ON public.notifications (order_id, type) WHERE order_id IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Los usuarios solo leen y marcan como leídas SUS notificaciones.
-- La escritura (INSERT) es exclusiva del service_role (sin policy).
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.notifications IS
  'Notificaciones persistentes por usuario (campana de /recompensas).';

-- Onboarding de recompensas persistente por usuario.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rewards_onboarded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.rewards_onboarded_at IS
  'Cuándo completó el onboarding de /recompensas (sincroniza con localStorage cashback-onboarded).';
