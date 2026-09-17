# Agente: Administración

## Posee
- `src/app/admin/**` (dashboard, pedidos, productos, proveedores, conversión,
  marketing, whatsapp + automations, recompensas, bitácoras, clientes, sistema)
- `src/app/api/admin/**`
- `src/lib/admin-auth.ts`, `src/lib/admin-marketing-validation.ts`

## Invariantes
- Toda ruta API de admin valida con `admin-auth.ts` y el layout tiene guard
  server-side (`getUserRole`); nunca exponer datos sin gate.
- Dashboard (PR #18): KPIs vs ayer, alertas operativas, auto-refresh pausable,
  export CSV, badge de pendientes, skeleton de carga.
- Las gráficas (recharts) llevan `role="img"` + resumen textual de la serie
  (`describeSeries`) — el SVG solo no es accesible.
- La subnav es scroll horizontal en móvil y está agrupada por dominio
  (`ADMIN_NAV_GROUPS` en `sub-nav.tsx`: Productos, WhatsApp, Operación,
  Proveedores, Crecimiento, Clientes, Sistema). El orden de los grupos es el
  orden visible: Productos y WhatsApp van primero, cada uno en su propio grupo;
  los `label` son keys de React y deben ser únicos. No agregar píldoras sueltas
  fuera de un grupo.
- Superficies consolidadas: visibilidad y disponibilidad por ciudad viven solo
  en `/admin/productos`; auditoría/errores/emails en `/admin/bitacoras?tab=…`;
  facturas en `/admin/recompensas?tab=facturas`; el disparo manual de workflows
  en `/admin/whatsapp/automations`. Las rutas viejas se mantienen como
  `redirects()` permanentes (308) en `next.config.ts`; al mover una superficie,
  agrega el redirect correspondiente en vez de dejar un 404.
- Restaurantes FoodOS (`/admin/restaurantes`, grupo *Clientes*): nivel de lealtad
  **computado en vivo** por restaurante (`getAdminFoodosRestaurants`), override
  manual (`setFoodosTierOverride`) y KPIs de adopción por capacidad
  (`getAdminFoodosAdoption`). Dos reglas que no se pueden romper: un override con
  `tier: "Verde"` **revoca** (borra la fila, no la escribe), y una capacidad sin
  tabla de telemetría se declara como **no medida** (`untracked`) en vez de
  contarse como cero. Los KPIs tienen tope de 5 000 filas por fuente; al
  alcanzarlo se emite `logger.warn("admin.foodosAdoption.truncated")` y el número
  queda subestimado a propósito. Todo el texto de admin va **hardcodeado en
  español** (no pasa por `t()`), a diferencia del panel del restaurante.
- Errores con reintento (`error.tsx` del área + botón Reintentar en página).
  El boundary de `/admin` además **reporta a `error_logs`** con
  `reportClientError()` (`src/lib/report-client-error.ts`): antes solo escribía
  en consola, así que la pestaña *Errores* de `/admin/bitacoras` quedaba siempre
  vacía y un fallo en producción era indiagnosticable. Muestra el detalle
  técnico (sección, mensaje, digest) con botón de copiar. El helper nunca lanza
  y deduplica por mensaje+digest, porque el endpoint tiene rate limit de 30/min
  y un boundary que re-monta en bucle agotaría la cuota.
- Productos (`/admin/productos`): la tabla es server-side
  (`GET /api/admin/products/list` con búsqueda/filtros/orden/paginación y
  conteos para los chips); "seleccionar todo" abarca todas las páginas vía
  `idsOnly=1`; el export CSV usa las mismas columnas que la importación
  (re-importable); crear/editar/duplicar pasan por
  `POST /api/admin/products/create|duplicate` y el PATCH con whitelist —
  el slug NUNCA se regenera al editar el nombre (rompería URLs indexadas);
  el duplicado nace despublicado y copia la disponibilidad por ciudad.
  Metadatos por fila (sync WA pendiente, última edición) vía
  `GET /api/admin/products/row-meta`.
- Productos ronda 2: filtros/orden/página/vista viajan en la URL (deep-link);
  panel "Salud del catálogo" con chips accionables (incluye `waMismatch` =
  WA activo pero despublicado); eliminar producto RECHAZA con 409 si tiene
  `order_items` (el CASCADE destruiría historial de pedidos — sugerir
  despublicar); importación CSV exige dry-run (vista previa crear/actualizar)
  antes de aplicar; publicación programada (`publish_at`/`unpublish_at`,
  00096) se aplica en el job `scheduled-publishing` del cron diario ANTES
  del `whatsapp-sync-queue`, y el toggle manual de visibilidad limpia la
  programación pendiente.
- Productos ronda 3: feedback con toasts de éxito (no solo errores); Deshacer
  genérico del bulk (visibilidad/categoría/precio, 10 s); bulk delete omite
  productos con pedidos (misma regla 409 que el delete individual);
  `admin_note` (00098) es solo-admin — nunca exponerla en APIs públicas;
  la galería `products.images` es admin-only (la tienda no la renderiza):
  marcar ★ sincroniza `image_url`.
- Productos ronda 4: eliminar es SOFT DELETE (`deleted_at`, 00099) — nunca
  hard delete desde el panel; la papelera se filtra con `trash=1` y
  restaurar deja el producto despublicado; todos los list/counts excluyen
  `deleted_at` por defecto. La generación con IA (descripción/imagen) es
  best-effort vía kie-ai: si KIE_AI_API_KEY falta, se muestra el error sin
  romper el modal.
- Productos ronda 5: `sort_order` (00100) es el orden de la tienda (los ↑↓
  normalizan a pasos de 10 solo cuando hay empates); `stock_quantity`
  (00101) deriva `stock_status` al editarse (0=agotado, ≤5=bajo) — la tienda
  sigue leyendo `stock_status`; `cost` (00102), `seo_*` (00104) y la función
  RPC `search_product_ids_fuzzy` (00103, pg_trgm) tienen fallback si la
  migración falta (degradan, no rompen).
- Productos ronda 6: `product_stores` se gestiona con borrar-y-reinsertar
  (override vacío = precio del catálogo); la pausa temporal (⏸) fija
  `publish_at` en el MISMO PATCH que `is_visible=false` (la regla de
  cancelar programación respeta fechas explícitas); la generación IA en
  lote va en tandas de 10 secuenciales y el QR se genera client-side
  (nunca en servidor).
- Productos ronda 7 — identidad: `sku` (00106) es único entre productos no
  borrados (índice parcial; un SKU duplicado responde 409) y `barcode` es
  solo índice. La búsqueda del panel pasa por `search_product_ids_fuzzy`
  (00110) que puntúa SKU (exacto > prefijo > substring) y código de barras
  por encima de la similitud de nombre; si la migración falta, el fallback
  `.or(name.ilike, sku.ilike, barcode.ilike)` degrada sin romper.
  `products.tags` es JSONB (`?|` en la RPC de colecciones) y es la fuente
  única de las colecciones de la tienda: agregar/quitar en lote siempre
  reescribe el array completo.
- Productos ronda 7 — umbral de stock: `low_stock_threshold` (00108) manda
  sobre el 5 hardcodeado. Con cantidad numérica, `stock_status` SIEMPRE se
  deriva (cantidad vs umbral, en create/update/modal/panel); un estado
  manual solo sobrevive con la cantidad vacía. `restock.ts` calcula la
  cantidad sugerida (cobertura de 30 días) — el panel solo la muestra.
- Productos ronda 7 — degradación en ESCRITURA: `create`/`update` también
  degradan si falta una columna de la ronda. Ojo: una columna ausente da DOS
  errores distintos y `isMissingColumnError` (`sale-window.ts`) cubre ambos —
  lecturas `42703` ("column ... does not exist", lo detecta Postgres) y
  escrituras `PGRST204` ("Could not find the '...' column ... in the schema
  cache", lo detecta PostgREST antes de Postgres y NO trae "does not exist").
  Sin el `PGRST204` un `INSERT`/`PATCH` fallaba con 500 aunque la lectura
  degradara. `create` reintenta el insert sin el umbral; `update` relee la
  fila actual sin el umbral (el diff de la bitácora lo omite) y reintenta el
  PATCH sin él. El modal envía SIEMPRE el umbral (y `related_product_ids`,
  `sku`, `barcode`, `sale_*`, `tags`), así que la degradación es
  responsabilidad del servidor: no se puede inferir "campo ausente" desde el
  payload.
- Productos ronda 7 — imágenes: la detección de rotas es un HEAD con
  fallback a GET `Range: bytes=0-0` (403/405/501 ⇒ reintento), timeout 8 s y
  concurrencia 6; nunca bloquea el listado. `image_url` acepta `null` para
  poder quitar una imagen rota (la tienda cae al placeholder).
- Productos ronda 7 — papelera: la retención es de 30 días (`trash.ts`) y la
  purga (`purge-trash`, cron diario + botón) es el ÚNICO hard delete
  permitido; el DELETE CASCADE de `order_items` es la razón por la que
  eliminar desde el panel sigue siendo soft delete.
- Productos ronda 7 — historial: el PATCH guarda `detail.before/after` con
  solo los campos de `AUDIT_FIELDS`; `audit-diff.ts` es la fuente única de
  las etiquetas y del formateo (los registros viejos traen `updates` plano y
  caen al fallback). `related_product_ids` se sumó a `AUDIT_FIELDS` en la
  ronda 8 (B2): antes sus cambios no generaban diff. `cost` está, y
  `low_stock_threshold` se omite del diff mientras 00108 falte.
- Productos ronda 7 — IA: `bulk-seo` SOLO devuelve propuestas (nunca
  escribe); la escritura pasa por el PATCH normal tras la vista previa
  editable. El prompt SEO vive duplicado en `seo-batch.ts` y en
  `ProductFormModal` (máx 60/160 vs 70/170) — al cambiar uno, cambiar el otro.
- Productos ronda 7 — reporte de ventas: el CSV conserva columnas previas y
  solo agrega (paridad con la importación); el margen se calcula con
  `products.cost` y queda VACÍO (no 0) cuando falta el costo — `missingCost`
  lo reporta aparte y el `marginPct` agregado se calcula solo sobre el
  subconjunto con costo. La clase ABC usa el punto medio de la banda
  acumulada de ingreso (A < 80 %, B < 95 %, resto C). `format=json` es
  aditivo y alimenta el resumen del rango.
- Productos ronda 8 — orden por más vendidos: `sort=sales` ordena en Postgres
  **antes** de paginar, así que no puede resolverse en JS tras el `range()`
  (traería el catálogo entero). `products` no tiene columna de ventas y
  PostgREST no ordena por agregados de `order_items`, así que la lectura usa la
  vista `products_with_sales` (00116: `p.*` + `sales_units` + `sales_revenue`).
  Es un reemplazo directo de `products` para el `select`, los filtros y el
  `count: "exact"`.
  La semántica de ventas es la del reporte: pedidos con `status <> 'cancelled'`
  (si se cambia una, cambiar la otra). `sales_units` es NULL —no 0— cuando el
  producto no vendió, para que `DESC NULLS LAST` deje los no vendidos al final;
  la app lo pinta como 0.
  El orden vive en `src/lib/admin-product-sort.ts` (fuente única, junto a
  `parseProductSort`/`nextProductSort`/`productSortOrderClauses`): al añadir o
  tocar un criterio de orden, es ahí donde se toca. Cada clave tiene su
  dirección por defecto (`defaultProductSortDir`): `sales` abre en `desc` (los
  más vendidos primero), el resto en `asc`.
  Degradación en DOS capas, y ambas deben seguir funcionando: (1)
  `clampProductSortToColumns(..., { hasSales })` convierte `sales` en el orden
  por defecto si la vista no está disponible; (2) la ruta detecta la vista
  ausente con `isMissingRelationError` (`PGRST205`/`42P01`, que hay que
  comprobar ANTES de `isMissingColumnError` porque este acepta cualquier
  "does not exist"), reintenta contra `products` y marca `schemaDrift` (aviso
  ámbar). Nunca un 5xx.
  La columna "Ventas" (header) y el `<select>` de orden aplican el mismo
  criterio: `GET /api/admin/products/row-meta` excluye cancelados
  (`orders!inner(status)`) para que el número mostrado coincida con el orden.
- Productos ronda 8 — escritura masiva (B2): `POST /api/admin/products/bulk` es
  la ÚNICA vía de edición en lote. Ninguna acción debe volver a hacer fan-out de
  `N × PATCH /update`. Acepta `{ids, patch}` (el mismo parche para todos)
  **XOR** `{ids, patches: {"<id>": {...}}}` (un valor por producto; un id
  desconocido o ausente es 400 con el error prefijado `patches[<id>]: `). Los
  ids se deduplican y hay tope de `MAX_BULK_IDS`; las escrituras van en trozos
  de `BULK_CHUNK` **agrupadas por `JSON.stringify(patch)`**, así que un lote de
  500 con el mismo parche es una sola sentencia. Cada `update()` lleva
  `.select("id")` obligatorio: sin él PostgREST responde 204 aunque el id no
  exista y el panel reportaría como actualizados productos que nunca tocó. El
  whitelist de campos vive en `src/lib/product-patch.ts`
  (`validateProductPatch`, compartido con `/update`) y las reglas puras en
  `src/lib/product-bulk.ts` — nunca en el `route.ts`, que **solo puede exportar
  handlers HTTP** (exportar helpers ahí rompe el build de Next). El lote deja
  **una** entrada de bitácora (`product_bulk_update`) agrupada, no N.
  Siguen siendo por producto (no migrar a `/bulk`): borrar, duplicar, generar
  imágenes, `applySeoBatch`, merge, purga de papelera y `bulkSaveImage`, porque
  cada uno tiene efectos propios por fila.
- Productos ronda 8 — conteos y disponibilidad (B1): los contadores de los
  chips (estado, categoría, "sin ciudad", papelera…) se calculan en Postgres con
  la RPC `admin_product_filter_counts` (00115: 5 índices + `jsonb`), una sola
  llamada por listado; `list/route.ts` cae al `categoryTally` en JS si la RPC no
  está (proyecto sin migrar) y **nunca** responde 5xx por eso. Al añadir un
  filtro con contador hay que tocar la RPC **y** el fallback: son dos caminos,
  no uno. La lista de ids de "sin ciudad" ya no se trunca.
  La disponibilidad por ciudad se sirve **por página** con
  `GET /api/admin/products/city-availability?ids=…` (antes el panel descargaba
  `product_city_availability` entera): el estado es un
  `Record<productId, number>` y el modal la pide al abrirse. `PATCH` sobre esa
  misma ruta sí deja bitácora (`product_city_availability`) — era la única
  mutación del panel sin auditoría.
- Productos ronda 8 — orden, deep-links y diálogos (B3): el orden vive en
  `src/lib/admin-product-sort.ts` (fuente única compartida por el cliente y
  `list/route.ts`); `aria-sort` va en el `<th>`, **nunca** en el `<button>` de
  dentro, y el contenedor de tabla/grid lleva `aria-busy` + `opacity-60`
  mientras refetchea, más una región `role="status"` que anuncia el resultado.
  Todo filtro viaja en la URL (`brokenImage` incluido) para que un enlace
  pegado reproduzca la vista; `clearFilters` delega en
  `clearedProductFilters()` para que añadir un filtro no lo deje fuera. Las
  confirmaciones destructivas usan el diálogo accesible con foco atrapado:
  `window.confirm`/`window.prompt` están prohibidos en esta página.
- Productos ronda 8 — lotes largos (B4): toda acción masiva ofrece deshacer
  (`setUndoAction`, incluidas WhatsApp, unidad, visibilidad, ofertas, etiquetas,
  categoría, precio y disponibilidad) y los lotes muestran barra de progreso
  (`aria-valuenow`/`aria-valuemax`) con **cancelar** y un resumen de fallos
  parciales. `postBulk`/`bulkPatchEach` nunca lanzan: convierten el error en
  entradas `failed` por id, para que el panel diga cuántos fallaron en vez de
  morir a medias.
- Productos ronda 8 — estructura y pruebas (B5): la página pasa de 6 000 líneas,
  así que la lógica nueva NO se escribe inline. Estado y reglas puras viven
  fuera: `src/lib/admin-product-filters.ts`, `-list.ts`, `-selection.ts` y
  `-bulk-run.ts` (con sus `.test.ts`), más los hooks de cliente
  `src/app/admin/productos/use-product-selection.ts` y `use-bulk-runner.ts`.
  Regla: si una función se puede probar sin React ni Supabase, va a
  `src/lib/`. La cobertura de `/admin/productos` es por capas — unitarias de los
  módulos puros + `e2e/admin-productos.spec.ts` (guardas de API para anónimos y
  robustez de deep-links, etiquetadas `@ci`). Queda pendiente (diferido a
  propósito) extraer `useProductFilters` y separar tabla/modales en archivos
  propios: el objeto `filters` depende de 18 átomos de estado, así que el
  corte toca el centro de `page.tsx`; el parseo, la serialización a URL, la
  query de la API y el conteo de filtros activos ya viven en
  `src/lib/admin-product-filters.ts`, que es la parte con reglas.
- Productos ronda 9 — UX del modal de producto (B6-B10): `ProductFormModal` es
  la superficie con más campos del panel, así que sus invariantes son cuatro.
  (1) **Índice y secciones**: `FORM_SECTIONS` es la fuente única de las 7
  secciones y cada `<fieldset>` debe conservar su `id="pf-sec-*"`; el
  `IntersectionObserver` observa el **cuerpo scrolleable del modal**
  (`data-pf-scroll`), nunca la ventana, y `goToSection` es el único camino para
  saltar (respeta `prefers-reduced-motion`). (2) **Diálogo**: `role="dialog"` +
  `aria-modal` + foco atrapado con Tab/Shift+Tab + `Escape` + bloqueo del
  `body.overflow` restaurado al desmontar; el foco inicial va al diálogo, no a
  un input (en móvil desplegaría el teclado). (3) **Nunca se pierde lo
  escrito**: `dirty` sale de `snapshotKey(FormSnapshot)` contra `baselineRef`
  (capturado una sola vez) y decide el chip "Cambios sin guardar", el
  `beforeunload` y la confirmación de descarte; si un campo nuevo debe contar
  como cambio, va en `FormSnapshot`, y si no debe contar, no entra. (4)
  **Validación completa**: `handleSubmit` acumula TODOS los errores antes de
  enviar y enfoca el primero vía `PRODUCT_FIELD_INPUT_IDS` (mapa campo → `id`),
  nunca con `document.querySelector`. Las reglas son puras y viven fuera del
  componente en `src/lib/product-form.ts` (`validateProductForm()`, regla B5):
  los cambios de validación van ahí y se cubren en
  `src/lib/product-form.test.ts`, no dentro del modal. Además deben espejar
  `create`/`update`: al cambiar una allí, cambiar la otra. El error de campo se
  pinta con `fieldCls`/`fieldA11y` y se retira con `clearFieldError` en el
  `onChange` — un error que no se limpia al corregir el campo es un bug. (5)
  **Errores del servidor con campo**: `create`/`update` devuelven `field` cuando
  rechazan (400 de `validateProductPatch`, 409 de SKU duplicado) y el modal lo
  traduce con `formKeyForServerField` (`src/lib/product-form.ts`) para marcarlo
  con `markServerField`; si se añade una regla de validación al servidor, esa
  regla debe traer su `field` y su entrada en el mapa, o el error volverá a
  caer solo en el aviso general. El contrato de esos `field` lo fija
  `src/lib/product-patch.test.ts` (una prueba por rama). (6) **Un solo
  `role="alert"`**: el resumen de validación. `FieldError` NO lleva `role` —con
  9 campos mal serían 9 alertas encima del resumen—: los errores de campo se
  anuncian al enfocar su control vía `aria-describedby`. (7) **"Guardar y
  cerrar"**: cierra el aviso (`setConfirmingClose(false)`) **antes** de llamar a
  `submitForm()` —invertir el orden deja la barra de descarte tapando los
  errores de validación— y la acción primaria va al final de la barra. El modal
  no se cierra solo al guardar: lo cierra el padre desde `onSaved`.
- Productos ronda 10 — conteos de los chips (B15-B16): la RPC
  `admin_product_filter_counts(p_include_deleted)` (00118) es la v2 de la de la
  ronda 8 y devuelve los 11 contadores + `brands` + `tagCounts` en una sola
  llamada. Ojo con dos trampas: `p_include_deleted` es el INVERSO de
  `withDeletedAt` (esa variable significa "la tabla tiene la columna
  `deleted_at`", no "incluir borrados") y el descarte de una RPC v1 lo decide
  `parseProductCountsPayload` (`src/lib/admin-product-counts.ts`) exigiendo
  `brands` array **y** `tagCounts` objeto — sin esa comprobación, un proyecto con
  00115 aplicada y 00118 no daría conteos vacíos en silencio. La migración trae
  además `idx_admin_audit_log_entity` para el historial por producto. Sigue
  valiendo la regla de la ronda 8: al añadir un filtro con contador se tocan la
  RPC **y** el fallback en JS.
- **Versiones de migración únicas** (incidente 00118/`42P01`): el CLI de
  Supabase identifica cada migración por su versión, así que **dos archivos con
  el mismo prefijo `NNNNN` solo aplican uno** y el otro se queda sin registrar
  (sin error, sin aviso). Pasó con `00078` (`00078_admin_audit_log.sql` vs.
  `00078_foodos_modifiers_dinein.sql`): la bitácora `admin_audit_log` nunca
  existió, `logAdminAudit()` fallaba en silencio (es best-effort), el historial
  de un producto daba 500 y `00118` abortaba en su `CREATE INDEX` con `42P01`.
  Por eso: (1) `00078_admin_audit_log.sql` → **`00072_admin_audit_log.sql`** y
  `00065_refund_dispute_cashback_reversal.sql` → **`00135_…`** (se renumeró el
  archivo que el CLI NO tenía registrado; renumerar el registrado lo reejecuta y
  falla por objeto duplicado); (2) toda migración que crea o referencia
  `admin_audit_log` es idempotente (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX
  IF NOT EXISTS`, `DROP POLICY IF EXISTS` antes de la política) y `00118` crea su
  índice dentro de un `DO $$ … to_regclass … $$` para que una sola sentencia de
  índice no pueda tumbar la RPC de conteos; (3) `src/lib/migrations.test.ts`
  falla si vuelve a haber dos archivos con la misma versión.
- Productos ronda 10 — CSV con una sola cabecera (B17): `src/lib/product-csv.ts`
  es la fuente única de la cabecera y las celdas del CSV de productos, y el
  import valida contra ella (`PRODUCT_IMPORT_HEADER`, `validateImportColumns`,
  `describeImportColumns` en `src/lib/product-import.ts`). Un CSV sin `nombre` o
  `precio` responde 400 ANTES de tocar la base y el modal lo avisa en ámbar
  bloqueando la vista previa: el problema no se puede descubrir a mitad de la
  importación. Al agregar una columna, va en el lib y en su `.test.ts` (hay una
  prueba de ida y vuelta export → import).
- Productos ronda 10 — escritura optimista (B19): la versión de una fila es
  `products.updated_at`, con el trigger `products_touch_updated_at` (00119) para
  que cualquier escritura —no solo la del panel— la mueva; el PATCH además la
  sella explícitamente para funcionar antes de aplicar la migración. `PATCH
  /update` acepta `expectedUpdatedAt` y responde **409 `stale_write`** con
  `conflict.current` (la fila actual) en vez de sobreescribir; `POST /bulk`
  acepta `expected` (mapa id → versión) y `force: true`, y **excluye** los ids
  stale antes de agrupar los parches, devolviéndolos en `stale` y en `failed`.
  Regla del módulo `src/lib/product-conflict.ts`: solo `actual > esperada` es
  conflicto — fecha ausente o inválida, o `expected` no enviado, NUNCA bloquean
  (compatibilidad con cualquier cliente viejo). El panel adopta la versión que
  devuelve el servidor y, ante un 409, muestra un banner ámbar con "Recargar" en
  vez de perder el trabajo.
  Traspaso **cerrado en la ronda 12**: `ProductFormModal` ya manda la versión
  con la que abrió y pinta el 409 con `conflictFromResponse`.
- Productos ronda 10 — vistas guardadas (B20): una vista es la **query canónica
  del listado** (filtros + orden + tabla/tarjetas + tamaño de página), no un
  formato paralelo. `src/lib/product-filter-presets.ts` la normaliza (sin `page`,
  sin valores vacíos, parámetros ordenados), así que dos URLs equivalentes se
  reconocen como la misma vista; tope de 8 (cae la más antigua), reemplazo por
  nombre sin distinguir mayúsculas y migración del formato anterior
  (`resurte-admin-product-views` → `admin-productos-vistas`) para no borrar lo
  que el admin ya tenía guardado. La vista sin filtros es válida ("Catálogo
  completo"). En `page.tsx` la query actual se arma con `filters` + `view` +
  `sort` + `pageSize` y los mismos helpers que la URL: no volver a enumerar los
  18 filtros a mano, que era justo la duplicación que este frente eliminó.
- Productos ronda 10 — cobertura de rutas (B18): cada ruta de
  `/api/admin/products` tiene su `route.test.ts` (11 nuevos). Fijan el contrato
  ACTUAL, incluidas las degradaciones que hoy son un 500 y no deben cambiarse sin
  decidirlo: `delete` con JSON inválido o sin `deleted_at`, `audit` si falta
  `admin_audit_log` (devuelve 500, no lista vacía) y `bulk-seo`, que responde 200
  con los fallos por producto en `failed[]`.
- Productos ronda 11 — el modal de producto no puede mentir (B22-B24). Tres
  reglas, todas con su lógica pura fuera del componente:
  `resolveSubmittedStockStatus(quantity, threshold, manual)` (`src/lib/stock.ts`)
  devuelve `{ status, derived }` y es **la única** derivación del estado de
  stock: `submitForm` la usa para enviar y el `<select id="pf-stock">` la usa
  para pintar. Antes el select mostraba `stockStatus` (la selección manual)
  mientras se enviaba el derivado, así que el admin elegía "Agotado", el
  guardado escribía "En stock" y la pantalla nunca lo contaba. Con la
  derivación mandando el select va **deshabilitado** y con
  `aria-describedby="pf-stock-hint"`; las unidades no enteras o negativas
  (texto a medio escribir) **no** cuentan como control de inventario, para no
  congelar el select mientras se teclea. `analyzePricing(...)`
  (`src/lib/product-pricing.ts`) devuelve margen, markup, precio efectivo,
  estado de la oferta y los avisos; los cortes del margen (30 / 10, en
  `MARGIN_GOOD_PCT`/`MARGIN_WARN_PCT`) son los **mismos** que la columna "Margen"
  del catálogo: si se cambian allí, se cambian aquí. Los dos avisos
  (`below_cost`, `sale_not_a_discount`) son **no bloqueantes** —el admin puede
  guardar igual— y `sale_not_a_discount` distingue `>` (la tienda cobraría el
  precio "de oferta", más caro) de `==` (igual al normal): una `sale_price` ≥
  `price` sí se aplica en la tienda, y ese es justo el error que hay que evitar.
  El `id` de cada aviso lo resuelve `pricingWarningId(key)`, no el componente:
  las claves van en snake_case (`below_cost`) y un `id` de HTML no debe llevarlo,
  y los playbooks y los e2e citan `pf-warn-below-cost` por nombre — si el id se
  armara a mano en el JSX, documentación y pantalla se separarían en silencio.
  `fieldA11y(key, ...hints)` concatena el id del error con los de las pistas
  estáticas (`pf-stock-hint`, `pf-qty-hint`, `pf-threshold-hint`, `pf-margin`,
  `pf-warn-*`): al añadir una pista, pasarla por ahí — publicar
  `aria-describedby` a mano tapa el `pf-err-<campo>` y el error deja de
  anunciarse. Al cerrar la ronda se encontró que el servidor ya devolvía
  `field: "stock_status"` (400 de `src/lib/product-patch.ts`) pero
  `SERVER_FIELD_TO_FORM_KEY` no lo traducía: el error caía en el aviso general
  sin marcar el select. Ahora está mapeado **y** con `id` en
  `PRODUCT_FIELD_INPUT_IDS`, y hay una prueba que exige que toda columna
  traducida tenga control: si añades una al mapa, añádela también al de ids.
  Traspaso **cerrado en la ronda 12** (abajo).
- Productos ronda 12 — guardar el formulario completo ya no pisa cambios ajenos
  (B25-B26). La ronda 10 dejó la escritura optimista para imagen, SEO y guardado
  rápido, pero el modal —el único que escribe **todas** las columnas— seguía
  mandando su `PATCH` sin versión previa: el último en guardar ganaba en
  silencio y el admin leía "Guardado" sobre datos que ya no eran suyos. Reglas
  de esta ronda:
  - El modal manda `expectedUpdatedAt` con la versión de la fila **cargada**
    (`product.updated_at`), no con la del último guardado propio. `page.tsx` no
    hubo que tocarlo: el `COLS` del listado ya incluye `updated_at` y
    `handleFormSaved` mezcla el `updated_at` que devuelve `onSaved`, así que la
    versión vuelve sola al estado del catálogo.
  - Un **409 `stale_write`** es un **panel**, no un error de campo. Se distingue
    con `conflictFromResponse`, no con `res.status === 409`: el servidor también
    responde 409 por SKU duplicado y ese sí debe marcar su campo con
    `markServerField`. Confundirlos hacía que un SKU repetido pintara un panel de
    conflicto y que un conflicto real marcara un campo inexistente.
  - Con el panel abierto **no se puede guardar** y el trabajo no se pierde:
    `requestSave()` corta cualquier envío mientras `staleWrite` siga vivo (el
    botón de envío queda `disabled` con un `title` que lo explica) y las dos
    salidas son explícitas —"Recargar y descartar lo mío" o "Guardar lo mío"—
    en vez de una redirección silenciosa.
  - El diff es a **tres bandas**: `summarizeWriteConflict({ loaded, payload,
    current })` compara lo cargado, lo que este formulario va a enviar y la fila
    actual, y separa `changes` (ambos lo tocaron: choque real) de `untouched`
    (solo lo tocó el otro: se conserva sin preguntar). `adoptTheirs` recompone el
    payload para que los campos que este formulario **no** editó tomen el valor
    del otro — eso es literalmente "Guardar lo mío": no hay que reescribir la
    fila, solo dejar de pisar lo que no era nuestro. Se recalcula en cada render,
    así que el panel se actualiza mientras el admin sigue escribiendo.
  - La comparación es **tolerante** a propósito (`100` = `"100"`, `null` =
    `undefined`, `*_at` por fecha parseada, listas por contenido): avisar de un
    conflicto que no existe es peor que no avisar, porque entrena al admin a
    ignorar el panel. Y los campos que el servidor **no** devuelve en
    `conflict.current` (`description`, `unit`, `publish_at`, `unpublish_at`,
    `images`, `admin_note` — están en `PRODUCT_UPDATE_FIELDS` pero no en
    `PRODUCT_AUDIT_FIELDS`) se **omiten** en vez de reportarse como choque: el
    panel solo puede hablar de campos auditables, y eso es una limitación del
    servidor, no del modal.
  - El dinero del diff usa `formatMoney` (**es-MX**, el del catálogo), **no**
    `formatAuditValue` (es-CO: `$90,00`). Reusar el formateador de la auditoría
    aquí haría que el mismo precio se leyera distinto en dos pantallas
    contiguas.
  - El `role="alert"` lleva **texto fijo** ("No se guardó: otro usuario modificó
    este producto mientras lo editabas") y el detalle variable va fuera: el
    detalle cambia con cada tecla y anunciarlo en cada pulsación es ruido puro.
  - Sin animaciones en el panel (reduced motion) y con `aria-labelledby` /
    `aria-describedby` al título y al detalle, siguiendo las reglas del diálogo.
  - `rememberBaseline(payload, updatedAt)` actualiza la base tras cada guardado
    bueno: un **segundo** choque se compara contra lo que de verdad se guardó y
    no contra la fila original, que si no reportaría como choque lo que el propio
    admin acaba de escribir.
- Productos ronda 13 — lecturas decorativas que degradan (B28-B32): la regla es
  **una lectura decorativa nunca tumba la superficie; una escritura siempre falla
  en voz alta**. `GET /api/admin/products/row-meta` pide tres fuentes que solo
  alimentan columnas de adorno (cola de WhatsApp, última edición, ventas): cada
  una degrada por su cuenta y el resultado declara las que fallaron en
  `degraded: ("queue"|"audit"|"sales")[]` — la composición es pura y vive en
  `src/lib/admin-product-row-meta.ts`, así que el contrato se prueba sin mocks.
  El panel avisa en una franja ámbar (`metaDegraded`, `role="status"`) en vez de
  mostrar columnas vacías sin explicación, y si la petición entera falla declara
  las tres. Las ventas se leen de la **vista** `products_with_sales` (00116), no
  agregando `order_items`: una fila por producto, sin recorte silencioso al
  `max-rows` de PostgREST y con `idx_order_items_product` de apoyo; `sales_units`
  y `sales_revenue` llegan como `numeric` (cadena en algunos caminos), así que se
  normalizan con un `toNumber` tolerante a `null`. `MAX_META_IDS` (200) coincide
  con el tamaño de página máximo del panel y al excederlo se emite
  `logger.warn("products.row-meta.truncated")` en vez de recortar en silencio.
  `GET /api/admin/products/audit` sigue la misma regla: si `admin_audit_log` no
  existe devuelve `200 { entries: [], degraded: true }` (la bitácora es una
  lectura, no un write path) y reserva el 500 para fallos de auth/admin.
  El cuerpo JSON de las rutas de escritura se lee con `readJsonBody`
  (`src/lib/api-body.ts`): un body ausente, vacío o malformado es **400**, no 500
  — `await request.json()` dentro del try hacía que un cliente con un body roto
  pareciera un fallo del servidor (y ensuciaba `error_logs`).
  Los contadores de chips tienen **un solo contrato con la RPC** y está probado
  contra el SQL: `src/lib/admin-product-counts.contract.test.ts` lee `00118`,
  exige las 17 claves del `jsonb_build_object` y que el lector las mapee todas, y
  fija la discriminación v1/v2 (`brands` array + `tagCounts` objeto **plano**;
  un array cumple `typeof === "object"` y colaría como v2 válida, dejando el
  panel con cero etiquetas y sin fallback).
- Sync de catálogo WhatsApp (WA1-WA7): la DB es fuente única; el sync NUNCA
  borra en Meta sin confirmación explícita (`deleteUnknown`); los cambios de
  producto se propagan por la cola `whatsapp_sync_queue` (cron diario) y todo
  sync registra un run en `whatsapp_sync_runs`. Los productos de Meta viven
  bajo el `catalog_id` (`items_batch`), no bajo la WABA.
- Observabilidad del sync (WB1-WB5): los batches asíncronos de Meta se
  resuelven vía handles → `whatsapp_sync_items` (ok/error por producto); los
  errores se reintentan individualmente desde el historial; runs `running`
  > 6 h se marcan `failed` (huérfanos) en el cron diario.
- Automatizaciones (WC1-WC4): el motor (`whatsapp-automations-engine.ts`)
  SIEMPRE lee `whatsapp_automations` antes de enviar (is_active, delays,
  config); dedupe por `whatsapp_automation_sends.dedupe_key`; marketing
  (reactivation, birthday) respeta `marketing_consent`.
- Credenciales por catálogo (WC8): el token se cifra con `encryptToken`
  (AES-GCM) y nunca sale del servidor; vacío = fallback a la WABA de
  plataforma.
- Explorador Meta (WD1-WD4): la lectura del catálogo vivo usa
  `compareMetaVsStore` como fuente única de verdad para chips de estado;
  corregir una fila = push individual (`pushWaProductToMeta`), nunca un
  sync completo implícito.
- Acciones directas sobre Meta (WE1-WE4): disponibilidad de un producto
  que existe en tienda SIEMPRE actualiza `products.stock_status` primero
  (DB fuente única) y luego empuja; productos "solo en Meta" se operan
  directo en Meta. Eliminar de Meta nunca borra el producto de la tienda.
- Distribución (WF1-WF3): los enlaces wa.me usan `display_phone`
  (normalizado por `normalizeMxPhoneForWaMe`); la difusión respeta
  `marketing_consent`, tope de 200 y dedupe por día en
  `whatsapp_automation_sends`.

- Productos — móvil: la página vive en el contenedor `max-w-7xl mx-auto px-4
  sm:px-6` (como el resto del área); la barra de 7 acciones se parte en CTA
  primario + menú "Más" (`role="menu"`) por debajo de `sm`; los bloques de
  diagnóstico (alertas de inventario, salud del catálogo, filtros secundarios)
  se pliegan con `MobileCollapsible` (un solo árbol de render ⇒ sin mismatch de
  hidratación); la vista por defecto es **grid en móvil** y **tabla en
  escritorio** (`resolveProductsView` en `src/lib/admin-products-view.ts`,
  derivada con `useMediaQuery` — nunca con un efecto, `set-state-in-effect`),
  y un `?view=` explícito o una elección del usuario manda sobre el default.
  La tabla conserva todas sus columnas en `md+` y oculta las secundarias por
  debajo (`hidden md:table-cell`, pares `th`/`td`). Todo control móvil nuevo
  lleva `touch-target` (44px).

- Productos — barra de acciones masivas (sticky): la barra que aparece con la
  selección se ancla **debajo del sub-nav y de la fila de categorías** con
  `sticky z-20
  top-[calc(var(--header-top-offset)+var(--admin-subnav-h)+var(--admin-catbar-h))]`;
  el sub-nav es `z-40`, la fila de categorías `z-30` y el header global `z-50`,
  así que `z-20` la deja por debajo de los tres (y de los modales `z-50` de la
  página). `--admin-subnav-h` lo publica
  `AdminSubNav` (`sub-nav.tsx`) midiendo su propio `offsetHeight` con un
  `ResizeObserver` y escribiéndolo en `document.documentElement` (mismo patrón
  que `--toast-stack-h` de `toast.tsx`); el default de la var en `globals.css`
  (45px = el alto medido del sub-nav: 28px de píldoras + `py-2` + borde) cubre
  el primer render sin JS sin salto al hidratar. No hardcodear el offset del
  sub-nav: cambiar el sub-nav (fuente, badges, `AdminNotificationCenter`) o el
  header auto-oculto (`body.header-hidden` ⇒ `--header-top-offset: 0px`) debe
  seguir funcionando sin tocar la barra. En móvil la barra es **una sola fila
  con scroll horizontal** (`overflow-x-auto`, sin wrap) con el contador
  `shrink-0`, padding vertical reducido (`py-1.5`), `touch-target` y
  `whitespace-nowrap` en cada acción — sin el `whitespace-nowrap` las etiquetas
  se parten en varias líneas y la barra pasa de 58px a >300px de alto; en
  `sm+` recupera el wrap y el padding originales.

- Productos — filtro por categoría: conviven **dos controles** y ambos deben
  mantenerse sincronizados. (1) El `<select>` "Todas las categorías" de la barra
  de filtros plegable (`aria-label="Filtrar por categoría"`), pedido por el
  equipo — no eliminarlo. (2) Una fila de **chips con el conteo de productos de
  cada categoría** (`role="group"` + `aria-label="Filtros rápidos por
  categoría"`, `aria-pressed`), cada uno con el emoji de su categoría resuelto
  con `getCategoryIcon(c.icon, c.slug)` — misma fuente que la tienda, así que el
  chip nunca diverge del icono del catálogo; por eso las categorías se cargan
  con `select("id,name,slug,icon")` y `Category.icon` es obligatorio (también en
  `ProductFormModal`, y `/api/admin/categories/create` devuelve `icon` para que
  una categoría recién creada entre con su icono). La fila **copia el lenguaje
  visual de las píldoras de categoría de la tienda**
  (`src/components/shop/user-shop-view.tsx`, la referencia canónica de píldoras
  de categoría con icono): `rounded-full` blanco con borde `warm-200`
  (`#E8E9EB`) en reposo y verde WhatsApp sólido al activo (`bg-brand-500` =
  `#0E7A0E` + `shadow-md shadow-brand-500/20`), `px-4 py-2 text-sm
  font-semibold`, emoji + nombre + contador en `chipCountClass`
  (`text-[11px] font-bold tabular-nums`, `white/90` sobre el verde y `#6E737B`
  sobre blanco: ambos ≥4.5:1; **no** usar `white/80` ni `#8F939B`, que bajan de
  4.5:1). El texto de la píldora usa gris **explícito**, no `--text-secondary`:
  ese
  token se aclara en tema oscuro y el admin es una superficie clara fija, así
  que la píldora quedaría ilegible. Los dos controles usan
  `updateFilters` y limpian `onlyNoCategory`. El conteo lo sirve
  `categoryCounts` del listado (`categoryTally` en
  `route.ts`), que **pagina** hasta `CATEGORY_TALLY_PAGES` (10 × 1000) porque
  PostgREST corta en 1000 filas y una sola página subcontaría los chips;
  cuenta el catálogo acotado (respeta la papelera) y devuelve `{}` si la
  consulta falla (chips en 0, sin romper el panel). "Sin categoría" vive en
  los chips de estado (no duplicarlo en la fila de categorías) y usa
  `counts.noCategory`; activarlo limpia el chip de categoría y elegir una
  categoría limpia "Sin categoría", porque un producto sin categoría nunca
  cae en una categoría concreta y la combinación dejaría el listado vacío.
  El chip "Todas" usa `counts.catalogTotal`.

- Productos — fila de categorías (sticky): la fila queda pegada **debajo del
  sub-nav** con `sticky z-30
  top-[calc(var(--header-top-offset)+var(--admin-subnav-h))]`, una **sola línea
  con scroll horizontal en todos los breakpoints** (`flex` + `overflow-x-auto` +
  `snap-x snap-mandatory` + `snap-start` por píldora + `scrollbar-hide
  scroll-fade-x`; **sin** `flex-wrap`, a diferencia de los chips de estado, para
  que su alto sea estable y publicable). El sangrado a todo el ancho se hace con
  `-mx-4 px-4 sm:-mx-6 sm:px-6` dentro del `max-w-7xl mx-auto` del área, y el
  fondo es `bg-gray-50/95` + `backdrop-blur-md` — **`gray-50`, no el `#faf8f5`
  del `body`**: el shell de `/admin` es `bg-gray-50` (`admin/layout.tsx`) y con
  el otro tono la franja desentonaría. La fila publica su alto real en
  `--admin-catbar-h` (default `0px` en `globals.css`) con un `ResizeObserver`
  sobre `categoryBarRef` y deps **`[categories.length]`**: las categorías llegan
  por fetch, así que un efecto con deps `[]` correría antes de que exista el
  nodo; escribir la var con `setProperty` no es `set-state-in-effect`. Por eso
  la barra de acciones masivas se ancla **debajo de las dos filas**:
  `sticky z-20 top-[calc(var(--header-top-offset)+var(--admin-subnav-h)+var(--admin-catbar-h))]`.
  El orden de apilado es header `z-50` > sub-nav `z-40` > **categorías `z-30`**
  > **barra masiva `z-20`** > contenido: la barra va por debajo para que, al
  pasar, se deslice **por detrás** de las píldoras en vez de cortarlas con su
  borde superior. Medido: píldoras de 38px de alto (fila de 55px) en escritorio
  y **44px con `touch-target`** en móvil (fila de 61px); no hardcodear esos
  números, la var los sigue. En móvil la píldora lleva `touch-target` porque es
  el filtro principal y la fila está pegada (targets de 44px).

- Pedidos (`/admin/pedidos`) — acciones masivas: la selección vive en un
  `ReadonlySet<number>` y se **poda con `pruneSelection` dentro de un
  `useMemo`** (devuelve la MISMA referencia cuando no hay nada que podar, para
  no re-renderizar en bucle); nunca se poda con un efecto
  (`react-hooks/set-state-in-effect` es error). El checkbox del encabezado es
  indeterminado cuando la selección es parcial y solo abarca los pedidos
  **visibles** (la tabla pagina). Las reglas de elegibilidad son puras y viven
  en `src/lib/order-bulk.ts` — no duplicarlas en el componente:
  `canChangeStatusTo` excluye los estados terminales (`delivered`/`cancelled`),
  pero un pedido terminal **sí** se puede marcar a mano para corregirlo, así
  que la partición (`partitionForStatus`/`ForPayment`/`ForDriver`) devuelve
  `{eligible, skipped}` y la barra anuncia ambos conteos.
- Pedidos — el fan-out es **secuencial** contra `PATCH /api/orders/[id]/status`
  (no hay endpoint batch, a propósito): así se conservan los efectos por
  pedido (decremento de cupón, `payment_status: "failed"` al cancelar un
  pedido pendiente, workflows de WhatsApp, abono de cashback, auditoría) sin
  duplicarlos ni perderlos. No paralelizar: dispararía workflows simultáneos
  y golpearía Supabase. Agregar una acción masiva = agregar su predicado y su
  partición en `order-bulk.ts` + una función `bulk*` que reusa el `patchOrder`
  existente.
- Pedidos — `exportCsv(subset, suffix)` acepta un subconjunto: la barra exporta
  solo la selección (`pedidos-seleccion-YYYY-MM-DD.csv`) con las mismas
  columnas que el export completo. La cancelación masiva es la única acción
  destructiva y siempre pide `window.confirm` (`bulkCancelConfirmMessage`).

- Deep-links del dashboard: las alertas **no escriben su `href` a mano** — lo
  resuelve `buildAlertHref` (`src/lib/admin-alerts.ts`) y se ordenan con
  `sortAlertsBySeverity` (crítica → aviso → informativa). Parámetros aceptados:
  `/admin/pedidos` → `status` (allowlist `ORDER_STATUS_VALUES`), `q`, `from`,
  `to` (fechas ISO, validados; los helpers puros viven en `order-filters.ts`);
  `/admin/marketing` → `code` (enfoca el cupón sin distinguir mayúsculas,
  con banner dismissible y `scrollIntoView` que respeta
  `prefers-reduced-motion`); `/admin/productos` → `stock`/`view`/… (ronda 2).
  Todo parámetro se lee con `useSearchParams()` dentro de un `<Suspense>`, se
  valida contra una allowlist y se escribe de vuelta con `router.replace`
  (`{ scroll: false }`) — nunca con `useState` inicializado una sola vez ni
  con un efecto que fije estado (`set-state-in-effect` es error).
  La asignación de repartidor del dashboard reusa `canAssignDriver`
  (`order-bulk.ts`) y `activeDrivers` (`src/lib/drivers.ts`): no duplicar
  ninguna de las dos reglas.

- Desempeño de cada ciudad (`CityPerformance` en el dashboard, FASE 44): toda la
  aritmética (ventana, score, tiers, tips) vive en
  `src/lib/admin-city-performance.ts` — el componente y las actions **solo
  consumen**, nunca recalculan. El score es relativo al mejor de la ventana
  (0.4 ingreso + 0.25 pedidos + 0.2 tendencia + 0.15 cancelación) y una ciudad
  **sin pedidos puntúa 0**, por diseño: no puede compensar con tendencia ni
  calidad.
- Disponibilidad por ciudad: la semántica de `product_city_availability` es
  **por producto, no por ciudad** (00065): un producto **sin filas** está
  disponible en **todas** las ciudades; en cuanto existe ≥1 fila, solo lo está
  donde `is_available = true`. La cobertura por ciudad es
  `(visibles - restringidos) + disponibles_por_ciudad` — restar
  `no disponibles` invertiría el resultado y marcaría como catálogo vacío a
  cualquier ciudad sin excepciones. Espeja `get_available_product_ids`, que
  además exige `is_visible = true`.
- Las ventanas son las mismas que `getAdminPeriodComparison`:
  `mxMidnightUTC(-(days-1))` para el periodo actual y `mxMidnightUTC(-(2*days-1))`
  para el anterior, siempre sobre `created_at` (no hay `delivered_at`). El
  anterior se corta con `lt("created_at", currentStart)`.
- Cancelados: cuentan en `totalOrders`/`cancellationRate` pero **no** en
  `orders`/`revenue`; el ticket promedio es ingreso pagado / pedidos pagados.
- `days` se valida con la allowlist `isPeriodDays` (`7|30|90`, default 30) y
  **nunca** produce 5xx. Las rutas API usan `requireAdmin` y responden
  `no-store`; el tip de IA devuelve **503** (no 500) cuando falta
  `KIE_AI_API_KEY`, y el guard de admin se evalúa **antes** que la config. El
  cliente solo manda `{ cityId, days }`: el servidor recalcula el desempeño
  completo y busca la ciudad en `cities ∪ withoutOrders`.
- Lectura paginada (`CITY_PERF_PAGE_SIZE`/`CITY_PERF_MAX_ROWS`, 1000/20000)
  porque PostgREST corta en 1000 filas; al truncar, la UI avisa en vez de
  mostrar cifras incompletas.
- Los tips son **deterministas** (`buildCityTips`, 8 reglas con umbrales en
  constantes) y se ordenan con `sortAlertsBySeverity`; el tip de IA es
  **opcional y bajo demanda**, uno por ciudad, y jamás sustituye al
  determinista. Los `href` de los tips apuntan a superficies existentes
  (`/admin/productos?city=`, `/admin/pedidos?status=cancelled`,
  `/admin/marketing`, `/admin/whatsapp`); el tip informativo `referencia` no
  tiene enlace (`href: null`) y la UI no debe renderizar el "Ir" en ese caso.

## Verificación
`npm test` + entrar a /admin con cuenta admin: métricas por período, cambio de
visibilidad de un producto y confirmación de que el caché de catálogo se invalida.

Los KPIs de adopción y el override de nivel se prueban en
`src/app/admin/restaurantes.test.ts` (23 tests). `e2e/foodos.spec.ts` comprueba
además que `/admin/restaurantes` no renderice el error boundary ("Algo salió
mal") — el boundary de Next responde **200**, así que un status no sirve de
guard.

Ronda 7 (requiere 00106-00111 aplicadas): en `/admin/productos` buscar por SKU,
editar etiquetas, programar una oferta y ver que la ficha de tienda solo la
muestra dentro de la ventana, elegir relacionados, correr "Revisar imágenes",
"SEO con IA…" (debe abrir la vista previa, no escribir) y descargar el reporte
de ventas del rango (margen vacío donde falte `cost`).

Móvil de `/admin/productos`: a 375×812 y 320×568 el primer producto queda por
encima del pliegue, sin scroll horizontal, con la búsqueda visible y "Nuevo
producto" + "Más" alcanzables (44px); a 768/1440 se conserva la tabla con todas
sus columnas y las 7 acciones en la barra.

Orden por más vendidos (requiere 00116 aplicada; sin ella el panel sigue
funcionando en orden por nombre + aviso ámbar): en `/admin/productos` pulsar el
encabezado "Ventas" y comprobar que la primera fila es la de más unidades
vendidas, que la URL queda en `?sort=sales` y que la columna muestra la flecha
descendente; volver a pulsarlo invierte el orden y deja `dir=asc`. Recargar la
URL: debe seguir ordenado por ventas (la dirección por defecto es `desc`, así
que `?sort=sales` sin `dir` muestra primero los más vendidos). Los productos sin
ventas van al final con `desc` y al principio con `asc`, y su "Ventas" es 0 (no
vacío). Comprobar que el número de "Ventas" de un producto con pedidos
cancelados NO los cuenta. A 375×812 el encabezado "Ventas" está oculto: el orden
se cambia desde el `<select>` (elegir "Más vendidos" y ver que abre en `desc`).

Barra de acciones masivas sticky de `/admin/productos` (requiere sesión admin +
productos): seleccionar 2+ productos y bajar ~3 pantallas; la barra debe seguir
visible pegada justo debajo del sub-nav (sin taparlo ni tapar el header) y sus
acciones deben seguir funcionando desde ahí (abrir "Categoría…" y comprobar que
el modal queda por encima). A 375×812 la barra es una sola fila que desliza en
horizontal, con el contador visible y targets de 44px; a 768/1440 conserva el
wrap. Repetir con el header global oculto (scroll hacia abajo) para confirmar
que la barra sube con el sub-nav.

Fila de categorías sticky de `/admin/productos` (requiere sesión admin +
categorías): bajar ~3 pantallas y comprobar que la fila de píldoras se queda
pegada **justo debajo del sub-nav**, sin hueco ni solape, y que el contenido
pasa **por detrás** de ella (el fondo `bg-gray-50/95` cubre todo el ancho, de
borde a borde: si aparece una franja del color del `body` a los lados, el
`-mx-4 px-4 sm:-mx-6 sm:px-6` se rompió). Las píldoras deben verse como las de
la tienda: redondas, blancas con borde claro en reposo y verde WhatsApp sólido
con sombra al activo, cada una con su emoji y su conteo. A 375×812 la fila debe
ser de **una sola línea** (nada de wrap: la altura tiene que ser estable) que
desliza en horizontal con targets de 44px; en 1280 también es una sola línea,
con las píldoras que no caben accesibles por scroll. Seleccionar 2+ productos y
comprobar que la barra de acciones masivas aparece **debajo** de la fila de
categorías y que al bajar se desliza por detrás de las píldoras sin cortarlas.
Repetir con el header global oculto (scroll hacia abajo): las tres filas
(header/sub-nav/categorías) deben seguir pegadas entre sí. Con cero categorías
la fila desaparece y la barra masiva se ancla como antes (no debe quedar un
hueco).

Ronda 10 de `/admin/productos` (requiere 00118 y 00119 aplicadas; conviene
repetir con ellas ausentes para comprobar la degradación):
- Base de datos al día: `admin_audit_log` existe (la crea `00072`, renumerada
  desde `00078`), con `idx_admin_audit_log_entity`; `admin_product_filter_counts`
  devuelve las 17 claves (con `brands` y `tagCounts`, no las 4 de la v1); y
  `push_subscriptions` (00134) existe. Comprobación rápida:
  `select jsonb_object_keys(admin_product_filter_counts(false));` — si solo
  aparecen `categoryCounts`/`dupNameIds`/`noCitiesIds`/`underThresholdIds`, la
  RPC sigue en la versión de la ronda 8 y el panel está usando el cálculo en JS.
  Un `42P01` en una migración casi siempre significa que un archivo se quedó sin
  aplicar por versión duplicada: comparar `supabase/migrations/` con
  `supabase-list_migrations` antes de tocar nada.
- Contadores: con la RPC v2 aplicada, los chips (estado, categoría, sin ciudad,
  papelera, marcas, etiquetas) cuadran con lo que devuelve cada filtro y el
  listado hace **una** llamada; sin 00118 (o con la 00115 sola) siguen
  apareciendo, calculados en JS, y el listado no da 5xx.
- CSV: descargar el CSV y volver a importarlo sin tocar nada (la vista previa
  debe decir 0 cambios); quitarle la columna `nombre` y comprobar que el import
  responde 400 y el modal lo avisa en ámbar sin dejar aplicar.
- Escritura optimista: en el panel, guardar una edición rápida (imagen, SEO o
  campo rápido) de un producto que cambió por detrás → banner ámbar con
  "Recargar" en vez de pisar la fila. El contrato del lote (`expected`, `force`)
  se prueba por API, porque el panel todavía no lo manda:
  `POST /api/admin/products/bulk` con `expected` apuntando a una versión vieja
  devuelve el id en `stale` y en `failed`, y con `force: true` lo escribe igual.
- Vistas guardadas: filtrar por categoría + ordenar por ventas, guardar la
  vista, limpiar filtros y aplicarla: la URL debe reproducir la vista (con
  `pageSize`, sin `page`) y la píldora activa debe marcarse; pasar de 8 vistas y
  comprobar que cae la más antigua.
Automatizado: `npx playwright test e2e/admin-productos.spec.ts --grep @ci`.

Ronda 11 del modal de producto (B22-B24; requiere sesión admin):
- Stock honesto: abrir "Nuevo producto", elegir "Stock bajo" a mano y luego
  capturar **0** unidades → el select debe mostrar "Agotado" y quedar
  deshabilitado; con 2 unidades → "Stock bajo"; al vaciar las unidades vuelve a
  estar habilitado y conserva la última selección manual. Guardar con 0
  unidades y reabrir: el estado guardado debe ser el que mostraba el select.
- Margen en vivo: con precio 100 y costo 50 → `#pf-margin` dice 50% en verde;
  con costo 95 → 5% en rojo (mismo corte que la columna "Margen" del catálogo);
  con costo 120 → aparece `#pf-warn-below-cost` y el resumen de la cabecera
  ("1 aviso de precio"); corregir el costo lo hace desaparecer sin recargar.
- Oferta que no es descuento: precio 100 y oferta 120 → `#pf-warn-sale-not-a-discount`
  debe decir que la tienda cobraría 120, y **guardar debe funcionar igual**
  (los avisos no bloquean).
- Pistas anunciadas: con un campo en error **y** una pista (`#pf-price` con
  aviso, `#pf-stock` derivado), el `aria-describedby` del control debe listar el
  `pf-err-*` **y** el `pf-*-hint`; ninguno debe tapar al otro.
Automatizado: `npx playwright test e2e/admin-productos-modal.spec.ts --grep @ci`
(los casos nuevos se saltan solos sin `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`).

Ronda 12 del modal de producto (B25-B26; requiere sesión admin y una segunda
pestaña/API para mover la fila por detrás):
- Conflicto en el formulario completo: abrir la edición de un producto, cambiar
  el **precio** y, sin guardar, mover la fila por detrás (`PATCH` a
  `/api/admin/products/update` sin `expectedUpdatedAt`, o edición rápida en el
  catálogo). Al guardar debe aparecer el **panel ámbar**, no el aviso rojo, y el
  campo del precio **no** debe quedar marcado con error de campo.
- No se puede esquivar: con el panel abierto, el botón de envío está
  deshabilitado y su `title` lo explica; reintentar el envío no manda nada.
- "Guardar lo mío" conserva lo ajeno: el otro cambia **nombre** y este admin
  cambia **precio** → tras "Guardar lo mío" el precio guardado es el de este
  admin y el nombre es el del otro (no se pisa lo que no se editó). El panel debe
  decir "1 campo en conflicto" y listar el precio con "tú:" y "en la base:".
- El panel se recalcula: con el conflicto abierto, seguir escribiendo el precio
  debe actualizar la línea del diff sin recargar la página.
- SKU duplicado sigue siendo un error de campo: dos productos con el mismo SKU →
  el segundo guardado marca `#pf-err-sku` en rojo y **no** abre el panel ámbar.
- Dinero en es-MX: el diff debe mostrar `$90`, nunca `$90,00`.
- "Recargar y descartar lo mío" recarga la página y el valor mostrado es el de la
  base.
- Reduced motion: con `prefers-reduced-motion: reduce` el panel no anima.
Automatizado: `npx playwright test e2e/admin-productos-modal.spec.ts --grep @ci`
(el caso de conflicto se salta solo sin credenciales de admin). Ese caso cambia
**umbral de stock bajo** desde el modal y, por detrás, **título SEO** desde la
API —campos ambos de la auditoría, así que el diff los ve—; comprueba el panel,
que el envío queda bloqueado, que "Guardar lo mío" guarda su umbral y **conserva**
el título del otro, y restaura los dos valores en el `finally`. El módulo puro se
cubre aparte con `npx vitest run src/lib/product-write-diff.test.ts`.

Acciones masivas de pedidos (requiere sesión admin + datos): en `/admin/pedidos`
marcar un subconjunto y comprobar que el checkbox del encabezado queda
indeterminado; que el cambio de estado omite los pedidos terminales (la barra
lo dice); que cancelar en lote pide confirmación; y que "Exportar selección"
descarga solo las filas marcadas. Los guards sin sesión están automatizados:
`npx playwright test e2e/compartir.spec.ts --grep "acciones masivas"`.

Deep-links y repartidor (requiere sesión admin + datos): en `/admin`, la alerta
"N pedidos sin confirmar" debe abrir `/admin/pedidos` con el filtro "Pendientes"
aplicado y reflejado en la URL; la alerta de cupón por expirar debe abrir
`/admin/marketing?code=<cupón>` con el cupón resaltado (y poder quitar el foco);
la alerta de leads debe abrir `/admin/leads`. En "Pedidos recientes", asignar y
desasignar repartidor con el selector de un pedido no terminal (con toast de
confirmación), y comprobar que un pedido entregado o cancelado muestra el nombre
fijo en lugar del selector. Probar además `?status=../etc/passwd`,
`?from=no-es-fecha&to=2026-13-45` y `?code=NO-EXISTE`: nunca un 5xx.
Automatizado: `npx playwright test e2e/admin-deep-links.spec.ts`.

Desempeño de cada ciudad (requiere sesión admin + pedidos en varias ciudades): en
`/admin` la sección "Desempeño de cada ciudad" debe mostrar el ranking ordenado
por score con la ciudad de referencia destacada arriba y, debajo, el bloque
"Ciudades que necesitan atención" con tips accionables. Cambiar el selector a
7/30/90 y comprobar que las cifras cambian y que la comparativa es contra el
periodo inmediatamente anterior. Pulsar "Ir" de un tip y verificar que aterriza
en el recurso filtrado (p. ej. `/admin/productos?city=<id>` con el filtro de
ciudad aplicado, o `/admin/pedidos?status=cancelled`). El tip informativo
"Ciudad de referencia" **no** debe mostrar "Ir". Con `KIE_AI_API_KEY` ausente, el
botón de IA debe explicar que la IA no está configurada (503), no romper la
sección. Probar `GET /api/admin/city-performance?days=999` (debe responder 200
con la ventana por defecto, nunca 5xx) y las dos rutas sin sesión (deben ser
denegadas). A 375×812 el ranking pasa a tarjetas sin scroll horizontal y los
controles mantienen 44px.

Modal de producto (requiere sesión admin): abrir "Nuevo producto" y comprobar
que el foco entra en el diálogo (en móvil NO se abre el teclado) y que el índice
de secciones aparece — chips en una sola fila a 375×812, rail fijo a la izquierda
en 1280. Bajar dentro del modal: la sección activa del índice debe cambiar sola y
marcarse con `aria-current`; pulsar "Precios" debe llevar a esa sección respetando
`prefers-reduced-motion` (con la preferencia activa, sin animación). Enviar el
formulario vacío: deben salir **todos** los errores a la vez (no solo el primero),
el resumen "Revisa los campos marcados en rojo" arriba y el foco en el campo
nombre; corregir un campo debe quitar su error al escribir (y el resumen cuando
no quede ninguno). Probar un precio `-1`, un costo `-2`, una cantidad `2.5` y una
oferta que empiece después de terminar: cada uno marca su campo, y en la ventana
de oferta los dos `datetime-local` quedan en rojo con el mismo mensaje. Escribir
algo y pulsar Escape (o el velo, o la X): debe aparecer la confirmación de
descarte; `Escape` otra vez la cierra sin cerrar el modal, y con la pestaña sucia
el navegador debe pedir confirmación al recargar. La barra de descarte ofrece las
tres salidas (Descartar cambios / Seguir editando / Guardar y cerrar, la primaria
al final): con el precio en `-1`, "Guardar y cerrar" debe dejar a la vista el
error del precio y no la barra, y con datos válidos debe guardar y cerrar sin
pasar por la barra. Con Tab desde el último control
el foco debe volver al primero, y el listado de atrás no debe scrollear mientras
el modal está abierto. Repetir en "Editar" sobre un producto con SKU: guardar sin
tocar nada no debe marcar "Cambios sin guardar". Las reglas de validación se
cubren además sin navegador: `npx vitest run src/lib/product-form.test.ts`
(forma válida, formulario vacío, números negativos/`NaN`, cantidades no enteras,
SKU/código de barras, ventana de oferta invertida y "todos los errores a la vez"
con el orden de foco) y el mapeo de los `field` del servidor. Para los casos que
solo se ven en pantalla está `e2e/admin-productos-modal.spec.ts` (`@ci`):

```bash
npm run test:e2e -- e2e/admin-productos-modal.spec.ts        # guardas (sin sesión)
E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run test:e2e -- \
  e2e/admin-productos-modal.spec.ts                          # + comportamiento
```

Sin credenciales los 6 casos de comportamiento se saltan solos; con ellas
ejercen las invariantes (4) a (7) sin guardar nada (el formulario se deja
inválido a propósito). Un SKU duplicado debe marcar `#pf-sku` en rojo con el
mensaje del servidor y llevar el foco ahí, no dejar el aviso general solo.

Ronda 13 de `/admin/productos` (sin migraciones nuevas: se apoya en 00116 y 00118):
- Degradación por fuente de `row-meta`: con la sesión admin abierta, cortar una
  sola fuente no debe vaciar el listado. La forma barata de probarlo es la vista
  de ventas: `drop view products_with_sales;` en un entorno de prueba hace que
  `GET /api/admin/products/row-meta?ids=391` responda **200** con
  `degraded: ["sales"]`, `sales: {}` y `waPending`/`lastEdit` intactos, y que el
  panel muestre la franja ámbar nombrando "las ventas" mientras las demás
  columnas siguen pintadas. Volver a crear la vista y recargar: la franja
  desaparece. Un fallo de la petición entera (por ejemplo, sesión sin rol admin
  → 403) declara las tres fuentes y deja las columnas vacías, pero el listado
  —que viene de `/list`— se sigue viendo.
- Ventas contra la fuente de verdad: con `products_with_sales` presente, el
  producto 391 debe mostrar 9 unidades y $612.00 en la columna "Ventas", la misma
  cifra que devuelve el reporte de ventas y que usa el orden `sort=sales`
  (comparar con `select id, sales_units, sales_revenue from products_with_sales
  where sales_units is not null;`). Un pedido cancelado no debe sumar ni aquí ni
  en el orden: el número de la fila tiene que cuadrar con la posición.
- Body roto → 400: con la sesión admin abierta, `curl -X POST` a cualquier ruta
  de escritura de `/api/admin/products/*` sin body (o con `-d '{'`) debe
  responder **400** con un mensaje de petición inválida, **nunca 500**, y no debe
  aparecer un registro nuevo en `/admin/bitacoras?tab=errores`. Repetir con body
  `{}` (JSON válido pero sin los campos): ese sí es 400 de validación, y con body
  válido debe seguir funcionando igual que antes.
- Bitácora degradada: sin `admin_audit_log` (o con la tabla vacía),
  `GET /api/admin/products/audit` y `?productId=391` responden **200** con
  `{ entries: [], degraded: true }`, se registra
  `logger.warn("products.audit.degraded")` con `scope: "activity"|"history"` y el
  modal **no** muestra un error rojo. El panel distingue los dos casos: con
  `degraded: true` el drawer y el historial dicen "Historial no disponible en
  este momento." (ámbar), mientras que con la tabla presente y sin filas dicen
  "Sin actividad registrada." / "Sin cambios registrados." — una lista vacía por
  fallo no debe leerse como "no pasó nada". El 500 queda solo para fallos de
  auth o de creación del cliente.
- Conteos: `select jsonb_object_keys(admin_product_filter_counts(false));` debe
  listar las 17 claves de la v2 (con `brands` y `tagCounts`). El contrato está
  fijado en `npx vitest run src/lib/admin-product-counts.test.ts
  src/lib/admin-product-counts.contract.test.ts`: la prueba lee el SQL de
  `00118`, extrae las claves del `jsonb_build_object` final y exige que el lector
  las consuma **todas**, así que renombrar una clave en la RPC sin tocar el
  fallback (o al revés) falla aquí en vez de que el panel pierda un chip en
  silencio. También blinda la discriminación v1/v2: `brands` debe ser array y
  `tagCounts` un objeto **plano** — un `tagCounts: []` cumple `typeof ===
  "object"`, así que sin el guard el panel pintaría cero etiquetas creyendo que
  el RPC funcionó en lugar de caer al camino antiguo.
