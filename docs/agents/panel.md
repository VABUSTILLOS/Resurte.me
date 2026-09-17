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
- **El nivel no oculta los campos; solo bloquea la escritura.** Una herramienta
  premium se renderiza **completa** en cualquier nivel: los campos se ven y se
  pueden recorrer, y las lecturas salen reales (o vacías si el nivel no alcanza).
  El nivel se pide al **usar** — guardar, cobrar, ejecutar— no al mirar. Antes cada
  página montaba un muro `<NivelGate>` a pantalla completa que escondía la
  herramienta entera; ese muro ya no existe (`nivel-gate.tsx` solo exporta
  `featureLabel`, `featureDescription` y `NivelProgress`).
  - Predicado único: `canUseFeature(tier, feature, { isAdmin })` y su inverso
    `lockedTierFor(...)` (`src/lib/foodos-entitlements.ts`). No reimplementes el
    `||` en un componente — el contexto (`entitlements-context.tsx`) y el hook
    (`use-tier-guard.tsx`) consumen esos dos helpers.
  - Escrituras: `useTierGuard(feature)` (`src/hooks/use-tier-guard.tsx`) envuelve
    cada acción. Cuando falta nivel devuelve `{ ran: false }` **sin llamar al
    servidor** y abre `TierUpsellDialog`. Patrón obligatorio:
    `const attempt = await run(() => saveX(input)); if (!attempt.ran) return`. Si
    la página ya tiene un `run(key, task)` local (catering, pos, inbox), el hook se
    importa **aliasado**: `const { run: guard, upsellDialog } = useTierGuard(...)`.
  - Aviso y demo: `<ToolPreviewNotice feature="…" />` va montado en cada página
    premium. Ofrece "Ver demo" (abre el overlay existente de `ToolGuideHost` con
    el dataset de `TOOL_DEMOS`) y la salida a `/panel/foodos/tablero`.
  - La guarda de cliente es **de presentación**: el gate del servidor
    (`requireFoodosFeature`) sigue siendo la autoridad. Se resuelve en cliente
    porque el mensaje de una Server Action que lanza no está garantizado en
    producción; esperar el error del servidor para mostrar el aviso sería frágil.
- **El administrador de plataforma está exento del nivel, en las dos capas.** En
  el servidor `requireFoodosFeature()` consulta `isCurrentUserAdmin()`
  (`src/lib/foodos-tier.ts`) **solo en la ruta de fallo** — nunca en el camino
  normal de un restaurantero, para no añadir una lectura de rol a cada escritura.
  En el cliente `panel/layout.tsx` calcula `isAdmin = role === "admin"` y lo pasa
  por `PanelLayoutClient` → `FoodosEntitlementsProvider`. La exención es
  necesaria porque el nivel real del admin es Verde (no acumula compras propias);
  sin ella no podría probar ni dar soporte. `ToolPreviewNotice` muestra en su
  lugar la franja "Vista de administrador: nivel desbloqueado".
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
- **Un solo productor de totales del mostrador**: `entryTotal`
  (`src/components/panel/ventas/ventas-shared.ts`) es la fuente única — recorta el
  descuento porcentual en 0 para que un total no salga negativo. `hubEntryTotal`
  (`src/components/panel/hub/hub-data.ts`) **delega** en él; antes era una copia
  que divergía y el hub podía mostrar un total negativo. `counterSummary(entries,
  day)` centraliza el filtro+suma del día. No dupliques la fórmula.
- **La fecha del mostrador es local**: las entradas se escriben con `todayStr()`
  (`src/lib/utils`), así que toda comparación con "hoy" usa `todayStr()`. Comparar
  contra `new Date().toISOString().slice(0, 10)` (UTC) hacía que después de las
  ~18:00 de CDMX el hub mostrara $0 y perdiera el resumen del día.
- **La tarjeta "Pedidos de la app" se monta en el hub** con gate
  `canAccessTool(role, "foodos")` **además** del gate por nivel, y su copy —incluido
  el plural— pasa por `t()`; i18n no tiene ICU, así que el plural se resuelve con
  un helper (`plural(key, pluralKey, count)`).

## Verificación
`npm test` (panel-*) + smoke a 375px: abrir sheet, cambiar de cocina, entrar a
ventas y registrar una venta demo.

Los guards de nivel y la degradación de `/panel` están cubiertos por
`e2e/foodos.spec.ts` (verifica que las rutas premium devuelvan un código
guardado **y** que no aparezca el texto "Algo salió mal": el error boundary de
Next responde 200, así que un status no basta) y por
`src/lib/foodos-tier.test.ts`.

El contrato "el nivel no oculta los campos" se verifica sin sesión, porque el
suite de e2e no fabrica una cuenta autenticada a propósito:
`src/app/panel/foodos/preview-gates.contract.test.ts` recorre las diez
superficies premium y exige `useTierGuard`, `ToolPreviewNotice`, `{upsellDialog}`
y **cero** `<NivelGate`; `src/lib/foodos-entitlements.test.ts` fija
`canUseFeature`/`lockedTierFor` (incluida la exención del admin);
`src/lib/foodos-tier.test.ts` fija el bypass en `requireFoodosFeature` y que el
camino normal nunca consulta el rol. Al añadir o renombrar una herramienta
premium, actualiza esas tres listas.

## Franja de la sesión de soporte (P14, Ronda 9)

Cuando un admin abre una sesión desde `/admin/operar`, el panel muestra una
franja ámbar `role="status"` —"Operando como X"— con un botón **Salir** que llama
a `stopOperatingAs()`. Tres decisiones que se ven raras hasta que se explica el
porqué:

- **No se puede cerrar.** No tiene aspa: el admin tiene que poder ver en todo
  momento que está dentro de otro restaurante. Cerrarla con un clic lo dejaría
  escribiendo sobre datos ajenos creyendo que opera los suyos.
- **Se pinta fuera del control de acceso** (`panel-layout-client.tsx`, antes del
  ternario de `denied`). Si viviera dentro, un admin en una página que su rol no
  alcanza no tendría cómo salir y quedaría atrapado.
- **`print:hidden`.** Los tickets son documentos del restaurante, no de la sesión
  de soporte: no deben salir con la franja impresa.

La exención de admin del contexto se apaga durante la sesión
(`isAdmin = role === "admin" && !impersonating` en `src/app/panel/layout.tsx`).
Es deliberado: el admin entra a ver el **nivel real** del restaurante, y si la
exención siguiera encendida vería todas las herramientas abiertas — justo lo que
vino a diagnosticar — y además la UI le ofrecería un botón que el servidor
rechaza. El nivel se resuelve con `getPanelOperatingState()`, que lee contexto y
nombre en **una** pasada.

Verificación: `npx vitest run src/app/admin/operar/operating-picker.contract.test.ts`
fija el cableado (franja fuera del `denied`, `isAdmin` con `!impersonating`,
`print:hidden`). El comportamiento en pantalla no tiene e2e a propósito:
`/panel` responde 200 sin sesión (su layout no llama a `requireAuth`) y CI no
fabrica cuentas de admin.
