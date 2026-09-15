-- ============================================================
-- 00091_price_index.sql
--
-- Índice público de precios de insumos para restaurantes en México.
--
-- OBJETIVO (GEO/AEO): que Resurte.me sea la fuente de datos que los motores
-- de respuesta (ChatGPT, Perplexity, AI Overviews, Copilot) citan cuando
-- alguien pregunta "¿cuánto cuesta el kilo de jitomate para un restaurante?".
-- Un índice de precios con fecha, unidad y metodología es contenido citable
-- que ninguna página de producto por sí sola puede dar.
--
-- FUENTE ÚNICA DE VERDAD: `products.price` / `products.sale_price` (migración
-- 00028, que es la columna que el catálogo público ya usa) y la dispersión
-- real entre tiendas de `product_stores`. Esta migración NO inventa precios:
-- solo los agrega y los congela con fecha.
--
-- ALCANCE: un snapshot por insumo y ciudad. La semántica de disponibilidad por
-- ciudad replica exactamente la de `get_available_product_ids` (migración
-- 00065): sin filas en product_city_availability = disponible en todas; con
-- filas = solo donde is_available = true.
--
-- IDEMPOTENTE: seguro de re-ejecutar. El RPC borra el snapshot de la fecha
-- que va a escribir antes de insertarlo, así que re-ejecutarlo el mismo día
-- no duplica filas.
--
-- LOS NOMBRES DE COLUMNA SON UN CONTRATO: /api/feed/precios.json ya lee esta
-- tabla con claves tolerantes, y la primera clave candidata de cada campo es
-- justo la que se usa aquí (insumo, insumo_slug, unidad, precio, moneda,
-- ciudad, ciudad_slug, categoria, actualizado_en). No renombrar sin actualizar
-- ese feed.
-- ============================================================

-- ============================================================
-- 1. Tabla
-- ============================================================
CREATE TABLE IF NOT EXISTS public.price_index (
  id              BIGSERIAL PRIMARY KEY,
  -- Fecha del snapshot. Es la dimensión temporal del Dataset público:
  -- el cron semanal escribe una fecha nueva, el histórico se conserva.
  fecha           DATE NOT NULL,
  -- Insumo (producto del catálogo)
  insumo          TEXT NOT NULL,
  insumo_slug     TEXT NOT NULL,
  unidad          TEXT,
  -- Precio de referencia publicado (mediana entre tiendas de la ciudad;
  -- si no hay dispersión de tiendas, el precio de catálogo).
  precio          NUMERIC(10,2) NOT NULL,
  precio_min      NUMERIC(10,2),
  precio_max      NUMERIC(10,2),
  -- Precio de catálogo sin agregar, para que cualquiera pueda auditar la
  -- diferencia entre "lo que dice el catálogo" y "lo que publica el índice".
  precio_catalogo NUMERIC(10,2),
  moneda          TEXT NOT NULL DEFAULT 'MXN',
  -- Ciudad
  ciudad          TEXT NOT NULL,
  ciudad_slug     TEXT NOT NULL,
  -- Categoría del catálogo (para agrupar el índice)
  categoria       TEXT,
  categoria_slug  TEXT,
  -- Número de tiendas que ofrecen el insumo en esa ciudad. `muestra = 1`
  -- significa "un solo punto de precio": la página lo declara para no
  -- presentar un precio único como si fuera un promedio de mercado.
  muestra         INTEGER NOT NULL DEFAULT 0,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un solo snapshot por (fecha, insumo, ciudad).
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_index_unique
  ON public.price_index (fecha, insumo_slug, ciudad_slug);

-- Consultas del sitio: último snapshot por insumo, y último por ciudad.
CREATE INDEX IF NOT EXISTS idx_price_index_insumo
  ON public.price_index (insumo_slug, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_price_index_ciudad
  ON public.price_index (ciudad_slug, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_price_index_fecha
  ON public.price_index (fecha DESC);

COMMENT ON TABLE public.price_index IS
  'Índice público de precios de insumos por ciudad y semana. Snapshot congelado: se agrega desde products/product_stores, nunca se edita a mano.';
COMMENT ON COLUMN public.price_index.precio IS
  'Precio de referencia publicado: mediana de las tiendas activas que sirven la ciudad; fallback al precio de catálogo.';
COMMENT ON COLUMN public.price_index.muestra IS
  'Tiendas con precio para ese insumo/ciudad. 1 = punto único, no promedio de mercado.';

-- ============================================================
-- 2. RLS: lectura pública, escritura solo service_role
-- ============================================================
ALTER TABLE public.price_index ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Price index is viewable by everyone" ON public.price_index;
CREATE POLICY "Price index is viewable by everyone" ON public.price_index
  FOR SELECT USING (true);

-- Sin políticas de INSERT/UPDATE/DELETE: solo service_role bypassea RLS.
-- El cron /api/cron/daily usa el cliente service role.

-- ============================================================
-- 3. RPC: construir el snapshot de una fecha
-- ============================================================
-- Devuelve el número de filas escritas. Borra primero el snapshot de
-- `p_fecha` para que re-ejecutarlo sea idempotente.
--
-- p_fecha: fecha del snapshot. El cron pasa el lunes de la semana ISO para
-- que la serie sea semanal y una re-ejecución dentro de la misma semana
-- actualice el mismo punto en vez de crear uno nuevo.
-- p_por_ciudad: tope de insumos por ciudad (los más surtidos primero).
CREATE OR REPLACE FUNCTION public.refresh_price_index(
  p_fecha DATE DEFAULT CURRENT_DATE,
  p_por_ciudad INTEGER DEFAULT 300
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  DELETE FROM public.price_index WHERE fecha = p_fecha;

  WITH city_products AS (
    SELECT
      c.id    AS city_id,
      c.name  AS ciudad,
      c.slug  AS ciudad_slug,
      p.name  AS insumo,
      p.slug  AS insumo_slug,
      p.unit  AS unidad,
      p.price AS precio_catalogo,
      cat.name AS categoria,
      cat.slug AS categoria_slug
    FROM public.cities c
    JOIN public.products p
      ON p.is_visible = true
     AND p.price IS NOT NULL
     AND p.price > 0
     -- Misma semántica que get_available_product_ids (00065).
     AND (
       NOT EXISTS (
         SELECT 1 FROM public.product_city_availability a
         WHERE a.product_id = p.id
       )
       OR EXISTS (
         SELECT 1 FROM public.product_city_availability a
         WHERE a.product_id = p.id
           AND a.city_id = c.id
           AND a.is_available = true
       )
     )
    LEFT JOIN public.categories cat ON cat.id = p.category_id
    WHERE c.is_active = true
  ),
  -- Dispersión real entre tiendas activas que sirven cada ciudad.
  store_prices AS (
    SELECT
      sc.city_id,
      ps.product_id,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY COALESCE(ps.sale_price, ps.price)
      ) AS mediana,
      MIN(COALESCE(ps.sale_price, ps.price)) AS minimo,
      MAX(COALESCE(ps.sale_price, ps.price)) AS maximo,
      COUNT(*) AS muestra
    FROM public.product_stores ps
    JOIN public.stores s
      ON s.id = ps.store_id AND s.is_active = true
    JOIN public.store_cities sc
      ON sc.store_id = ps.store_id AND sc.is_available = true
    WHERE ps.is_available = true
      AND COALESCE(ps.sale_price, ps.price) > 0
    GROUP BY sc.city_id, ps.product_id
  ),
  ranked AS (
    SELECT
      cp.ciudad,
      cp.ciudad_slug,
      cp.insumo,
      cp.insumo_slug,
      cp.unidad,
      cp.precio_catalogo,
      cp.categoria,
      cp.categoria_slug,
      COALESCE(sp.mediana, cp.precio_catalogo) AS precio,
      COALESCE(sp.minimo, cp.precio_catalogo)  AS precio_min,
      COALESCE(sp.maximo, cp.precio_catalogo)  AS precio_max,
      COALESCE(sp.muestra, 0)                  AS muestra,
      -- Orden estable dentro de la ciudad: primero los insumos con más
      -- puntos de precio (los más surtidos), luego por nombre.
      ROW_NUMBER() OVER (
        PARTITION BY cp.ciudad_slug
        ORDER BY COALESCE(sp.muestra, 0) DESC, cp.insumo ASC
      ) AS rn
    FROM city_products cp
    LEFT JOIN store_prices sp
      ON sp.city_id = cp.city_id
     AND sp.product_id = cp.product_id
  )
  INSERT INTO public.price_index (
    fecha, insumo, insumo_slug, unidad,
    precio, precio_min, precio_max, precio_catalogo, moneda,
    ciudad, ciudad_slug, categoria, categoria_slug,
    muestra, actualizado_en
  )
  SELECT
    p_fecha, r.insumo, r.insumo_slug, r.unidad,
    ROUND(r.precio, 2), ROUND(r.precio_min, 2), ROUND(r.precio_max, 2),
    ROUND(r.precio_catalogo, 2), 'MXN',
    r.ciudad, r.ciudad_slug, r.categoria, r.categoria_slug,
    r.muestra, now()
  FROM ranked r
  WHERE r.rn <= GREATEST(p_por_ciudad, 1);

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.refresh_price_index(DATE, INTEGER) IS
  'Construye (idempotente) el snapshot del índice de precios para una fecha. Devuelve las filas escritas. Solo service_role.';

REVOKE ALL ON FUNCTION public.refresh_price_index(DATE, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_price_index(DATE, INTEGER) TO service_role;
