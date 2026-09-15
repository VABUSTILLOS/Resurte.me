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

## Verificación
`npm test` + entrar a /admin con cuenta admin: métricas por período, cambio de
visibilidad de un producto y confirmación de que el caché de catálogo se invalida.
