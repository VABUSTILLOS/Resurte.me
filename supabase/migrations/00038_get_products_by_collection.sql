-- ============================================================
-- 00038_get_products_by_collection.sql
--
-- Mueve el filtrado por tags de Node.js a PostgreSQL.
--
-- Contexto: getProductsByCollection() traía `SELECT *` de TODOS los
-- productos y filtraba por tags en memoria. products.tags ya tiene
-- índice GIN, así que el operador JSONB ?| (overlap) resuelve el
-- filtro en la BD usando el índice.
--
-- La función es SECURITY DEFINER para poder leer products con RLS
-- (los clientes públicos solo necesitan SELECT a productos visibles).
-- Acceso: se ejecuta vía RPC autenticado o anónimo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_products_by_collection(
  p_slug TEXT
)
RETURNS TABLE (
  id            BIGINT,
  name          TEXT,
  slug          TEXT,
  description   TEXT,
  image_url     TEXT,
  brand         TEXT,
  price         NUMERIC(10,2),
  sale_price    NUMERIC(10,2),
  images        JSONB,
  category_id   BIGINT,
  tags          JSONB,
  stock_status  public.stock_status,
  is_visible    BOOLEAN,
  created_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH collection_tags AS (
    SELECT COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(rc.tags)),
      ARRAY[]::text[]
    ) AS tags
    FROM public.restaurant_collections rc
    WHERE rc.slug = p_slug
      AND rc.is_active = true
    LIMIT 1
  )
  SELECT p.id, p.name, p.slug, p.description, p.image_url, p.brand,
         p.price, p.sale_price, p.images, p.category_id, p.tags,
         p.stock_status, p.is_visible, p.created_at
  FROM public.products p, collection_tags ct
  WHERE p.is_visible = true
    AND p.tags ?| ct.tags
  ORDER BY p.name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_products_by_collection(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_products_by_collection(TEXT) TO anon, authenticated, service_role;
