-- ============================================================
-- FoodOS Fase B (paridad take.app):
-- 1. Horarios de operación por sucursal
-- 2. Realtime de pedidos para la comanda del restaurante
-- Idempotente.
-- ============================================================

-- 1. HORARIOS POR SUCURSAL ------------------------------------
-- Una fila por día de la semana (0=domingo … 6=sábado).
CREATE TABLE IF NOT EXISTS foodos_branch_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID NOT NULL REFERENCES foodos_branches(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   TIME,
  close_time  TIME,
  is_closed   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, day_of_week)
);

-- Zona horaria del restaurante (para evaluar horarios)
ALTER TABLE foodos_restaurants
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Mexico_City';

-- Índice
CREATE INDEX IF NOT EXISTS idx_foodos_branch_hours_branch ON foodos_branch_hours(branch_id);

-- RLS
ALTER TABLE foodos_branch_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages branch hours" ON foodos_branch_hours;
CREATE POLICY "Owner manages branch hours" ON foodos_branch_hours
  FOR ALL USING (EXISTS (
    SELECT 1 FROM foodos_branches b
    JOIN foodos_restaurants r ON r.id = b.restaurant_id
    WHERE b.id = branch_id AND r.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM foodos_branches b
    JOIN foodos_restaurants r ON r.id = b.restaurant_id
    WHERE b.id = branch_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Public branch hours" ON foodos_branch_hours;
CREATE POLICY "Public branch hours" ON foodos_branch_hours
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM foodos_branches b
    JOIN foodos_restaurants r ON r.id = b.restaurant_id
    WHERE b.id = branch_id AND r.status = 'active'
  ));

-- 2. REALTIME DE PEDIDOS --------------------------------------
-- La comanda /panel/foodos/pedidos se suscribe a INSERT/UPDATE;
-- RLS (owner-only) filtra los eventos que recibe cada sesión.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'foodos_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.foodos_orders;
  END IF;
END $$;
