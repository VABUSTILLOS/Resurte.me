# Agente: Administración

## Posee
- `src/app/admin/**` (dashboard, pedidos, productos, visibilidad, disponibilidad,
  proveedores, conversión, marketing, whatsapp, workflows)
- `src/app/api/admin/**`
- `src/lib/admin-auth.ts`, `src/lib/admin-marketing-validation.ts`

## Invariantes
- Toda ruta API de admin valida con `admin-auth.ts` y el layout tiene guard
  server-side (`getUserRole`); nunca exponer datos sin gate.
- Dashboard (PR #18): KPIs vs ayer, alertas operativas, auto-refresh pausable,
  export CSV, badge de pendientes, skeleton de carga.
- Las gráficas (recharts) llevan `role="img"` + resumen textual de la serie
  (`describeSeries`) — el SVG solo no es accesible.
- La subnav es scroll horizontal en móvil.
- Errores con reintento (`error.tsx` del área + botón Reintentar en página).
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
  caen al fallback). `related_product_ids` aún no está en `AUDIT_FIELDS`, así
  que sus cambios no generan diff (`cost` sí está, y `low_stock_threshold`
  se omite del diff mientras 00108 falte).
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

## Verificación
`npm test` + entrar a /admin con cuenta admin: métricas por período, cambio de
visibilidad de un producto y confirmación de que el caché de catálogo se invalida.

Ronda 7 (requiere 00106-00111 aplicadas): en `/admin/productos` buscar por SKU,
editar etiquetas, programar una oferta y ver que la ficha de tienda solo la
muestra dentro de la ventana, elegir relacionados, correr "Revisar imágenes",
"SEO con IA…" (debe abrir la vista previa, no escribir) y descargar el reporte
de ventas del rango (margen vacío donde falte `cost`).
