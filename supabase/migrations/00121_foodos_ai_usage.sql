-- ============================================================
-- 00121 — FoodOS: presupuesto de tokens de IA por restaurante/día
-- ============================================================
-- Fase 1 del roadmap de paridad con FluxSales.
--
-- Las capacidades de IA (Mesero IA, Marketing IA, sitio IA) se cobran en
-- tokens contra un tope diario por restaurante. El tope no es una cuota de
-- negocio: es un cortafuegos para que un bucle o un cliente abusivo no
-- queme el presupuesto de la plataforma ni la factura del proveedor.
--
-- Cuando se agota el tope, la capa de IA degrada a plantillas deterministas
-- (`src/lib/ai/llm.ts`) y el producto sigue funcionando.
--
-- El contador se reserva ANTES de llamar al modelo y se ajusta después con
-- el consumo real, para que dos peticiones simultáneas no rebasen el tope.
--
-- Aditiva e idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS foodos_ai_usage (
  restaurant_id UUID NOT NULL REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  -- Día local del restaurante (America/Mexico_City), no UTC: el tope se
  -- agota cuando el restaurantero ve que se agotó.
  day           DATE NOT NULL,
  tokens_used   INTEGER NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  calls         INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
  -- Llamadas que cayeron a plantilla (sin credenciales, tope agotado, error).
  fallbacks     INTEGER NOT NULL DEFAULT 0 CHECK (fallbacks >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, day)
);

-- ============================================================
-- TRIGGER updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_touch_foodos_ai_usage ON public.foodos_ai_usage;
CREATE TRIGGER trg_touch_foodos_ai_usage
  BEFORE UPDATE ON public.foodos_ai_usage
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.foodos_ai_usage ENABLE ROW LEVEL SECURITY;

-- El dueño ve su propio consumo (para entender por qué se agotó).
DROP POLICY IF EXISTS "Owner reads own ai usage" ON public.foodos_ai_usage;
CREATE POLICY "Owner reads own ai usage" ON public.foodos_ai_usage
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

-- Solo admin ajusta o reinicia contadores.
DROP POLICY IF EXISTS "Admin manages ai usage" ON public.foodos_ai_usage;
CREATE POLICY "Admin manages ai usage" ON public.foodos_ai_usage
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- RESERVA ATÓMICA
-- ============================================================
-- Incrementa el contador del día y devuelve si la reserva cupo. El
-- `INSERT ... ON CONFLICT DO UPDATE ... WHERE` hace la comprobación y el
-- incremento en una sola sentencia, así que dos llamadas concurrentes no
-- pueden rebasar `p_cap` (una de las dos no actualiza y devuelve 0 filas).
--
-- La reserva se hace con un ESTIMADO; después `foodos_ai_settle` corrige
-- con el consumo real reportado por el proveedor.
CREATE OR REPLACE FUNCTION public.foodos_ai_reserve(
  p_restaurant_id UUID,
  p_estimate      INTEGER,
  p_cap           INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimate INTEGER := GREATEST(COALESCE(p_estimate, 0), 0);
  v_rows     INTEGER;
BEGIN
  INSERT INTO public.foodos_ai_usage (restaurant_id, day, tokens_used, calls)
  VALUES (p_restaurant_id, (now() AT TIME ZONE 'America/Mexico_City')::date, v_estimate, 1)
  ON CONFLICT (restaurant_id, day) DO UPDATE
    SET tokens_used = public.foodos_ai_usage.tokens_used + v_estimate,
        calls       = public.foodos_ai_usage.calls + 1
    WHERE public.foodos_ai_usage.tokens_used + v_estimate <= p_cap;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- Ajusta el estimado al consumo real y cuenta los fallbacks.
CREATE OR REPLACE FUNCTION public.foodos_ai_settle(
  p_restaurant_id UUID,
  p_delta         INTEGER,
  p_fallback      BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.foodos_ai_usage
     SET tokens_used = GREATEST(tokens_used + COALESCE(p_delta, 0), 0),
         fallbacks   = fallbacks + CASE WHEN p_fallback THEN 1 ELSE 0 END
   WHERE restaurant_id = p_restaurant_id
     AND day = (now() AT TIME ZONE 'America/Mexico_City')::date;
END;
$$;

-- Solo el service role llama a estas funciones; `SECURITY DEFINER` no debe
-- quedar expuesto a los roles de la API.
REVOKE ALL ON FUNCTION public.foodos_ai_reserve(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foodos_ai_settle(UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foodos_ai_reserve(UUID, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.foodos_ai_settle(UUID, INTEGER, BOOLEAN) TO service_role;

-- ============================================================
-- ÍNDICE de apoyo: consumo del día (reporte de admin)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_foodos_ai_usage_day ON public.foodos_ai_usage(day DESC);
