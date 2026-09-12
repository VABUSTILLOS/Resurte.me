-- ============================================================
-- 00068: user_carts — carrito persistente por usuario
--
-- Hoy el carrito vive solo en localStorage (cart-context): se pierde
-- al cambiar de dispositivo/navegador y el carrito abandonado solo se
-- reconstruye si ya existía una orden pendiente.
--
-- `user_carts` guarda el carrito ACTIVO de cada usuario con sesión
-- (una fila por usuario, replace-all vía PUT /api/cart, debounce en el
-- cliente). El merge al login lo decide el cliente comparando
-- `updated_at` con el timestamp guardado en localStorage
-- (last-write-wins). Invitados: siguen en localStorage; al iniciar
-- sesión su carrito local sube y ya no se pierde.
--
-- RLS: cada usuario solo lee/escribe su propia fila (mismo patrón de
-- dueño que panel_rows / panel_entries).
-- ============================================================

CREATE TABLE public.user_carts (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  items       JSONB NOT NULL DEFAULT '[]'::jsonb,
  coupon      JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_carts_items_array CHECK (jsonb_typeof(items) = 'array')
);

ALTER TABLE public.user_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_carts_select_own ON public.user_carts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_carts_insert_own ON public.user_carts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_carts_update_own ON public.user_carts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_carts_delete_own ON public.user_carts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_carts IS
  'Carrito activo por usuario con sesión (sync cross-device con localStorage vía /api/cart).';
