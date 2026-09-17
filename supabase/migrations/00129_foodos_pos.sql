-- ============================================================
-- 00129 — FoodOS: integraciones POS (nivel Diamante)
-- ============================================================
-- Fase 7 del roadmap de paridad con FluxSales.
--
-- El restaurante que ya tiene un punto de venta no quiere capturar su menú dos
-- veces ni atender dos pantallas de pedidos. Esta migración guarda la conexión
-- con cada proveedor y la bitácora de sincronizaciones.
--
--   1. `foodos_pos_connections` — una conexión por restaurante y proveedor.
--   2. `foodos_pos_sync_log`    — bitácora de cada intento (menú, pedido, salud).
--
-- DECISIÓN: las credenciales viven en `credentials JSONB` de la propia fila y
-- las lee solo el dueño (RLS) y el servicio. No hay KMS ni vault en el
-- proyecto, y meter uno solo para esto agregaría una dependencia externa a una
-- capacidad que todavía no tiene adaptador implementado. El panel las muestra
-- enmascaradas. Cuando un adaptador real entre en operación, este es el único
-- lugar que cambia.
--
-- DECISIÓN: no se implementa ningún adaptador de proveedor en esta fase. El
-- registro de proveedores (`src/lib/pos/registry.ts`) los declara con
-- `implemented: false` y el panel lo dice con todas sus letras. La alternativa
-- —fingir que sincroniza— produciría un menú desincronizado en silencio, que
-- es peor que no tener la integración. El camino de entrada sin credenciales
-- sigue siendo la importación CSV de `/panel/foodos/menu`, que ya existía.
--
-- Aditiva e idempotente.
-- ============================================================

-- ============================================================
-- 1. CONEXIONES CON EL PUNTO DE VENTA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.foodos_pos_connections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id        UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  provider             TEXT NOT NULL
                       CHECK (provider IN ('soft_restaurant', 'parrot', 'ncr_aloha', 'toast', 'clip', 'mercado_pago')),
  status               TEXT NOT NULL DEFAULT 'disconnected'
                       CHECK (status IN ('disconnected', 'connected', 'error')),
  -- Campos declarados por el descriptor del proveedor. Los secretos se
  -- enmascaran en la interfaz.
  credentials          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Identificador de la sucursal/ubicación en el sistema del proveedor.
  external_location_id TEXT,
  -- Secreto compartido para verificar los webhooks entrantes del proveedor.
  webhook_secret       TEXT,
  last_sync_at         TIMESTAMPTZ,
  last_error           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT foodos_pos_connections_unique UNIQUE (restaurant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_foodos_pos_connections_rest
  ON public.foodos_pos_connections(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_foodos_pos_connections_webhook
  ON public.foodos_pos_connections(provider)
  WHERE status = 'connected';

-- ============================================================
-- 2. BITÁCORA DE SINCRONIZACIONES
-- ============================================================
-- Cada intento queda registrado, con o sin éxito. Un `failed` repetido es la
-- señal de que las credenciales caducaron, y el panel la muestra.
CREATE TABLE IF NOT EXISTS public.foodos_pos_sync_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('menu', 'order', 'health')),
  status        TEXT NOT NULL CHECK (status IN ('ok', 'failed', 'skipped')),
  items_count   INTEGER NOT NULL DEFAULT 0,
  detail        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foodos_pos_sync_log_rest
  ON public.foodos_pos_sync_log(restaurant_id, created_at DESC);

-- ============================================================
-- 3. TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS trg_touch_foodos_pos_connections ON public.foodos_pos_connections;
CREATE TRIGGER trg_touch_foodos_pos_connections
  BEFORE UPDATE ON public.foodos_pos_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 4. RLS
-- ============================================================
ALTER TABLE public.foodos_pos_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_pos_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages pos connections" ON public.foodos_pos_connections;
CREATE POLICY "Owner manages pos connections" ON public.foodos_pos_connections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin manages pos connections" ON public.foodos_pos_connections;
CREATE POLICY "Admin manages pos connections" ON public.foodos_pos_connections
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- La bitácora la escribe el servicio; el dueño solo la lee.
DROP POLICY IF EXISTS "Owner reads pos sync log" ON public.foodos_pos_sync_log;
CREATE POLICY "Owner reads pos sync log" ON public.foodos_pos_sync_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin manages pos sync log" ON public.foodos_pos_sync_log;
CREATE POLICY "Admin manages pos sync log" ON public.foodos_pos_sync_log
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.foodos_pos_connections IS 'Conexión de FoodOS con el punto de venta del restaurante (Fase 7, nivel Diamante).';
COMMENT ON TABLE public.foodos_pos_sync_log IS 'Bitácora de intentos de sincronización con el punto de venta.';
COMMENT ON COLUMN public.foodos_pos_connections.credentials IS 'Campos declarados por el descriptor del proveedor. Se muestran enmascarados en el panel.';
COMMENT ON COLUMN public.foodos_pos_connections.webhook_secret IS 'Secreto compartido para verificar webhooks entrantes del proveedor.';
