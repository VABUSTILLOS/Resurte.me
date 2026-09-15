-- ============================================================
-- Búsqueda tolerante a typos en el panel admin: pg_trgm + índice
-- GIN sobre products.name. Aditiva, idempotente.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products USING GIN (name gin_trgm_ops);

-- Búsqueda difusa para el panel admin: ids ordenados por similitud.
-- Combina trigramas (typos) con substring (prefijos/frases exactas).
CREATE OR REPLACE FUNCTION search_product_ids_fuzzy(term text)
RETURNS TABLE(id BIGINT, score REAL)
LANGUAGE sql STABLE
AS $$
  SELECT p.id, similarity(p.name, term) AS score
  FROM products p
  WHERE p.name % term OR p.name ILIKE '%' || term || '%'
  ORDER BY score DESC
  LIMIT 200;
$$;
