-- ============================================================
-- Resurte.me — Migración 00053 (panel_dishes)
-- Vía: Supabase Dashboard → SQL Editor → New query → Run
-- Idempotente: seguro de re-ejecutar.
--
-- Persiste en BD los platillos del costeo del panel (antes solo
-- localStorage). El hook useSharedDishes los sincroniza vía
-- /api/panel/dishes por dueño (user_id o guest_token anónimo) y
-- colección. /api/addresses/claim reclama las filas guest al login.
-- ============================================================

-- ============================================================
-- PASO 1 · PRE-CHECK (solo lectura)
-- Esperado: 0 filas (la tabla aún no existe).
-- ============================================================
SELECT count(*) AS panel_dishes_present
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'panel_dishes';

-- ============================================================
-- PASO 2 · MIGRACIÓN 00053
-- ============================================================

CREATE TABLE IF NOT EXISTS public.panel_dishes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         TEXT NOT NULL,
  collection_slug   TEXT NOT NULL DEFAULT 'default',
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_token       UUID,
  name              TEXT NOT NULL,
  ingredients       JSONB NOT NULL DEFAULT '[]'::jsonb,
  food_cost_percent NUMERIC NOT NULL DEFAULT 0,
  selling_price     NUMERIC NOT NULL DEFAULT 0,
  modificadores     JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT panel_dishes_owner_chk CHECK (user_id IS NOT NULL OR guest_token IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_panel_dishes_user ON public.panel_dishes(user_id, collection_slug);
CREATE INDEX IF NOT EXISTS idx_panel_dishes_guest ON public.panel_dishes(guest_token, collection_slug);

ALTER TABLE public.panel_dishes ENABLE ROW LEVEL SECURITY;

-- Lecturas/escrituras públicas pasan por /api/panel/dishes (service role,
-- que bypasea RLS y valida el guest_token como capability). El usuario
-- autenticado puede operar sus propias filas directamente.
DROP POLICY IF EXISTS "Users manage own panel dishes" ON public.panel_dishes;
CREATE POLICY "Users manage own panel dishes" ON public.panel_dishes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.panel_dishes FROM anon;

COMMENT ON TABLE public.panel_dishes
  IS 'Platillos del costeo del panel ("Mi Restaurante"). Dueño: user_id o guest_token anónimo (capability). Sync bidireccional con localStorage vía /api/panel/dishes.';

-- ============================================================
-- PASO 3 · POST-CHECK (solo lectura)
-- Esperado: panel_dishes con RLS habilitado, 1 policy, 2 índices.
-- ============================================================
SELECT c.relname AS tabla, c.relrowsecurity AS rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'panel_dishes';

SELECT polname AS policy FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname = 'panel_dishes';

SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'panel_dishes';
