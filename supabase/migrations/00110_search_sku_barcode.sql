-- ============================================================
-- Búsqueda por SKU y código de barras en el panel admin.
-- Requiere 00106 (products.sku / products.barcode). Aditiva, idempotente.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_products_sku_trgm
  ON products USING GIN (sku gin_trgm_ops);

-- Reemplaza la función de 00103 conservando su firma: ahora también
-- encuentra por SKU (exacto o prefijo) y por código de barras exacto,
-- y puntúa esos matches por encima de la similitud de nombre.
CREATE OR REPLACE FUNCTION search_product_ids_fuzzy(term text)
RETURNS TABLE(id BIGINT, score REAL)
LANGUAGE sql STABLE
AS $$
  SELECT p.id,
         GREATEST(
           similarity(p.name, term),
           CASE
             WHEN p.sku IS NOT NULL AND lower(p.sku) = lower(term) THEN 1.0
             WHEN p.barcode = term THEN 1.0
             WHEN p.sku IS NOT NULL AND p.sku ILIKE term || '%' THEN 0.9
             WHEN p.sku IS NOT NULL AND p.sku ILIKE '%' || term || '%' THEN 0.7
             ELSE 0
           END
         )::real AS score
  FROM products p
  WHERE p.name % term
     OR p.name ILIKE '%' || term || '%'
     OR (p.sku IS NOT NULL AND p.sku ILIKE '%' || term || '%')
     OR p.barcode = term
  ORDER BY score DESC
  LIMIT 200;
$$;

COMMENT ON FUNCTION search_product_ids_fuzzy(text) IS
  'Búsqueda difusa del panel admin: nombre (pg_trgm), SKU (exacto/prefijo) y código de barras (exacto).';
