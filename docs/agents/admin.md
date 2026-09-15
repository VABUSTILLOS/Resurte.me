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
- Sync de catálogo WhatsApp (WA1-WA7): la DB es fuente única; el sync NUNCA
  borra en Meta sin confirmación explícita (`deleteUnknown`); los cambios de
  producto se propagan por la cola `whatsapp_sync_queue` (cron diario) y todo
  sync registra un run en `whatsapp_sync_runs`. Los productos de Meta viven
  bajo el `catalog_id` (`items_batch`), no bajo la WABA.

## Verificación
`npm test` + entrar a /admin con cuenta admin: métricas por período, cambio de
visibilidad de un producto y confirmación de que el caché de catálogo se invalida.
