-- ============================================================
-- 00134: push_subscriptions — Web Push de estado de pedido (W9)
--
-- La campana de /recompensas ya persiste los hitos del pedido
-- (00073 + order-emails.ts), pero solo se ve al abrir la app. Web Push
-- permite avisar "tu pedido va en camino" con la app cerrada, que es el
-- caso real de uso: el cliente pide, guarda el teléfono y se va.
--
-- Una fila = una suscripción de UN navegador (endpoint del Push API).
-- Un mismo usuario puede tener varias (móvil + escritorio); por eso el
-- endpoint es la clave natural, no el usuario.
--
-- El endpoint es único a nivel mundial y el mismo navegador puede cambiar
-- de cuenta (dispositivo compartido), así que el alta la hace
-- /api/push/subscribe con service_role: puede reasignar la propiedad de
-- un endpoint que antes era de otro usuario. RLS solo cubre la lectura y
-- el borrado del propio usuario.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  -- Un endpoint que responde 404/410 está muerto: el emisor lo borra. El
  -- contador queda como diagnóstico de endpoints que fallan de forma
  -- intermitente (5xx) sin llegar a marcarse como muertos.
  failure_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);

-- Un endpoint es único: re-suscribirse desde el mismo navegador hace
-- upsert y no acumula filas fantasma.
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
  ON public.push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- El usuario ve y olvida SUS dispositivos. El alta (INSERT/UPDATE) es
-- exclusiva del service_role: sin policy, la clave anónima no puede
-- reclamar un endpoint ajeno.
DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.push_subscriptions IS
  'Suscripciones Web Push por navegador (W9). El alta y el envío los hace el service_role.';

COMMENT ON COLUMN public.push_subscriptions.endpoint IS
  'Endpoint del Push API (único por navegador). Clave natural del upsert.';

COMMENT ON COLUMN public.push_subscriptions.failure_count IS
  'Fallos intermitentes (5xx) acumulados. 404/410 se borra la fila directamente.';
