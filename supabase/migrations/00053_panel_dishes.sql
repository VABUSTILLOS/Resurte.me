-- ============================================================
-- Resurte.me — panel_dishes: platillos del costeo persistidos en BD
--
-- Los platillos creados en /panel/costeo (SharedDish) vivían solo en
-- localStorage (key "shared-dishes"): se perdían entre dispositivos y
-- navegadores. Esta tabla los persiste por dueño (usuario autenticado o
-- guest_token anónimo — mismo patrón que addresses) y colección de
-- restaurante. El hook useSharedDishes sincroniza localStorage ↔ BD vía
-- /api/panel/dishes (service client; el guest_token actúa como
-- capability — UUID v4 no adivinable, igual que las direcciones guest).
-- Al iniciar sesión, /api/addresses/claim reclama también estas filas.
--
-- client_id conserva el identificador del cliente ("dish-<ts>-<n>") para
-- que el merge con los mocks del panel siga funcionando por id estable.
-- ============================================================

CREATE TABLE public.panel_dishes (
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

CREATE INDEX idx_panel_dishes_user ON public.panel_dishes(user_id, collection_slug);
CREATE INDEX idx_panel_dishes_guest ON public.panel_dishes(guest_token, collection_slug);

ALTER TABLE public.panel_dishes ENABLE ROW LEVEL SECURITY;

-- Lecturas/escrituras públicas pasan por /api/panel/dishes (service role,
-- que bypasea RLS y valida el guest_token como capability). El usuario
-- autenticado puede operar sus propias filas directamente.
CREATE POLICY "Users manage own panel dishes" ON public.panel_dishes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.panel_dishes FROM anon;

COMMENT ON TABLE public.panel_dishes
  IS 'Platillos del costeo del panel ("Mi Restaurante"). Dueño: user_id o guest_token anónimo (capability). Sync bidireccional con localStorage vía /api/panel/dishes.';
