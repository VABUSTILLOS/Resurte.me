-- ============================================================
-- Ronda 8 — conteos y filtros del panel de productos en el servidor.
--
-- Antes, `/api/admin/products/list` calculaba los conteos de los chips
-- ("sin ciudades", "bajo umbral", "nombres duplicados") y el tally por
-- categoría paginando el catálogo desde Node con PostgREST:
--
--   - `noCitiesProductIds` descargaba TODA `product_city_availability` sin
--     límite y la cruzaba contra una consulta `alive` topada a 1000 filas,
--     así que con más de 1000 productos vivos los que quedaban fuera del
--     primer millar desaparecían del conteo y del filtro.
--   - `categoryTally` estaba topado a 10 × 1000 filas, subcontando los chips
--     en catálogos grandes.
--
-- Ahora se resuelve con una sola función SQL agregada, sin topes y sin
-- traer el catálogo entero a la aplicación. Aditiva, idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- Índices de apoyo
-- ------------------------------------------------------------

-- `00099` creó un índice PARCIAL `WHERE deleted_at IS NOT NULL` (para la
-- papelera). La consulta de "productos vivos" necesita la polaridad
-- contraria, que hasta ahora no tenía índice.
CREATE INDEX IF NOT EXISTS idx_products_alive
  ON products (id) WHERE deleted_at IS NULL;

-- Filtro/conteo "bajo umbral": solo interesan los productos con inventario
-- controlado (`stock_quantity IS NULL` = sin control, nunca cuenta).
CREATE INDEX IF NOT EXISTS idx_products_stock_quantity
  ON products (stock_quantity) WHERE stock_quantity IS NOT NULL;

-- `00065` ya indexa `(city_id)` y `(product_id)` por separado; el filtro por
-- ciudad del panel consulta `city_id + is_available` a la vez.
CREATE INDEX IF NOT EXISTS idx_pca_city_available
  ON product_city_availability (city_id, is_available);

-- Tally de categorías del catálogo vivo.
CREATE INDEX IF NOT EXISTS idx_products_category_alive
  ON products (category_id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Conteos agregados
-- ------------------------------------------------------------

/**
 * Conteos y conjuntos de ids de los filtros "derivados" del panel.
 *
 * `p_include_deleted = true` incluye la papelera (el panel cuenta los filtros
 * sobre el catálogo vivo salvo cuando degrada a un esquema sin `deleted_at`).
 *
 * Semántica, idéntica a la que tenía la versión en JS:
 *   - `noCitiesIds`: productos CON filas de disponibilidad pero SIN ninguna
 *     ciudad activa (un producto sin filas está disponible en todas).
 *   - `dupNameIds`: productos cuyo nombre normalizado (`lower(btrim(name))`)
 *     aparece más de una vez.
 *   - `underThresholdIds`: productos con inventario controlado en o por debajo
 *     de su umbral (`low_stock_threshold`, por defecto 5 — misma fuente única
 *     que `src/lib/stock.ts`).
 *   - `categoryCounts`: `{ "<category_id>": n }` del catálogo; los productos
 *     sin categoría no entran (los cubre el chip "Sin categoría").
 *
 * Devuelve JSONB en vez de una tabla para resolver los cuatro conteos en una
 * sola ida y evitar el `jsonb_agg` vacío → `NULL` en cada rama.
 */
CREATE OR REPLACE FUNCTION admin_product_filter_counts(p_include_deleted boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH alive AS (
    SELECT id, category_id, name, stock_quantity, low_stock_threshold
      FROM products
     WHERE p_include_deleted OR deleted_at IS NULL
  ),
  no_cities AS (
    SELECT pca.product_id
      FROM product_city_availability pca
     WHERE EXISTS (SELECT 1 FROM alive a WHERE a.id = pca.product_id)
     GROUP BY pca.product_id
    HAVING NOT bool_or(pca.is_available)
  ),
  dup_names AS (
    SELECT id
      FROM (
        SELECT id, count(*) OVER (PARTITION BY lower(btrim(name))) AS n
          FROM alive
      ) t
     WHERE t.n > 1
  ),
  under_threshold AS (
    SELECT id
      FROM alive
     WHERE stock_quantity IS NOT NULL
       AND stock_quantity <= COALESCE(low_stock_threshold, 5)
  ),
  category_counts AS (
    SELECT COALESCE(jsonb_object_agg(category_id::text, n), '{}'::jsonb) AS obj
      FROM (
        SELECT category_id, count(*) AS n
          FROM alive
         WHERE category_id IS NOT NULL
         GROUP BY category_id
      ) c
  )
  SELECT jsonb_build_object(
    'noCitiesIds',
      COALESCE((SELECT jsonb_agg(product_id ORDER BY product_id) FROM no_cities), '[]'::jsonb),
    'dupNameIds',
      COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM dup_names), '[]'::jsonb),
    'underThresholdIds',
      COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM under_threshold), '[]'::jsonb),
    'categoryCounts',
      (SELECT obj FROM category_counts)
  );
$$;

COMMENT ON FUNCTION admin_product_filter_counts(boolean) IS
  'Conteos/ids de los filtros derivados del panel de productos (sin ciudades, nombres duplicados, bajo umbral) y tally por categoría, en una sola consulta.';
