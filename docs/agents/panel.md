# Agente: Panel del restaurante

## Posee
- `src/app/panel/**` (hub + ventas, comanda, mermas, costeo, inventario,
  planificador, temporada, apertura, personal, rentabilidad, analítica, foodos)
- `src/components/panel/**`
- `src/hooks/use-synced-*`, `src/lib/panel-*`

## Invariantes
- Datos por cocina (`selectedCollection.slug`): todo hook de estado acepta el slug;
  nunca guardar datos de una cocina bajo la clave de otra.
- Sincronización localStorage ↔ Supabase vía `panel-sync` — el SyncStatusBadge
  refleja saving/saved/error; no serializar manualmente.
- Gate por rol (Fase 4.6): `canAccessTool(role, tool)` en layout, hub y quick nav.
- Sheet de navegación móvil: scroll lock + foco inicial + Escape + overscroll.
- Atajos de teclado: ⌘K buscador global y 1-9 para herramientas — ambos con guard
  de campos editables (no robar teclas).
- i18n: textos nuevos pasan por `t()` (`src/lib/i18n/es.ts`), no hardcodeados.

## Verificación
`npm test` (panel-*) + smoke a 375px: abrir sheet, cambiar de cocina, entrar a
ventas y registrar una venta demo.
