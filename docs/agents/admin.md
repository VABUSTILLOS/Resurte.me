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
  enviar y enfoca el primero vía `FIELD_INPUT_IDS` (mapa campo → `id`), nunca
  con `document.querySelector`. Las reglas del cliente deben espejar
  `create`/`update`: al cambiar una allí, cambiar la otra. El error de campo se
  pinta con `fieldCls`/`fieldA11y` y se retira con `clearFieldError` en el
  `onChange` — un error que no se limpia al corregir el campo es un bug.
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
no quede ninguno). Probar un precio `-1`, un costo `abc`, una cantidad `2.5` y una
oferta que empiece después de terminar: cada uno marca su campo, y en la ventana
de oferta los dos `datetime-local` quedan en rojo con el mismo mensaje. Escribir
algo y pulsar Escape (o el velo, o la X): debe aparecer la confirmación de
descarte; `Escape` otra vez la cierra sin cerrar el modal, y con la pestaña sucia
el navegador debe pedir confirmación al recargar. Con Tab desde el último control
el foco debe volver al primero, y el listado de atrás no debe scrollear mientras
el modal está abierto. Repetir en "Editar" sobre un producto con SKU: guardar sin
tocar nada no debe marcar "Cambios sin guardar".
