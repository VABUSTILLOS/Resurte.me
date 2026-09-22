-- ============================================================
-- 00192 — `products`: el costo de compra deja de ser público
--
-- EL AGUJERO
-- ----------
-- `products` tiene `GRANT SELECT` **a nivel de tabla** para `anon` y
-- `authenticated` (viene del `ALTER DEFAULT PRIVILEGES` de Supabase, el mismo
-- mecanismo que documenta `00160`) y su política RLS es
-- `SELECT USING (true)` —correcta: el catálogo es público—. Pero RLS filtra
-- **filas, no columnas**. Con la llave anónima que viaja en el navegador
-- bastaba
--
--     GET /rest/v1/products?select=cost
--
-- para leer el **costo de compra** de los 475 productos: el margen entero de
-- Resurte, producto por producto, sin cuenta y sin sesión. `cost` llegó en
-- `00102` ("Costo del producto (para margen en el panel admin)") y nadie
-- volvió a mirar quién podía leerla. `admin_note` (notas internas) y
-- `low_stock_threshold` (umbral de reposición) tenían el mismo problema.
--
-- LA REGLA
-- --------
-- **Lista blanca, no lista negra.** `REVOKE SELECT (cost)` sobre un
-- `GRANT SELECT` de tabla es **inerte** —Postgres subsume el privilegio de
-- columna en el de tabla, es el tropiezo que `00160` dejó escrito—. Y al
-- revés, con lista blanca cualquier columna que se añada mañana a `products`
-- nace **privada**: el default es el seguro, y abrirla exige una migración
-- explícita.
--
-- La lista de columnas públicas vive en **`src/lib/product-columns.ts`**
-- (`PUBLIC_PRODUCT_COLUMNS`) porque el código la necesita para pedirla: el
-- catálogo hacía `select("*")`, y PostgREST expande `*` a todas las columnas
-- de su caché, así que sin cambiar el `select` la consulta entera fallaría con
-- `42501`. `src/lib/product-columns.contract.test.ts` compara esta lista con
-- la de TS para que no puedan divergir.
--
-- POR QUÉ SE REVOCAN TAMBIÉN INSERT/UPDATE/DELETE
-- -----------------------------------------------
-- Son **inertes hoy** (no existe ninguna política RLS de escritura sobre
-- `products`, así que RLS las deniega antes de llegar al privilegio) y por eso
-- mismo son una trampa: el día que alguien añada una política permisiva, el
-- `GRANT` de tabla ya estará ahí esperando. Todas las escrituras del producto
-- pasan por `createServiceClient()` (`service_role`), que no se toca.
--
-- LO QUE NO SE ROMPE (comprobado antes de escribir esto)
-- ------------------------------------------------------
--   · `search_product_ids_fuzzy(term)` es **SECURITY INVOKER** y la ejecuta
--     `anon`: lee `name`, `sku` y `barcode`. Por eso esas dos se quedan.
--   · `get_products_by_collection(slug)` es SECURITY DEFINER y devuelve una
--     lista **explícita** de columnas (sin `cost`): no es un bypass.
--   · `POST /api/orders` revalida precios con el cliente de sesión y lee
--     `stock_quantity`: se queda.
--   · `cost`, `admin_note`, `low_stock_threshold`, `deleted_at` y
--     `publish_at`/`unpublish_at` solo los lee el panel y el cron, que van con
--     `service_role`.
--
-- Idempotente: re-ejecutarla deja el mismo estado.
-- ============================================================

-- El privilegio de tabla va primero: mientras exista, cualquier REVOKE de
-- columna que se escriba después es decorativo.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.products FROM PUBLIC;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.products FROM anon, authenticated;

-- La superficie pública, columna por columna.
GRANT SELECT (
  id,
  name,
  slug,
  description,
  image_url,
  images,
  brand,
  category_id,
  price,
  sale_price,
  sale_starts_at,
  sale_ends_at,
  related_product_ids,
  stock_status,
  stock_quantity,
  unit,
  tags,
  is_visible,
  sort_order,
  seo_title,
  seo_description,
  show_in_whatsapp,
  whatsapp_product_id,
  sku,
  barcode,
  created_at,
  updated_at
) ON public.products TO anon, authenticated;

-- `service_role` conserva la tabla completa (el panel admin lee `cost`,
-- `admin_note` y `low_stock_threshold`, y escribe).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO service_role;

-- RLS sigue siendo la primera capa (filtra filas); esto reafirma que nadie la
-- apagó de paso.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Guarda ruidosa: si el privilegio no quedó donde dice el comentario, la
-- migración falla en vez de dejar el agujero abierto en silencio.
DO $guard$
DECLARE
  v_col TEXT;
  v_fuga TEXT[] := ARRAY[]::TEXT[];
  v_falta TEXT[] := ARRAY[]::TEXT[];
  v_privadas CONSTANT TEXT[] := ARRAY['cost', 'admin_note', 'low_stock_threshold', 'deleted_at', 'publish_at', 'unpublish_at'];
  v_publicas CONSTANT TEXT[] := ARRAY['id', 'name', 'slug', 'description', 'image_url', 'images', 'brand', 'category_id', 'price', 'sale_price', 'sale_starts_at', 'sale_ends_at', 'related_product_ids', 'stock_status', 'stock_quantity', 'unit', 'tags', 'is_visible', 'sort_order', 'seo_title', 'seo_description', 'show_in_whatsapp', 'whatsapp_product_id', 'sku', 'barcode', 'created_at', 'updated_at'];
BEGIN
  FOREACH v_col IN ARRAY v_privadas LOOP
    IF has_column_privilege('anon', 'public.products', v_col, 'SELECT')
       OR has_column_privilege('authenticated', 'public.products', v_col, 'SELECT') THEN
      v_fuga := v_fuga || v_col;
    END IF;
  END LOOP;

  FOREACH v_col IN ARRAY v_publicas LOOP
    IF NOT has_column_privilege('anon', 'public.products', v_col, 'SELECT') THEN
      v_falta := v_falta || v_col;
    END IF;
  END LOOP;

  IF array_length(v_fuga, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00192: anon/authenticated todavía pueden leer % de products', v_fuga;
  END IF;
  IF array_length(v_falta, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00192: la tienda pública perdió acceso a % de products', v_falta;
  END IF;

  IF has_table_privilege('anon', 'public.products', 'SELECT') THEN
    RAISE EXCEPTION '00192: anon conserva SELECT a nivel de tabla en products';
  END IF;

  RAISE NOTICE '00192: products con % columnas públicas y % privadas; SELECT de tabla revocado.',
    array_length(v_publicas, 1), array_length(v_privadas, 1);
END $guard$;
