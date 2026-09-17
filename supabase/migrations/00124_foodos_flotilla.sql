-- ============================================================
-- 00124 — FoodOS: Flotilla de reparto (nivel Oro)
-- ============================================================
-- Fase 4 del roadmap de paridad con FluxSales.
--
-- Hasta ahora un pedido `delivery` solo tenía una tarifa plana por sucursal
-- (`foodos_branches.delivery_fee`) y nadie sabía quién lo llevaba. Esta
-- migración construye la operación logística completa:
--
--   1. `foodos_couriers`      — la flotilla propia del restaurante.
--   2. `foodos_delivery_zones`— zonas por sucursal con tarifa, mínimo y ETA.
--   3. `foodos_deliveries`    — el trabajo de reparto, uno por pedido.
--   4. `foodos_delivery_events`— bitácora inmutable (quién movió qué y cuándo).
--   5. Dirección estructurada en el pedido (antes solo cabía en `note`).
--
-- DECISIÓN: la tarifa por zona se guarda COPIADA en `foodos_deliveries.fee`.
-- El precio de un pedido ya hecho no puede cambiar porque el restaurantero
-- edite una zona después. Misma razón por la que `foodos_campaigns` copia
-- `variant` y `audience`.
--
-- DECISIÓN: la geolocalización del repartidor (`last_lat`/`last_lng`) es
-- opcional y de mejor esfuerzo. Sin ella el rastreo funciona igual (estados
-- y horas), solo se pierde el pin en el mapa. Así la Flotilla es útil con
-- WhatsApp y un teléfono, sin GPS ni app instalada.
--
-- DECISIÓN: no se guarda ninguna credencial de proveedor externo por
-- restaurante. Uber Direct se resuelve por variables de entorno
-- (`src/lib/flotilla/provider.ts`) y sin ellas la Flotilla opera con
-- repartidores propios. Igual que el SMS de la Fase 3.
--
-- Aditiva e idempotente.
-- ============================================================

-- ============================================================
-- 1. FLOTILLA: repartidores propios del restaurante
-- ============================================================
CREATE TABLE IF NOT EXISTS public.foodos_couriers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT,
  -- Vehículo: determina la velocidad estimada y, con ella, la ETA.
  vehicle       TEXT NOT NULL DEFAULT 'moto'
                CHECK (vehicle IN ('moto', 'bici', 'auto', 'a_pie')),
  -- Cuántos pedidos puede llevar a la vez. Se usa al asignar.
  capacity      INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 10),
  -- Turno declarativo (opcional). Sin turno se asume disponible si está activo.
  shift_start   TIME,
  shift_end     TIME,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foodos_couriers_rest
  ON public.foodos_couriers(restaurant_id)
  WHERE is_active;

-- ============================================================
-- 2. ZONAS de reparto por sucursal
-- ============================================================
CREATE TABLE IF NOT EXISTS public.foodos_delivery_zones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  -- Zona atada a una sucursal. NULL = aplica a todas las del restaurante.
  branch_id     UUID REFERENCES foodos_branches(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- Centro del círculo. Sin coordenadas la zona no se puede emparejar
  -- automáticamente y solo sirve como referencia para el restaurantero.
  center_lat    NUMERIC(10,7),
  center_lng    NUMERIC(10,7),
  -- Radio en km. `matchZone` elige el círculo MÁS PEQUEÑO que contiene el
  -- punto: así una zona "Centro" de 3 km gana sobre una "Valle" de 12 km.
  radius_km     NUMERIC(6,2) CHECK (radius_km IS NULL OR radius_km > 0),
  fee           NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  min_order     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  eta_minutes   INTEGER NOT NULL DEFAULT 35 CHECK (eta_minutes BETWEEN 5 AND 240),
  -- Cómo paga el restaurante al repartidor en esta zona.
  payout_mode   TEXT NOT NULL DEFAULT 'fixed'
                CHECK (payout_mode IN ('fixed', 'per_km', 'percent')),
  payout_value  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (payout_value >= 0),
  color         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foodos_delivery_zones_rest
  ON public.foodos_delivery_zones(restaurant_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_foodos_delivery_zones_branch
  ON public.foodos_delivery_zones(branch_id);

-- ============================================================
-- 3. ENTREGAS: el trabajo de reparto, uno por pedido
-- ============================================================
CREATE TABLE IF NOT EXISTS public.foodos_deliveries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  -- Un pedido tiene como máximo una entrega. `ensureDeliveryForOrder` es
  -- idempotente gracias a este UNIQUE.
  order_id       UUID NOT NULL UNIQUE REFERENCES foodos_orders(id) ON DELETE CASCADE,
  branch_id      UUID REFERENCES foodos_branches(id) ON DELETE SET NULL,
  zone_id        UUID REFERENCES foodos_delivery_zones(id) ON DELETE SET NULL,
  courier_id     UUID REFERENCES foodos_couriers(id) ON DELETE SET NULL,
  -- Quién ejecuta: la flotilla propia o un proveedor externo.
  provider       TEXT NOT NULL DEFAULT 'in_house'
                 CHECK (provider IN ('in_house', 'uber_direct')),
  provider_delivery_id TEXT,
  provider_tracking_url TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'assigned', 'picked_up', 'delivered', 'failed', 'cancelled')),
  pickup_address TEXT,
  dropoff_address TEXT NOT NULL,
  dropoff_lat    NUMERIC(10,7),
  dropoff_lng    NUMERIC(10,7),
  dropoff_notes  TEXT,
  -- Copias congeladas al momento de crear la entrega (ver DECISIÓN arriba).
  zone_name      TEXT,
  fee            NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  courier_payout NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (courier_payout >= 0),
  distance_km    NUMERIC(6,2),
  eta_minutes    INTEGER,
  assigned_at    TIMESTAMPTZ,
  picked_up_at   TIMESTAMPTZ,
  delivered_at   TIMESTAMPTZ,
  failed_reason  TEXT,
  -- Última posición conocida del repartidor (mejor esfuerzo, ver DECISIÓN).
  last_lat       NUMERIC(10,7),
  last_lng       NUMERIC(10,7),
  last_ping_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foodos_deliveries_rest_status
  ON public.foodos_deliveries(restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_foodos_deliveries_courier
  ON public.foodos_deliveries(courier_id)
  WHERE courier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_foodos_deliveries_active
  ON public.foodos_deliveries(restaurant_id, courier_id)
  WHERE status IN ('assigned', 'picked_up');

-- ============================================================
-- 4. BITÁCORA de eventos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.foodos_delivery_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id   UUID NOT NULL REFERENCES public.foodos_deliveries(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  -- Estado en el que quedó la entrega tras el evento.
  status        TEXT NOT NULL,
  note          TEXT,
  -- Quién provocó el cambio: la máquina, el repartidor, el restaurante o
  -- el cliente desde su rastreo.
  actor         TEXT NOT NULL DEFAULT 'system'
                CHECK (actor IN ('system', 'courier', 'restaurant', 'customer', 'provider')),
  lat           NUMERIC(10,7),
  lng           NUMERIC(10,7),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foodos_delivery_events_delivery
  ON public.foodos_delivery_events(delivery_id, created_at);

-- ============================================================
-- 5. TRIGGERS updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_touch_foodos_couriers ON public.foodos_couriers;
CREATE TRIGGER trg_touch_foodos_couriers
  BEFORE UPDATE ON public.foodos_couriers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_foodos_delivery_zones ON public.foodos_delivery_zones;
CREATE TRIGGER trg_touch_foodos_delivery_zones
  BEFORE UPDATE ON public.foodos_delivery_zones
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_foodos_deliveries ON public.foodos_deliveries;
CREATE TRIGGER trg_touch_foodos_deliveries
  BEFORE UPDATE ON public.foodos_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 6. DIRECCIÓN ESTRUCTURADA EN EL PEDIDO
-- ============================================================
-- Hasta ahora la dirección de entrega solo cabía en `note`, en texto libre,
-- así que no se podía geocodificar ni mostrar en el rastreo.
ALTER TABLE public.foodos_orders
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS delivery_notes TEXT;

-- ============================================================
-- 7. RLS
-- ============================================================
-- Patrón idéntico al resto de FoodOS: el dueño del restaurante gestiona lo
-- suyo, el admin gestiona todo, y el repartidor no tiene sesión (opera con
-- un enlace con capability token, igual que el rastreo público de pedidos).
ALTER TABLE public.foodos_couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foodos_delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages couriers" ON public.foodos_couriers;
CREATE POLICY "Owner manages couriers" ON public.foodos_couriers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin manages couriers" ON public.foodos_couriers;
CREATE POLICY "Admin manages couriers" ON public.foodos_couriers
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Owner manages delivery zones" ON public.foodos_delivery_zones;
CREATE POLICY "Owner manages delivery zones" ON public.foodos_delivery_zones
  FOR ALL USING (
    EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin manages delivery zones" ON public.foodos_delivery_zones;
CREATE POLICY "Admin manages delivery zones" ON public.foodos_delivery_zones
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- El dueño LEE y actualiza el estado de sus entregas (asignar, marcar
-- entregada), pero no las inserta a mano: las crea el servicio al confirmar
-- el pedido, para que exista una sola fuente de verdad.
DROP POLICY IF EXISTS "Owner reads deliveries" ON public.foodos_deliveries;
CREATE POLICY "Owner reads deliveries" ON public.foodos_deliveries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Owner updates deliveries" ON public.foodos_deliveries;
CREATE POLICY "Owner updates deliveries" ON public.foodos_deliveries
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin manages deliveries" ON public.foodos_deliveries;
CREATE POLICY "Admin manages deliveries" ON public.foodos_deliveries
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- La bitácora es de solo lectura para el dueño: la escribe el servicio.
DROP POLICY IF EXISTS "Owner reads delivery events" ON public.foodos_delivery_events;
CREATE POLICY "Owner reads delivery events" ON public.foodos_delivery_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM foodos_restaurants r WHERE r.id = restaurant_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin manages delivery events" ON public.foodos_delivery_events;
CREATE POLICY "Admin manages delivery events" ON public.foodos_delivery_events
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.foodos_couriers IS 'Flotilla propia del restaurante (Fase 4, nivel Oro).';
COMMENT ON TABLE public.foodos_delivery_zones IS 'Zonas de reparto con tarifa, mínimo y ETA por sucursal.';
COMMENT ON TABLE public.foodos_deliveries IS 'Un trabajo de reparto por pedido. Tarifa y payout congelados al crearse.';
COMMENT ON TABLE public.foodos_delivery_events IS 'Bitácora inmutable de cambios de estado de una entrega.';
