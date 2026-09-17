-- ============================================================
-- Ronda 10 — conteos, marcas y etiquetas del panel de productos.
--
-- `00115` movió al servidor los cuatro filtros "derivados" (sin ciudades,
-- nombres duplicados, bajo umbral, tally por categoría), pero el listado
-- seguía resolviendo el resto de los chips con **11 consultas `count: "exact"`
-- en paralelo** más **dos descargas de 1000 filas** (marcas y etiquetas) en
-- cada carga del panel:
--
--   - los 11 `head: true` son 11 idas y vueltas a Postgres por carga;
--   - `brandRows` y `tagRows` traían como máximo 1000 productos
--     (`MAX_PAGE_SIZE`) para deduplicar en Node, así que en un catálogo mayor
--     el filtro de marcas y el de etiquetas **perdían valores en silencio**
--     (mismo tipo de bug que 00115 corrigió para "sin ciudades").
--
-- Ahora la misma función agregada devuelve también los 11 contadores, la lista
-- de marcas y el recuento por etiqueta: una sola consulta, sin topes.
-- Aditiva e idempotente (conserva la firma de 00115, así que los llamadores
-- antiguos siguen funcionando y el `jsonb` solo gana claves).
-- ============================================================

-- ------------------------------------------------------------
-- Bitácora de auditoría: índice por entidad
-- ------------------------------------------------------------

-- `00072` indexó `created_at`, `(action, created_at)` y `(actor_id, created_at)`,
-- pero el timeline de un producto (`/api/admin/products/audit` con
-- `entity='products'` + `entity_id`) y el drawer de actividad reciente filtran
-- por entidad, y hasta ahora escaneaban la tabla completa ordenando por fecha.
--
-- El índice va guardado: `admin_audit_log` la crea `00072_admin_audit_log.sql`
-- y en bases donde esa migración aún no se haya aplicado (o se haya saltado
-- por la colisión de versiones que obligó a renumerarla) este archivo debe
-- seguir siendo aplicable — la función de conteos que viene debajo no depende
-- de la bitácora y abortaba con `42P01` por una sola sentencia de índice.
DO $$
BEGIN
  IF to_regclass('public.admin_audit_log') IS NULL THEN
    RAISE NOTICE 'admin_audit_log no existe: se omite idx_admin_audit_log_entity. Aplica 00072_admin_audit_log.sql y reejecuta este archivo.';
  ELSE
    CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
      ON admin_audit_log(entity, entity_id, created_at DESC);
  END IF;
END $$;

-- ------------------------------------------------------------
-- Conteos agregados (v2)
-- ------------------------------------------------------------

/**
 * Conteos, conjuntos de ids y catálogos de filtros del panel de productos.
 *
 * `p_include_deleted = true` incluye la papelera (el panel cuenta los filtros
 * sobre el catálogo vivo salvo cuando degrada a un esquema sin `deleted_at`,
 * en cuyo caso el flag llega invertido y `trash` vale 0).
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
 *   - contadores de chips: `catalogTotal`, `published`, `noImage`, `lowStock`,
 *     `outStock`, `noPrice`, `noCategory`, `waMismatch`, `onSale`, `staleSale`,
 *     `trash`. `unpublished` y los derivados por longitud de ids los calcula el
 *     panel a partir de estos.
 *   - `brands`: marcas distintas no vacías (el orden final lo fija el panel,
 *     que ordena con `localeCompare("es")`).
 *   - `tagCounts`: `{ "<etiqueta>": n }` con la etiqueta ya normalizada
 *     (`lower(btrim(...))`), acotado a las 500 más frecuentes; el panel ordena
 *     por frecuencia y recorta a 50.
 *
 * Devuelve JSONB en vez de una tabla para resolver todo en una sola ida y
 * evitar el `jsonb_agg` vacío → `NULL` en cada rama.
 */
CREATE OR REPLACE FUNCTION admin_product_filter_counts(p_include_deleted boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH alive AS (
    SELECT id, category_id, name, brand, tags, image_url, price, stock_status,
           stock_quantity, low_stock_threshold, is_visible, show_in_whatsapp,
           sale_price, sale_ends_at
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
  ),
  counters AS (
    SELECT
      count(*) AS catalog_total,
      count(*) FILTER (WHERE is_visible) AS published,
      count(*) FILTER (WHERE image_url IS NULL) AS no_image,
      count(*) FILTER (WHERE stock_status = 'low_stock') AS low_stock,
      count(*) FILTER (WHERE stock_status = 'out_of_stock') AS out_stock,
      count(*) FILTER (WHERE price IS NULL) AS no_price,
      count(*) FILTER (WHERE category_id IS NULL) AS no_category,
      count(*) FILTER (WHERE show_in_whatsapp AND NOT is_visible) AS wa_mismatch,
      count(*) FILTER (WHERE sale_price IS NOT NULL) AS on_sale,
      count(*) FILTER (
        WHERE sale_price IS NOT NULL AND sale_ends_at IS NOT NULL AND sale_ends_at < now()
      ) AS stale_sale
      FROM alive
  ),
  brand_list AS (
    SELECT COALESCE(jsonb_agg(DISTINCT btrim(brand)), '[]'::jsonb) AS arr
      FROM alive
     WHERE brand IS NOT NULL AND btrim(brand) <> ''
  ),
  tag_counts AS (
    SELECT COALESCE(jsonb_object_agg(tag, n), '{}'::jsonb) AS obj
      FROM (
        SELECT lower(btrim(t.tag)) AS tag, count(*) AS n
          FROM alive a
          CROSS JOIN LATERAL jsonb_array_elements_text(a.tags) AS t(tag)
         WHERE btrim(t.tag) <> ''
         GROUP BY 1
         ORDER BY n DESC, tag ASC
         LIMIT 500
      ) x
  )
  SELECT jsonb_build_object(
    'noCitiesIds',
      COALESCE((SELECT jsonb_agg(product_id ORDER BY product_id) FROM no_cities), '[]'::jsonb),
    'dupNameIds',
      COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM dup_names), '[]'::jsonb),
    'underThresholdIds',
      COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM under_threshold), '[]'::jsonb),
    'categoryCounts',
      (SELECT obj FROM category_counts),
    'catalogTotal', (SELECT catalog_total FROM counters),
    'published', (SELECT published FROM counters),
    'noImage', (SELECT no_image FROM counters),
    'lowStock', (SELECT low_stock FROM counters),
    'outStock', (SELECT out_stock FROM counters),
    'noPrice', (SELECT no_price FROM counters),
    'noCategory', (SELECT no_category FROM counters),
    'waMismatch', (SELECT wa_mismatch FROM counters),
    'onSale', (SELECT on_sale FROM counters),
    'staleSale', (SELECT stale_sale FROM counters),
    -- Sin columna `deleted_at` (esquema degradado) el flag llega invertido:
    -- la papelera no existe, así que el contador es 0.
    'trash',
      CASE WHEN p_include_deleted THEN 0
           ELSE (SELECT count(*) FROM products WHERE deleted_at IS NOT NULL)
      END,
    'brands', (SELECT arr FROM brand_list),
    'tagCounts', (SELECT obj FROM tag_counts)
  );
$$;

COMMENT ON FUNCTION admin_product_filter_counts(boolean) IS
  'Conteos de chips, ids de los filtros derivados (sin ciudades, nombres duplicados, bajo umbral), tally por categoría, marcas distintas y recuento por etiqueta del panel de productos, en una sola consulta.';
