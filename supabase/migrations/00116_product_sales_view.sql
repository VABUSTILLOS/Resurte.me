-- ============================================================
-- Orden por "más vendidos" en el panel de productos.
--
-- El panel (`/admin/productos`) ya muestra la columna "Ventas", pero no se
-- podía ORDENAR por ella: `products` no tiene columna de ventas y PostgREST
-- no sabe ordenar por un agregado de una relación hija (`order_items`), ni
-- por una columna calculada en el `select`.
--
-- Solución: una vista con las columnas de `products` más las ventas
-- agregadas del producto. Al ser columnas reales de una relación, PostgREST
-- sí puede hacer `order=sales_units` y —lo importante— ordenar ANTES de
-- paginar con `range`, así que la paginación sigue en Postgres y no hay que
-- traer el catálogo entero a la aplicación.
--
-- Semántica de ventas: la misma que el reporte (`sales-report`) y que
-- `admin_product_filter_counts`: pedidos con `status <> 'cancelled'`.
-- `sales_units`/`sales_revenue` son NULL (no 0) cuando el producto no tiene
-- ventas, para que `ORDER BY ... DESC NULLS LAST` deje los no vendidos al
-- final; la aplicación lo traduce a 0 al pintarlos.
--
-- Aditiva e idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- Índice de apoyo
-- ------------------------------------------------------------

-- `00001` indexa `order_items (order_id)` y `00046` `(order_id, item_type)`,
-- pero el agregado por producto necesita la otra dirección: sin este índice
-- cada orden por ventas recorre toda la tabla de items.
CREATE INDEX IF NOT EXISTS idx_order_items_product
  ON public.order_items (product_id);

-- ------------------------------------------------------------
-- Vista de ventas por producto
-- ------------------------------------------------------------

-- DROP + CREATE en vez de CREATE OR REPLACE: `p.*` se expande al crear la
-- vista, así que si una migración futura añade columnas a `products` un
-- `CREATE OR REPLACE` fallaría con "cannot change name of view column".
-- La migración corre en una transacción, así que no hay ventana sin vista.
DROP VIEW IF EXISTS public.products_with_sales;

CREATE VIEW public.products_with_sales AS
SELECT
  p.*,
  s.units   AS sales_units,
  s.revenue AS sales_revenue
FROM public.products p
LEFT JOIN (
  SELECT oi.product_id,
         sum(oi.quantity)::bigint     AS units,
         sum(oi.quantity * oi.unit_price) AS revenue
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
   WHERE o.status <> 'cancelled'
   GROUP BY oi.product_id
) s ON s.product_id = p.id;

COMMENT ON VIEW public.products_with_sales IS
  'Productos con sus ventas agregadas (pedidos no cancelados). sales_units/sales_revenue son NULL si el producto no vendió: permite ordenar el panel por más vendidos con NULLS LAST.';

-- El panel lee la vista con la service role (que bypassa RLS); a `anon` y
-- `authenticated` se les niega para no exponer el histórico de ventas al
-- navegador. Supabase concede privilegios por defecto a esos roles en cada
-- objeto nuevo de `public`, así que el REVOKE es necesario.
REVOKE ALL ON public.products_with_sales FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON public.products_with_sales FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.products_with_sales FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT SELECT ON public.products_with_sales TO service_role';
  END IF;
END $$;
