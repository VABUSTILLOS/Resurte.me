/**
 * Columnas de `products` que la **tienda pública** puede leer.
 *
 * POR QUÉ EXISTE ESTA LISTA
 * -------------------------
 * `products` nació con `GRANT SELECT` **a nivel de tabla** para `anon` y
 * `authenticated` (viene del `ALTER DEFAULT PRIVILEGES` de Supabase), y en
 * Postgres un privilegio de tabla cubre **todas** las columnas. La política RLS
 * de `products` es `SELECT USING (true)` —correcta, el catálogo es público—,
 * pero RLS filtra **filas**, no columnas: con la llave anónima que viaja en el
 * navegador bastaba
 *
 *     GET /rest/v1/products?select=cost
 *
 * para leer el **costo de compra** de los 475 productos, es decir el margen de
 * Resurte entero. `cost` no es la única columna que no pinta nada en público:
 * `admin_note` (notas internas del panel) y `low_stock_threshold` (umbral
 * operativo) tampoco.
 *
 * La migración `00192_products_column_privileges.sql` revoca el `SELECT` de
 * tabla y vuelve a concederlo **columna por columna**, con exactamente esta
 * lista. `src/lib/product-columns.contract.test.ts` compara las dos para que no
 * puedan divergir.
 *
 * POR QUÉ ES UNA LISTA BLANCA Y NO UN `REVOKE` DE LAS COLUMNAS MALAS
 * ------------------------------------------------------------------
 * Un `REVOKE SELECT (cost)` sobre un `GRANT SELECT` de tabla es **inerte** —lo
 * documenta `00160`, que tropezó con lo mismo—. Y al revés: con lista blanca,
 * cualquier columna que se añada mañana a `products` nace **privada** por
 * omisión. El default es el seguro.
 *
 * QUÉ OBLIGA A ESTAR AQUÍ
 * -----------------------
 * - El catálogo público (`src/lib/data.ts`), que antes pedía `select("*")`.
 * - `src/lib/catalog.ts` (`name, price, unit`).
 * - El botón "repetir pedido" (`REORDER_CATALOG_COLUMNS`).
 * - `POST /api/orders`, que **revalida precios contra la BD** y por eso lee
 *   `price`, `sale_price`, `stock_status` y `stock_quantity`.
 * - `search_product_ids_fuzzy(text)`, que es `SECURITY INVOKER`, la ejecuta
 *   `anon` y lee `name`, `sku` y `barcode`. Si `sku`/`barcode` salieran de esta
 *   lista, la búsqueda por código de barras se caería con `42501`.
 *
 * QUÉ SE QUEDA FUERA Y POR QUÉ
 * ----------------------------
 * | Columna | Motivo |
 * | --- | --- |
 * | `cost` | Costo de compra: revela el margen. Es la fuga que cierra `00192`. |
 * | `admin_note` | Notas internas del panel de administración. |
 * | `low_stock_threshold` | Umbral operativo de reposición; solo lo lee el admin. |
 * | `deleted_at` | Papelera (`src/lib/trash.ts`, que corre con `service_role`). |
 * | `publish_at` / `unpublish_at` | Programación editorial; solo la lee el cron de publicación. |
 *
 * Los consumidores de esas seis columnas usan `createServiceClient()`
 * (`service_role`), que **no** pasa por estos privilegios.
 */
export const PUBLIC_PRODUCT_COLUMNS = [
  "id",
  "name",
  "slug",
  "description",
  "image_url",
  "images",
  "brand",
  "category_id",
  "price",
  "sale_price",
  "sale_starts_at",
  "sale_ends_at",
  "related_product_ids",
  "stock_status",
  "stock_quantity",
  "unit",
  "tags",
  "is_visible",
  "sort_order",
  "seo_title",
  "seo_description",
  "show_in_whatsapp",
  "whatsapp_product_id",
  "sku",
  "barcode",
  "created_at",
  "updated_at",
] as const

/**
 * La misma lista como cadena para PostgREST (`.select(PUBLIC_PRODUCT_SELECT)`).
 *
 * Se usa una lista explícita en vez de `"*"` porque PostgREST expande `*` a
 * todas las columnas de su caché de esquema y la consulta entera falla con
 * `42501` en cuanto una sola no tenga privilegio.
 */
export const PUBLIC_PRODUCT_SELECT = PUBLIC_PRODUCT_COLUMNS.join(", ")

/** Las que `00192` deja privadas. Se exporta para poder afirmarlo en las pruebas. */
export const PRIVATE_PRODUCT_COLUMNS = [
  "cost",
  "admin_note",
  "low_stock_threshold",
  "deleted_at",
  "publish_at",
  "unpublish_at",
] as const
