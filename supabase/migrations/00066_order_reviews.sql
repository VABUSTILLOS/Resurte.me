-- ============================================================
-- 00066: Reseñas de pedidos (paridad take.app: reviews)
-- ------------------------------------------------------------
-- La automatización post_delivery_rating envía al cliente un
-- enlace a /calificar 24 h después de la entrega. Hasta ahora
-- esa ruta no existía (404) y no había dónde guardar la reseña.
--
-- Una reseña por pedido (UNIQUE order_id). La escritura se hace
-- exclusivamente vía service role en /api/reviews, que valida:
--   · el pedido existe y está en status 'delivered'
--   · quien reseña es el dueño (sesión) o trae el restore_token
--     del pedido (capability URL, mismo patrón que /api/cart/restore)
-- Lectura pública (social proof futuro en el catálogo/FoodOS).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_reviews (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT CHECK (comment IS NULL OR char_length(comment) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_reviews_order_key UNIQUE (order_id)
);

COMMENT ON TABLE public.order_reviews IS
  'Reseña 1-5 estrellas + comentario opcional por pedido entregado (paridad take.app).';

CREATE INDEX IF NOT EXISTS idx_order_reviews_user ON public.order_reviews (user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.order_reviews ENABLE ROW LEVEL SECURITY;

-- Lectura pública; INSERT/UPDATE/DELETE solo vía service role (sin políticas
-- de escritura → el rol authenticated/anon no puede escribir directamente).
CREATE POLICY "Reviews are viewable by everyone" ON public.order_reviews
  FOR SELECT USING (true);
