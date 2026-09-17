-- ============================================================
-- 00130_foodos_catering.sql — Catering por volumen (Fase 7, nivel Diamante)
-- ============================================================
-- Decisiones:
--
-- 1. Catering NO reutiliza `foodos_menu_items`. Un platillo de carta y un
--    paquete de evento no comparten forma: el paquete se cotiza por persona,
--    tiene mínimo de comensales, anticipación obligatoria y una lista de lo que
--    incluye. Meterlo en el menú con un flag obligaría a que la carta pública,
--    el kiosco y el cotizador filtraran por ese flag en cada consulta, y
--    cualquier olvido publicaría un paquete de 50 personas en el menú del día.
--
-- 2. Una solicitud no es un pedido. No entra a `foodos_orders` hasta que el
--    restaurante la confirma: `foodos_catering_requests` guarda la
--    conversación (solicitado → cotizado → confirmado) y el pedido real se crea
--    después, ya con el total aprobado. Así el cotizador no ensucia los
--    tableros de cocina con eventos de dentro de tres semanas.
--
-- 3. El total cotizado lo fija el servidor. `quoted_total` se escribe desde la
--    capa de servidor a partir del paquete y el número de personas; nunca llega
--    un total desde el navegador.
-- ============================================================

-- ------------------------------------------------------------
-- Paquetes de catering
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.foodos_catering_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.foodos_restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Precio por persona: es la unidad en la que se piensa un evento.
  price_per_person NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price_per_person >= 0),
  min_people INTEGER NOT NULL DEFAULT 10 CHECK (min_people > 0),
  max_people INTEGER CHECK (max_people IS NULL OR max_people >= min_people),
  -- Anticipación mínima en horas. Un evento de mañana no se puede cocinar hoy.
  lead_time_hours INTEGER NOT NULL DEFAULT 48 CHECK (lead_time_hours >= 0),
  includes JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foodos_catering_packages_rest
  ON public.foodos_catering_packages (restaurant_id, sort_order);

DROP TRIGGER IF EXISTS trg_touch_foodos_catering_packages ON public.foodos_catering_packages;
CREATE TRIGGER trg_touch_foodos_catering_packages
  BEFORE UPDATE ON public.foodos_catering_packages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.foodos_catering_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages catering packages" ON public.foodos_catering_packages;
CREATE POLICY "Owner manages catering packages" ON public.foodos_catering_packages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.foodos_restaurants r
      WHERE r.id = foodos_catering_packages.restaurant_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.foodos_restaurants r
      WHERE r.id = foodos_catering_packages.restaurant_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin manages catering packages" ON public.foodos_catering_packages;
CREATE POLICY "Admin manages catering packages" ON public.foodos_catering_packages
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- El comensal sí necesita ver los paquetes activos para poder pedir cotización.
DROP POLICY IF EXISTS "Public reads active catering packages" ON public.foodos_catering_packages;
CREATE POLICY "Public reads active catering packages" ON public.foodos_catering_packages
  FOR SELECT USING (is_active = true);

-- ------------------------------------------------------------
-- Solicitudes de cotización
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.foodos_catering_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.foodos_restaurants(id) ON DELETE CASCADE,
  -- ON DELETE SET NULL: borrar un paquete no puede borrar el historial de
  -- eventos ya cotizados con él.
  package_id UUID REFERENCES public.foodos_catering_packages(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  headcount INTEGER NOT NULL CHECK (headcount > 0),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'quoted', 'confirmed', 'declined', 'completed', 'cancelled')),
  -- Congelado al cotizar: si el paquete sube de precio después, la cotización
  -- que el cliente aceptó no cambia.
  quoted_total NUMERIC(10, 2) CHECK (quoted_total IS NULL OR quoted_total >= 0),
  quoted_at TIMESTAMPTZ,
  deposit_amount NUMERIC(10, 2) CHECK (deposit_amount IS NULL OR deposit_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foodos_catering_requests_rest
  ON public.foodos_catering_requests (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_foodos_catering_requests_event
  ON public.foodos_catering_requests (restaurant_id, event_date);

DROP TRIGGER IF EXISTS trg_touch_foodos_catering_requests ON public.foodos_catering_requests;
CREATE TRIGGER trg_touch_foodos_catering_requests
  BEFORE UPDATE ON public.foodos_catering_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.foodos_catering_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages catering requests" ON public.foodos_catering_requests;
CREATE POLICY "Owner manages catering requests" ON public.foodos_catering_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.foodos_restaurants r
      WHERE r.id = foodos_catering_requests.restaurant_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.foodos_restaurants r
      WHERE r.id = foodos_catering_requests.restaurant_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin manages catering requests" ON public.foodos_catering_requests;
CREATE POLICY "Admin manages catering requests" ON public.foodos_catering_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Sin políticas para el comensal anónimo: la solicitud entra por el servidor
-- con service role, igual que los pedidos de `foodos_orders`. El servidor es
-- quien valida el restaurante, el mínimo de comensales, la anticipación y el
-- precio; una política de INSERT anónima dejaría que cualquiera inventara un
-- headcount y un `quoted_total` desde el navegador.

-- ------------------------------------------------------------
-- Documentación
-- ------------------------------------------------------------
COMMENT ON TABLE public.foodos_catering_packages IS
  'Paquetes de catering por volumen. Precio por persona + mínimo de comensales + anticipación. Separado de foodos_menu_items a propósito.';
COMMENT ON COLUMN public.foodos_catering_packages.price_per_person IS
  'Precio por persona. El total de una cotización siempre lo calcula el servidor a partir de este valor.';
COMMENT ON COLUMN public.foodos_catering_packages.lead_time_hours IS
  'Anticipación mínima en horas. Una solicitud con menos anticipación se rechaza con motivo.';
COMMENT ON TABLE public.foodos_catering_requests IS
  'Solicitudes de cotización de catering. No son pedidos: el pedido real se crea cuando el restaurante confirma.';
COMMENT ON COLUMN public.foodos_catering_requests.quoted_total IS
  'Total cotizado, congelado al momento de cotizar. No lo fija el navegador.';
