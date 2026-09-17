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
- Gate por nivel FoodOS: `canAccessTool` sigue aplicando **además** del gate por
  nivel de lealtad (`src/lib/foodos-entitlements.ts`). Verde/Plata/Oro/Diamante
  desbloquean capacidades; una escritura gateada llama `requireFoodosFeature()`
  como primera línea (lanza), una lectura gateada devuelve `[]`/`null` (degrada).
- **Toda lectura de Supabase en una ruta de render degrada, no lanza**: comprobar
  `isSupabaseConfigured()` (`src/lib/supabase/env.ts`) antes de abrir el cliente.
  Sin este guard, `createClient()` lanza y Next renderiza el error boundary
  ("Algo salió mal") en vez del panel. El caso real está en `getMyEntitlements()`
  (`src/lib/foodos-tier.ts`), que rompía `/panel` por una dependencia circular
  entre `foodos-tier.ts` y `supabase/server.ts`.
- Sheet de navegación móvil: scroll lock + foco inicial + Escape + overscroll.
- Atajos de teclado: ⌘K buscador global y 1-9 para herramientas — ambos con guard
  de campos editables (no robar teclas).
- i18n: textos nuevos pasan por `t()` (`src/lib/i18n/es.ts`), no hardcodeados.

## Verificación
`npm test` (panel-*) + smoke a 375px: abrir sheet, cambiar de cocina, entrar a
ventas y registrar una venta demo.

Los guards de nivel y la degradación de `/panel` están cubiertos por
`e2e/foodos.spec.ts` (verifica que las rutas premium devuelvan un código
guardado **y** que no aparezca el texto "Algo salió mal": el error boundary de
Next responde 200, así que un status no basta) y por
`src/lib/foodos-tier.test.ts`.
