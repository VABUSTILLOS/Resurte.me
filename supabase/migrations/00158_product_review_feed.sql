-- ============================================================
-- 00158 · product_review_feed — reseñas de pedido agregadas por producto
--
-- CONTEXTO (hallazgo E.4): las reseñas se ESCRIBEN desde 00087
-- (order_reviews, alimentadas por la automatización de WhatsApp
-- post_delivery_rating → /calificar) y su RLS ya declara lectura pública
-- "para social proof futuro en el catálogo". Ese social proof nunca se
-- construyó: la tabla era de escritura y lectura, pero sin consumidor.
--
-- PROBLEMA DE MODELO: una reseña es de PEDIDO, no de producto
-- (order_reviews.order_id es UNIQUE). El único puente entre una reseña y
-- el catálogo es order_items. Este RPC hace esa expansión en la base de
-- datos y devuelve el agregado por producto.
--
-- SEGURIDAD: `anon` tiene SELECT sobre orders pero su única política es
-- auth.uid() = user_id, así que el JOIN no devuelve nada bajo RLS.
-- La función es SECURITY DEFINER a propósito, con una superficie de
-- salida deliberadamente mínima: product_id, rating, comment y fechas.
-- NO expone order_id, user_id ni precios, así que no revela quién
-- compró qué. search_path fijo y EXECUTE revocado de PUBLIC.
-- ============================================================

CREATE OR REPLACE FUNCTION public.product_review_feed(
  p_limit_per_product INTEGER DEFAULT 5
)
RETURNS TABLE (
  product_id     BIGINT,
  review_count   BIGINT,
  average_rating NUMERIC(3,2),
  rating         SMALLINT,
  comment        TEXT,
  reviewed_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH expanded AS (
    -- DISTINCT: un producto puede repetirse en dos líneas del mismo pedido
    -- y la reseña es una sola. Sin esto el promedio se sesgaría.
    SELECT DISTINCT
      oi.product_id,
      o.id     AS order_id,
      r.rating,
      r.comment,
      r.created_at
    FROM public.order_reviews r
    JOIN public.orders o       ON o.id  = r.order_id
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE oi.product_id IS NOT NULL
  ),
  ranked AS (
    SELECT
      e.product_id,
      e.order_id,
      e.rating,
      e.comment,
      e.created_at,
      count(*)                    OVER (PARTITION BY e.product_id) AS review_count,
      avg(e.rating) OVER (PARTITION BY e.product_id) AS average_rating,
      row_number()                OVER (
        PARTITION BY e.product_id
        ORDER BY e.created_at DESC, e.order_id DESC
      ) AS rn
    FROM expanded e
  )
  SELECT
    r.product_id,
    r.review_count,
    round(r.average_rating, 2)::NUMERIC(3,2),
    r.rating,
    r.comment,
    r.created_at
  FROM ranked r
  WHERE r.rn <= GREATEST(1, LEAST(coalesce(p_limit_per_product, 5), 20))
  ORDER BY r.product_id, r.rn;
$$;

COMMENT ON FUNCTION public.product_review_feed(INTEGER) IS
  'Agregado público de reseñas por producto (promedio, total y las N más recientes). Expande order_reviews → orders → order_items. SECURITY DEFINER con salida mínima: no expone order_id ni user_id.';

REVOKE ALL ON FUNCTION public.product_review_feed(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_review_feed(INTEGER)
  TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- Autocomprobación: el RPC debe existir, ser ejecutable por anon y
-- tener search_path fijo (sin esto un SECURITY DEFINER es un riesgo).
-- ------------------------------------------------------------
DO $guard_feed$
DECLARE
  v_prosecdef BOOLEAN;
  v_config    TEXT[];
  v_anon      BOOLEAN;
BEGIN
  SELECT p.prosecdef, p.proconfig
    INTO v_prosecdef, v_config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'product_review_feed';

  IF v_prosecdef IS DISTINCT FROM true THEN
    RAISE EXCEPTION '00158: product_review_feed debe ser SECURITY DEFINER';
  END IF;

  IF v_config IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(v_config) c WHERE c LIKE 'search_path=%'
  ) THEN
    RAISE EXCEPTION '00158: product_review_feed necesita search_path fijo';
  END IF;

  v_anon := has_function_privilege(
    'anon', 'public.product_review_feed(integer)', 'EXECUTE'
  );
  IF NOT v_anon THEN
    RAISE EXCEPTION '00158: anon debe poder ejecutar product_review_feed';
  END IF;

  RAISE NOTICE '00158: product_review_feed listo (SECURITY DEFINER, search_path fijo, anon OK)';
END
$guard_feed$;
