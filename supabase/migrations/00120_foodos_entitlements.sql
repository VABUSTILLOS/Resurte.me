-- ============================================================
-- 00120 — FoodOS: overrides de nivel (entitlements)
-- ============================================================
-- Fase 0 del roadmap de paridad con FluxSales.
--
-- El nivel de un restaurante se gana comprando en el marketplace
-- (migración 00029: semanas calificadas del mes, $2,500 cada una). Esta
-- tabla es SOLO la excepción: cuando soporte o alianzas quieren abrir una
-- capacidad premium antes de que el restaurantero califique, o cerrarla.
--
-- El cálculo del nivel NO vive aquí; vive en `src/lib/wallet-progress.ts`
-- y `src/lib/foodos-tier.ts`. Esta tabla únicamente permite sobreescribir
-- el nivel efectivo, con motivo, autor y caducidad opcional.
--
-- Aditiva e idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS foodos_entitlement_overrides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL UNIQUE REFERENCES foodos_restaurants(id) ON DELETE CASCADE,
  -- Nivel que se concede. `Verde` equivale a "sin privilegios extra".
  tier          TEXT NOT NULL CHECK (tier IN ('Verde', 'Plata', 'Oro', 'Diamante')),
  -- Por qué se concedió (auditoría legible por humanos).
  reason        TEXT,
  -- Quién lo concedió (admin). Se conserva el registro aunque el usuario se borre.
  granted_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Vigencia opcional: al pasar la fecha el override deja de aplicar.
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TRIGGER updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_touch_foodos_entitlement_overrides ON public.foodos_entitlement_overrides;
CREATE TRIGGER trg_touch_foodos_entitlement_overrides
  BEFORE UPDATE ON public.foodos_entitlement_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.foodos_entitlement_overrides ENABLE ROW LEVEL SECURITY;

-- El dueño del restaurante puede LEER su propio override (el panel debe
-- mostrar el nivel real, no el ganado por compras).
DROP POLICY IF EXISTS "Owner reads own entitlement override" ON public.foodos_entitlement_overrides;
CREATE POLICY "Owner reads own entitlement override" ON public.foodos_entitlement_overrides
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

-- Solo admin escribe overrides (conceder, cambiar o revocar).
DROP POLICY IF EXISTS "Admin manages entitlement overrides" ON public.foodos_entitlement_overrides;
CREATE POLICY "Admin manages entitlement overrides" ON public.foodos_entitlement_overrides
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- ÍNDICE de apoyo: vigencias por revisar (jobs de limpieza/reporte)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_foodos_entitlement_overrides_expires
  ON public.foodos_entitlement_overrides(expires_at)
  WHERE expires_at IS NOT NULL;
