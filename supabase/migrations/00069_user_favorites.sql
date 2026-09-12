-- ============================================================
-- 00069: user_favorites — lista de resurtido (favoritos)
--
-- El comprador marca productos con ♥ para armar su "lista de
-- resurtido" y re-comprar en 1 clic desde /[ciudad]/favoritos.
-- Invitados: localStorage; al iniciar sesión se fusionan (unión).
--
-- RLS: cada usuario solo ve/edita sus propios favoritos (mismo
-- patrón de dueño que user_carts / panel_rows).
-- ============================================================

CREATE TABLE public.user_favorites (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, product_id)
);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_favorites_select_own ON public.user_favorites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_favorites_insert_own ON public.user_favorites
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_favorites_delete_own ON public.user_favorites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_favorites IS
  'Lista de resurtido: productos favoritos del comprador (sync con localStorage vía /api/favorites).';
