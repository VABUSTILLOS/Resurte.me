-- ============================================================
-- 00111_collection_sale_window.sql
--
-- Añade la ventana de oferta (00107) al RPC get_products_by_collection.
--
-- Contexto: el bump dinámico de receta (order-bumps.ts) y las páginas de
-- colección consumen este RPC. Sin sale_starts_at/sale_ends_at el precio de
-- oferta se aplicaba incluso con la ventana vencida, cobrando un precio
-- distinto al que muestra la tienda.
--
-- Postgres no permite cambiar el tipo de retorno con CREATE OR REPLACE, así
-- que la función se recrea (DROP + CREATE). El cuerpo es idéntico al de 00038
-- salvo las dos columnas nuevas; los GRANT se reaplican al final.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_products_by_collection(TEXT);

CREATE FUNCTION public.get_products_by_collection(
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
  sale_starts_at TIMESTAMPTZ,
  sale_ends_at  TIMESTAMPTZ,
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
         p.price, p.sale_price, p.sale_starts_at, p.sale_ends_at,
         p.images, p.category_id, p.tags,
         p.stock_status, p.is_visible, p.created_at
  FROM public.products p, collection_tags ct
  WHERE p.is_visible = true
    AND p.tags ?| ct.tags
  ORDER BY p.name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_products_by_collection(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_products_by_collection(TEXT) TO anon, authenticated, service_role;
