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
- Pedidos (`/admin/pedidos`): **`orders.user_id` es nullable** desde la
  migración `00009_nullable_order_user.sql` (checkout de invitado: el API
  inserta `user_id: null`). El embed `profiles` viene nulo en esos pedidos y
  `customer_name` también, así que nunca encadenar `order.user_id.slice(...)`
  sobre el valor crudo: un `null.slice()` dentro del `.map` de la tabla tumba
  la sección entera con el error boundary (pasó en producción). El nombre
  visible se resuelve siempre con `orderCustomerLabel()` de
  `src/lib/admin/order-selects.ts`, que cae a `"Invitado"`. Como la política
  RLS de `orders` es `auth.uid() = user_id`, los pedidos de invitado solo son
  visibles con `service_role` — es decir, únicamente en el panel admin, nunca
  desde una sonda con anon key.
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
  `window.confirm`/`window.prompt` están prohibidos en esta página **y en sus
  modales** — `ProductFormModal` recibe `confirm` del `useConfirmDialog()` del
  listado (prop obligatoria) en vez de montar un diálogo propio (B33).
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
- Productos ronda 14 — diálogos y anuncios del modal (B33-B34): dos invariantes
  nuevas de `ProductFormModal`. (1) **Sin diálogos nativos**: el recorte 1:1 de
  una imagen de galería se pregunta con `await confirm({...})`, la función que el
  modal **recibe** por prop desde el único `useConfirmDialog()` del listado, con
  los mismos textos que su gemelo `handleImageFile`. El modal **no** debe montar
  su propio `useConfirmDialog()`: el diálogo es un *hermano* del modal en el
  árbol, así que el `Escape` del diálogo no lo ve el `onDialogKeyDown` del
  `<form>`; anidado, un solo `Escape` dispararía `requestClose()` sobre ambos y
  habría dos trampas de Tab compitiendo. (2) **El trabajo asíncrono se anuncia**:
  el modal tiene una región `role="status" aria-live="polite"` (`sr-only`) que
  anuncia el guardado y la subida, y los dos botones asíncronos llevan
  `aria-busy`; en los `catch` el texto se limpia a propósito, porque el error ya
  lo anuncia el banner con `role="alert"` y no se debe anunciar dos veces. El
  contrato de ambas lo fija `src/lib/admin-product-modal-a11y.contract.test.ts`.
- Productos ronda 15 — reabasto que no se traga el error (B35): `RestockPanel`
  escribe con `adjustProductStock` y, al tener éxito, **elimina la fila** de la
  lista (`prev.filter`), así que no puede quedarse callado. Dos invariantes:
  (1) el trabajo se anuncia en una región `role="status" aria-live="polite"`
  (`sr-only`) con el nombre del producto —"Reponiendo X…" / "Reabastecido: X"—,
  y el botón lleva `disabled` + `aria-busy` y un `aria-label` que incluye el
  producto, porque en una lista repetida "Reponer 12" no distingue fila;
  (2) **el `catch` no puede quedarse vacío**: un fallo se pinta como
  `role="alert"` ("No se pudo reabastecer X…") y limpia el `liveStatus`, y se
  vuelve a limpiar el error al reintentar. Si no hay aviso, la fila que sigue
  ahí parece un clic perdido y el admin reintenta a ciegas. El contrato lo fija
  `src/lib/admin-restock-a11y.contract.test.ts`.
- Productos ronda 16 — contraste del panel, que axe no puede ver (B36-B37): C14
  cerró la deuda AA con `e2e/a11y.spec.ts` en 20/20, pero ese gate **solo recorre
  rutas públicas** — `/admin/productos` exige sesión, así que axe nunca lo miró y
  una familia entera de defectos sobrevivió al ✅. Cuatro reglas, todas medibles
  con el fondo **compuesto** (no el token nominal): (1) **un `-600` de amber o
  verde no vale como relleno con texto blanco** (`bg-amber-600` 3.20:1,
  `bg-green-600` 3.22:1) ni como color de texto sobre fondos claros
  (`amber-600`/`amber-50` 3.09:1, `green-600`/`green-50` 3.08:1): sube a `-700`
  y a `-800` sobre `-200`; (2) **nunca aclares con alfa para un texto blanco** —
  el chip de conteo del botón activo usaba `bg-white/20 text-white` (3.51:1);
  `bg-black/20` oscurece y llega a 7.03:1, pero **depende** de haber subido el
  tono del botón antes; (3) **un scrim que lleva texto se oscurece**: los
  controles de la miniatura de galería sobre `bg-black/40` daban 2.16:1 sobre una
  foto blanca (y 1.48:1 el hover destructivo), así que van a `bg-black/70`
  (5.16 / 4.40) — al 60% el rojo se queda en 2.99:1 y `red-400` es **peor** que
  `red-300`; los otros 19 `bg-black/40` son fondos de modal y no llevan texto, así
  que no se tocan; (4) `text-gray-300`/`-400` solo valen si son decorativos
  (`aria-hidden`, `—` de dato ausente, iconos de estado vacío, indicador de
  orden): el dato real tiene que estar en el DOM. Ya cumplen y **no** se tocan
  `bg-brand-600 text-white` (6.12:1, escala propia de `globals.css`), `bg-red-600
  text-white` (4.77:1) ni los puntos de estado `bg-green-500`/`bg-amber-400` (no
  son texto, superan el 3:1 de 1.4.11 y son redundantes con su etiqueta). Como no
  hay credenciales de admin en CI, el **único** gate automatizado posible es
  `src/lib/admin-productos-contrast.contract.test.ts`: su prueba central no
  cuenta ocurrencias, enumera todo `text-white(/N)` del perímetro, camina hacia
  atrás hasta el `bg-*` más cercano y exige que esté en una lista blanca con
  ratio ≥4.5:1, así que se autoextiende y no se queda obsoleta.
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

- Productos — contraste (la superficie que axe no puede ver): `e2e/a11y.spec.ts`
  recorre **solo rutas públicas**, así que `/admin/productos` (que exige sesión)
  nunca pasó por axe y acumuló cuatro familias del mismo defecto. Las reglas son
  medibles y no negociables: (1) **amber/verde `-600` no vale** ni como relleno
  con texto blanco (`bg-amber-600` 3.20:1) ni como texto sobre `-50`
  (`amber-600`/`amber-50` 3.09:1) — sube a `-700`, y a `-800` sobre `-200`;
  (2) **no aclares con alfa para un texto blanco**: un chip `bg-white/20
  text-white` dentro de un botón se compone con el botón y se queda corto
  (3.51:1); oscurece con `bg-black/20` (7.03:1); (3) **un scrim que lleva texto
  se oscurece a `bg-black/70`**: los controles de la miniatura de galería sobre
  `bg-black/40` daban 2.16:1 sobre una foto blanca; los `bg-black/40` que son
  fondos de modal no llevan texto y **no** se tocan; (4) `text-gray-300`/`-400`
  solo si son decorativos (`aria-hidden`, `—` de dato ausente): el dato real
  tiene que estar en el DOM. Mide siempre el fondo **compuesto**, no el token
  nominal, y para un fondo translúcido sobre foto usa el peor caso (foto blanca).
  El gate es `src/lib/admin-productos-contrast.contract.test.ts`: enumera todo
  `text-white(/N)` del perímetro, busca hacia atrás el `bg-*` que lo respalda y
  lo exige en una lista blanca ≥4.5:1, así que se autoextiende con el código.
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
- **Leads CRM (`/admin/leads`, Ronda 5)**: la superficie conecta la bandeja de
  captación (`leads`) con el pipeline (`crm_prospects`) y **reutiliza** los
  módulos puros del CRM de vendedores (`@/lib/crm-pipeline`,
  `@/lib/crm-funnel`, `@/lib/crm-filters`); no los duplica ni reimplementa sus
  reglas. Invariantes que no se pueden romper:
  - **La conversión es idempotente.** `convertLeadToProspect` devuelve el
    prospecto existente si `leads.converted_prospect_id` ya está puesto, y el
    índice único **parcial** `uq_crm_prospects_lead_id` (00139) es la red de
    seguridad de la base. Dos clics o dos pestañas no pueden crear dos
    prospectos del mismo lead. Al encontrar un prospecto equivalente (por
    `lead_id` → teléfono → email) **solo se enlaza**: nunca se sobrescriben los
    campos que escribió un vendedor.
  - **`seller_id NULL` = sin asignar**, y es **invisible para vendedores** por
    RLS (`crm_prospects_owner_all` es `USING seller_id = auth.uid()`). No añadir
    `OR seller_id IS NULL` a ninguna política: expondría la cartera sin
    repartir a todos los vendedores. El admin la ve y la reparte desde el panel.
  - **Una sola fuente de filtros: la URL.** El estado vive en
    `@/lib/crm-filters` (`parseCrmSearchParams` / `buildCrmQuery` / `crmHref`)
    con allowlist; la página lo lee de `searchParams` y lo escribe de vuelta con
    `router.replace`. Las alertas y el widget del dashboard **no escriben rutas
    a mano**: usan `crmHref`. Un `tab`/`box`/`page` inválido cae al default, no
    lanza.
  - **`window.prompt` está prohibido** en esta superficie (era el editor
    original). Los diálogos son componentes con `role="dialog"`,
    `aria-modal`, trampa de foco y Escape.
  - **Paginación después de filtrar.** `getAdminLeads` lee con un tope
    (`LEAD_FETCH_CAP = 2000`) y pagina en memoria, porque el filtro se aplica
    sobre campos derivados: un `LIMIT/OFFSET` en SQL antes de filtrar devuelve
    páginas vacías. Mismo criterio que el resto del panel.
  - **Una tasa sin denominador es `null`, nunca `0`.** `@/lib/crm-funnel`
    devuelve `null` y la UI pinta "No medido": un 0% se lee como un dato real.
  - **Orden por urgencia** (`compareByUrgency`): lo vencido y lo más antiguo
    primero, no por `id` ni por `created_at` a secas.
  - **El "día" es local.** Nunca `toISOString()` para claves de día; usar
    `dayKeyOf(DEFAULT_TIMEZONE, …)` de `@/lib/local-date` (regla común 8).
- **Leads CRM (`/admin/leads`, Ronda 6 — bandeja, reparto y nutrición)**: la
  cuarta pestaña *Bandeja* lee `whatsapp_messages`, que **ya se escribía desde
  antes** (el webhook persiste los entrantes) pero **nadie leía**. La ronda no
  crea un segundo almacén de conversaciones: proyecta el existente. Invariantes
  que no se pueden romper:
  - **`from_number` es *la otra parte* de la conversación, en ambas
    direcciones.** Es el teléfono del cliente tanto en `direction='inbound'`
    como en `'outbound'`. No interpretarlo como "el número del negocio" ni
    filtrar por `direction` para deducir el interlocutor. Los envíos con
    `from_number` no telefónico (`"system"`, `"N/A"`) no tienen dígitos, así que
    `phoneKey()` devuelve `null` y quedan fuera del emparejamiento **solos**.
  - **La ventana de 24 h es una compuerta del servidor, no una preferencia de
    UI.** `sendLeadMessage` la revalida; el compositor solo la refleja. Sin
    entrante no hay ventana (`{open:false}`, no "abierta con 0 h"). Fuera de
    ventana solo se puede enviar **plantilla aprobada**.
  - **Consentimiento antes que volumen.** Sin `user_id` que enlace con
    `profiles` no hay consentimiento: solo plantilla. Un envío que no cumple se
    registra como **`skipped` con motivo** en
    `whatsapp_automation_sends.detail`, nunca se descarta en silencio.
  - **Las secuencias solo encolan.** `crm_sequences.is_active` nace en
    **`false`**: activar es un acto explícito del admin y **no** hay forma de
    activarla por URL. El motor corre en el cron diario con tope por pasada
    (`MAX_SEQUENCE_SENDS_PER_RUN`), dedupe por `dedupe_key` (el `23505` cuenta
    como `skipped`, no como error) y jamás dispara en masa.
  - **El asistente de IA nunca auto-envía y nunca mete PII completa en el
    prompt.** `suggestLeadReply` devuelve un borrador; el envío sigue siendo
    humano. Teléfonos y correos se enmascaran (`maskPhone`/`maskEmail`) y el
    texto libre se redacta (`redactFreeText`) antes de salir a un proveedor.
  - **Nunca se registran cuerpos de mensaje en `admin_audit_log`.** El `detail`
    de un envío guarda `{ template, characters }` y nada más.
  - **`null` ≠ `0` en todos los indicadores.** Una tasa sin denominador, un
    tiempo de primera respuesta sin entrante y un vendedor sin conversaciones
    se pintan como *no medido* (`formatMinutes` → `"—"`), no como cero.
  - **Las etiquetas se normalizan antes de tocar la base**
    (`@/lib/crm-tags`: `MAX_TAG_LENGTH` 24, `MAX_TAGS_PER_PROSPECT` 12). El
    `crm_prospects.tags TEXT[]` es `NOT NULL DEFAULT '{}'` con índice GIN, y la
    lectura tolera que la columna no exista todavía (00140 sin aplicar).
  - **Emparejar por teléfono puede dar falsos positivos entre leads.** Se
    reutiliza `phoneKey()` (Ronda 5) y la UI muestra los eventos **sin afirmar**
    que el número pertenece al lead. `phoneLookupVariants()` prueba las
    variantes con lada (`52`/`521`) porque el mismo cliente se guarda con y sin
    prefijo.
  - **La migración `00140` es aditiva y su RLS es de solo servicio.** Las cuatro
    tablas nuevas (`crm_quick_replies`, `crm_sequences`, `crm_sequence_steps`,
    `crm_sequence_enrollments`) llevan RLS **habilitada con cero políticas**, y
    **no** se relaja ninguna política de `crm_prospects` ni de
    `whatsapp_messages`. `crm_prospects` **no** denormaliza el último mensaje:
    se deriva en lectura.
- **Núcleo CRM compartido con el vendedor (`/admin/leads`, Ronda 10 — fusión
  Comercialización × Leads)**: la misma entidad `crm_prospects` la leían **tres**
  pilas independientes —el admin (rondas 5 y 6), el módulo del vendedor
  (`src/lib/comercializacion/**`) y el del agente (`src/lib/agente/**`)—, cada
  una con su tipo de fila, su mapeo y (dos de ellas) su propia ficha. La fusión
  deja **un núcleo puro y dos superficies por rol**. Invariantes que no se pueden
  romper:
  - **El lector de listas es uno solo.** `readCrmProspects`
    (`@/lib/crm-prospects`) es la **única** función que lee listas de
    `crm_prospects`; recibe `scope` + `filters` y devuelve `CrmProspectRow`. El
    mismo lector sirve al board del admin, a la cartera del vendedor, a la cola
    diaria del agente y a la bandeja. **No se crea un segundo lector**: si hace
    falta una consulta nueva, se añade un filtro al contrato, no una consulta
    paralela. `src/lib/crm-reader.contract.test.ts` mantiene la **lista exacta**
    de los archivos que tocan la tabla y **falla tanto si aparece uno nuevo como
    si una entrada de la lista deja de tocarla** (una entrada muerta ya no
    protege nada).
  - **El alcance se pasa explícito, nunca se infiere del rol dentro del lector.**
    `scopeForRole(role, userId)` devuelve `ADMIN_SCOPE` o `sellerScope(userId)`, y
    `applyCrmScope(query, scope)` es lo único que añade el `eq`/`is`. La
    distinción importa porque **`createServiceClient()` ignora RLS**: la política
    `crm_prospects_owner_all` protege las lecturas con el cliente del usuario,
    pero las server actions del admin y del vendedor usan el cliente de servicio.
    El alcance es la primera capa; la RLS, la segunda.
  - **`applyCrmScope` tiene firma laxa a propósito.** Era
    `T extends { eq(column: string, value: string): T }` y TypeScript abortaba con
    `TS2589: Type instantiation is excessively deep` al envolver el builder de
    PostgREST, que ya es genérico y filtrado: el compilador intentaba unificar el
    tipo consigo mismo. La firma actual es `applyCrmScope<T>(query: T, scope:
    CrmScope): T` con un cast interno. **No se "arregla" volviendo a apretarla**:
    el error reaparece en cada sitio de llamada.
  - **La ficha y el panel de conversación son componentes compartidos.**
    `src/components/crm/ProspectDetailDrawer.tsx` y
    `src/components/crm/ConversationPanel.tsx` viven en `components/crm/`, **no**
    en la carpeta del admin, y los consumen las dos superficies. El admin los
    usa a través de un adaptador delgado (`LeadDetailDrawer.tsx`, que mantiene
    ruta y API) para no reescribir sus llamadores. **Un componente compartido no
    puede importar de `@/app/admin/**` en runtime**: `ConversationPanel` importa
    de `@/app/admin/actions` **solo con `import type`**, y el contrato lo
    verifica. Lo que necesita ejecutar lo recibe inyectado.
  - **`ConversationPanel` recibe `actions: ConversationPanelActions` y lo que no
    se inyecta no se renderiza.** `load` es obligatorio; `send`, `suggest`,
    `quickReplies` y `templates` son opcionales. El admin los pasa todos
    (`admin-conversation-actions.ts`); el vendedor pasa **solo** `load`, así que
    su bandeja no tiene compositor ni asistente de IA. La prop **no tiene valor
    por defecto**: un default convertiría un olvido en un panel completo con
    botones que fallan en el servidor.
  - **La cola diaria del agente usa el mismo lector con columnas extra.**
    `readCrmProspects` acepta `extraColumns` y cuelga las columnas que el CRM no
    muestra (`employees`, `instagram`, `weekly_volume_min/max` de 00059) en un
    campo **opcional** `extra` del contrato. Es preferible a ensanchar
    `CrmProspectRow` con cuatro columnas que el CRM nunca pinta. Cuando no se
    piden columnas extra, `extra` está **ausente** (no `{}`), y una columna extra
    ausente se normaliza a `null`, no a `undefined`.
  - **`src/app/api/workflows/trigger/route.ts` NO lleva alcance y no debe
    llevarlo.** El lookup por `referral_code` es el webhook público de registro:
    no hay sesión y **no** se filtra por vendedor. Es la excepción declarada en la
    allowlist del contrato.
- **Conversión (`/admin/conversion`, Ronda CV)**: el embudo tiene **una sola
  fuente de verdad**, el motor puro `@/lib/conversion-funnel`; la página y la
  ruta nunca recalculan una tasa por su cuenta. Invariantes que no se pueden
  romper:
  - **La misma regla vive en dos implementaciones, y hay que mantenerlas
    iguales.** El camino rápido es la RPC `admin_conversion_funnel_window`
    (migración `00141`, agrega en Postgres y no tiene tope de filas); la
    referencia es `classifyOrder`/`buildFunnel`, a la que la ruta degrada si la
    migración no está aplicada. Nada garantizaba que dijeran lo mismo, así que
    `src/lib/conversion-funnel.contract.test.ts` lee la migración como texto y
    exige que las dos copias coincidan (orden del `CASE`, tabla `VALUES` de
    orden, centinelas, tope de UTM, índice, permisos) **y** evalúa el `CASE` del
    SQL contra `classifyOrder` sobre las 60 combinaciones de estado, pago y
    método. Al tocar el `CASE` del SQL o `classifyOrder`, se tocan los dos.
  - **La prioridad del desenlace es pagado → fallido → cancelado → abandonado →
    otros**, y no es el orden de presentación: `OUTCOMES` (paid, failed,
    pending, cancelled, other) es el orden en que se pintan las filas y el SQL
    lo impone con una columna `sort` explícita. Reordenar `OUTCOMES` **no**
    cambia la clasificación; reordenar los `WHEN` del `CASE` **sí**.
  - **`email_logs` no tiene `created_at`: se filtra por `sent_at`.** Filtrarla
    por `created_at` producía `42703` y el 500 que la UI mostraba como "Error al
    cargar el funnel". La regresión está clavada con una prueba propia.
  - **`null` ≠ `0`.** `rate()` devuelve `null` sin denominador y la UI pinta
    "No medido"; `compareMetric()` devuelve `deltaPct: null` cuando la base es
    `0` — **nunca `100` ni `-100`**, porque un "▲ 100%" sobre cero es un dato
    inventado. Los deltas son contra el periodo anterior de la misma duración
    (`periodBounds`), no contra el día previo.
  - **Un recorte se declara, no se disimula.** Las tres lecturas tienen tope
    (`DETAIL_LIMIT`, `RECOVERY_LOG_LIMIT`, `TAKE_RATE_ID_LIMIT`) y al alcanzarlo
    la respuesta lo dice (`detailTruncated`, `recoveryTruncated`,
    `takeRateTruncated`) y nombra lo que quedó a medias en `degraded[]`; el
    encabezado muestra un aviso en vez de presentar cifras parciales como
    completas. PostgREST además corta en ~1000 filas: los topes grandes se
    paginan, no se piden de una vez.
  - **La tendencia diaria se calcula en JS, no en una segunda RPC.** Se arma con
    el detalle que la ruta **ya** leyó (no cuesta una consulta extra) y por eso
    mismo **se apaga** cuando esa lectura se recortó o falló
    (`trendUnavailable: "truncated" | "detailError"`, y `trend: null`): un corte
    sobre una lectura ordenada por fecha descendente deja completos los días
    recientes y vacíos los primeros, así que dibujarla publicaría un crecimiento
    que no ocurrió. Duplicar la regla en SQL multiplicaría la deriva que el
    contrato existe para evitar, y un `RETURNS TABLE` con tope de filas
    reintroduciría justo el fallo silencioso que `00141` vino a cerrar.
  - **La ventana es semiabierta `[since, until)` y el día es local.** La serie
    corta por **instante**, no por día (agrupar solo por día colaba el pedido
    que cae justo en `until`, que el SQL excluye) y agrupa por el día de
    `DEFAULT_TIMEZONE`, nunca por el día UTC. La ventana de 30 días es de
    30×24 h, así que toca **31** días locales: los del borde se marcan
    `partial: true` y la gráfica lo advierte, porque un día a medias se lee
    igual que una caída.
  - **La gráfica no es la única salida.** Lleva `role="img"` con el resumen
    textual de la serie (`describeTrend`) y, plegada bajo "Ver los datos por
    día", la misma serie como tabla — el SVG solo no es accesible.

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
- Contraste: `e2e/a11y.spec.ts` **no sirve** para esta superficie (recorre rutas
  públicas; `/admin/productos` exige sesión), así que el gate es
  `npx vitest run src/lib/admin-productos-contrast.contract.test.ts`. Si añades
  un botón o un chip, la prueba central exige que el `bg-*` que respalde su
  `text-white` esté en la lista blanca: añade el relleno a `PERMITIDOS` **solo**
  después de medir el ratio sobre el fondo compuesto (≥4.5:1), y no midas el
  token nominal — un `bg-white/20` sobre `bg-amber-700` no es `bg-white/20`. Para
  un fondo translúcido sobre foto, mide contra el peor caso (foto blanca): los
  controles de la miniatura de galería necesitaron `bg-black/70`, porque al 60%
  el hover destructivo se quedaba en 2.99:1. La lista blanca también documenta
  por qué lo demás no se toca (`bg-brand-600` 6.12:1, `bg-red-600` 4.77:1, puntos
  de estado no textuales).

Leads CRM (Ronda 5, requiere **00139** aplicada): en `/admin/leads` convertir un
lead de la bandeja y comprobar que (a) aparece un prospecto con `seller_id`
NULL y `source = 'lead_web'`, (b) el lead pasa a la bandeja *Convertidos*, y
(c) **pulsar Convertir otra vez no crea un segundo prospecto** — la acción es
idempotente y devuelve el mismo `prospectId`. Descartar y restaurar un lead
debe dejar `leads.status` en `descartado` / `nuevo` y registrar la acción
distinta en la bitácora (`lead_discard` / `lead_restore`, no `lead_convert`).

Los filtros viven en la URL: poner `?tab=pipeline&due=1&unassigned=1` y recargar
debe reproducir exactamente la misma vista; un `?box=` inventado tiene que caer
al default sin 5xx. Los deep-links de las alertas y del widget del dashboard
salen de `crmHref`, así que no se escriben a mano.

El contrato del esquema está fijado en
`npx vitest run src/lib/crm-pipeline.contract.test.ts`: lee `00139` (y `00052`)
y exige que `LEAD_STATUSES` coincida con el `CHECK` de `leads.status`, que el
índice de `lead_id` sea **único y parcial**, que `seller_id` siga siendo
nullable y que la migración **no** relaje la RLS (`OR seller_id IS NULL` falla
la prueba). `e2e/admin-leads.spec.ts` cubre los guards de anónimo y el descarte
de parámetros inválidos.

La migración **00139 no se puede aplicar en local** (no hay Docker ni `psql` en
este entorno): queda escrita y lista para `supabase db push`. Sin ella, las
acciones degradan avisando (`logger.warn`) en vez de romper, y la bandeja sigue
funcionando en modo lectura.

Leads CRM (Ronda 6, requiere **00140** aplicada): en `/admin/leads` abrir la
pestaña *Bandeja* y comprobar que los hilos se ordenan por urgencia
(`sin_responder` → `ventana_cerrada` → `esperando` → sin conversación) y que un
prospecto **sin** mensajes no se cuenta como "esperando 0 minutos". Enviar
dentro de la ventana de 24 h y comprobar que la acción **vuelve a validar la
ventana en el servidor**; forzar el envío fuera de ventana debe rechazarse
aunque la UI esté desactualizada. El detalle en `admin_audit_log` guarda
`{ template, characters }` — **nunca el cuerpo del mensaje**.

Las secuencias **no se activan por URL**: `?sequence=` no existe en la allowlist
de filtros y `toggleCrmSequence` es la única vía. Tras activar una, el cron
diario (`/api/cron/daily`, job `crm-sequences`) debe encolar y no disparar en
masa; un envío duplicado se cuenta como `skipped` (`23505` sobre `dedupe_key`),
no como error.

El contrato del esquema está fijado en
`npx vitest run src/lib/crm-inbox.contract.test.ts` (43 pruebas): lee `00140` y
`00097` y exige que la columna generada `from_digits` use
`NULLIF(right(regexp_replace(from_number,'\D','','g'),10),'')` (equivalente
exacto de `phoneKey()`), que `crm_sequences.is_active` **nazca en `false`**, que
el `CHECK` de `status` de las inscripciones coincida con `SequenceAdvance`, que
`MAX_SEQUENCE_DELAY_HOURS` no llegue a un año, que las cuatro tablas nuevas
tengan RLS habilitada **sin** políticas y que **no** se añadan columnas
desnormalizadas de último mensaje en `crm_prospects`. También ata
`WHATSAPP_WINDOW_HOURS === 24`, el vocabulario de `INBOX_BUCKETS` y las 9
acciones de auditoría nuevas.

La migración **00140 tampoco se puede aplicar en local** (misma razón): queda
escrita y lista para `supabase db push`. `fetchConversationMessages` empareja
por `.in("from_number", phoneLookupVariants(...))` y **no** por la columna
generada, así que la bandeja funciona incluso con 00140 sin aplicar.


Núcleo CRM compartido (Ronda 10, fusión Comercialización × Leads): tocar
`@/lib/crm-core`, `@/lib/crm-prospects`, `@/lib/crm-conversation`,
`components/crm/ProspectDetailDrawer` o `components/crm/ConversationPanel`
**afecta también a `/comercializacion`**. Antes de cambiar el alcance, el mapeo o
la escalera de columnas, correr los contratos del núcleo:

```bash
npx vitest run src/lib/crm-core.contract.test.ts \
               src/lib/crm-prospects.test.ts \
               src/lib/crm-reader.contract.test.ts \
               src/lib/use-server.contract.test.ts
```

El **criterio de aceptación** de la fusión fue que
`npx playwright test e2e/admin-leads.spec.ts` pasara **sin modificar el spec**
(34/34): una fusión que obliga a reescribir la prueba de la superficie que no
cambia de comportamiento no es una fusión, es una regresión con test nuevo.
`e2e/comercializacion.spec.ts` es el spec **nuevo** que cierra el hueco del
vendedor (hasta la ronda 10 `/comercializacion` no tenía ninguna prueba e2e).

Dos trampas que `tsc` y ESLint **no** detectan y que costaron tiempo real en esta
ronda:

1. **Un `export const` dentro de un módulo `"use server"` invalida el módulo
   entero.** Turbopack falla el build con `The export setProspectTags was not
   found in module …/actions.ts` y el `export *` del barrel resuelve a nada. La
   constante va **sin `export`**. Lo fija `src/lib/use-server.contract.test.ts`.
2. **`applyCrmScope` no se aprieta.** Ver la invariante del núcleo compartido: la
   firma estricta reintroduce `TS2589` en cada sitio de llamada.


## Operar como restaurante (P14, Ronda 9)

`/admin/operar` es la puerta de entrada a la sesión de soporte: el admin elige
un restaurante y el **panel** (`/panel/foodos/*`) pasa a leer y escribir con sus
datos. La franja "Operando como X — Salir" aparece en el panel, no aquí: la
superficie impersonada es la que tiene que anunciarse.

Tres reglas que no se pueden relajar:

- **La cookie no es una credencial.** `resurte_foodos_operating` solo *pide* un
  restaurante; `src/lib/foodos-operating.ts` revalida `isCurrentUserAdmin()` en
  **cada** llamada. Caducidad 4 h.
- **Al impersonar se usa service role, y por eso el seam es la única barrera.**
  Todas las políticas de `foodos_*` son `auth.uid() = user_id`, así que con el
  cliente de cookies el restaurante impersonado devolvería **0 filas**. La
  contrapartida obligatoria: toda consulta de **visibilidad o propiedad** se
  acota con `ownerUserId`. Las columnas de **atribución** (`foodos_pos_shifts.
  opened_by`/`closed_by`, `foodos_pos_shift_movements.user_id`, `foodos_orders.
  cashier_user_id`, `foodos_order_payments.reviewed_by`) se quedan en el
  `user.id` de la sesión: registran quién lo hizo, no de quién es.
- **El nivel que se ve es el REAL del restaurante.** La exención de admin está
  apagada mientras se impersona, en las dos capas: `requireFoodosFeature`
  (`!impersonating && …`) y el contexto del panel
  (`role === "admin" && !impersonating`). Encenderla haría que la UI ofreciera
  una herramienta que el servidor rechaza.

Rastro de auditoría: `requireFoodosAuth()` escribe `foodos_operating_action` en
`admin_audit_log` **en cada llamada** mientras se impersona — también en las
lecturas. `getOperatingContext()` **no** audita a propósito: corre en cada
render del layout y registraría visitas de página en vez de acciones. Entrar y
salir se registran aparte (`foodos_operating_start` / `foodos_operating_stop`)
desde `src/app/panel/foodos/operating-actions.ts`; `stopOperatingAs` cierra la
sesión **aunque el rol se haya revocado**, para que nadie quede atrapado dentro.

Comprobación: `npx vitest run src/lib/foodos-operating.test.ts
src/app/admin/operar/operating-picker.contract.test.ts
src/app/panel/foodos/operating-actions.test.ts` y, con sesión de admin real,
abrir `/admin/operar`, pulsar "Operar aquí" en un restaurante ajeno y verificar
que el panel muestra la franja, que el nivel mostrado es el del restaurante (no
Diamante por ser admin) y que la acción queda en `/admin/bitacoras`.
