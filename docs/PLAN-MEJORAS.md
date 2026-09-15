# Plan Maestro de Mejoras — Resurte.me

> Programa de mejora continua por feature. **Oleadas 1 y 2 implementadas**
> (fases 1-10 por feature + fases 11+ de compra fácil priorizando móvil).
> El backlog restante queda al final de cada sección.
>
> Convenciones: ✅ implementada · 🔜 backlog priorizado.

---

## 1. UX Global y experiencia móvil

| # | Fase | Estado |
|---|---|---|
| G1 | Librería de haptics (`src/lib/haptics.ts`) | ✅ |
| G2 | `BackToTop` flotante con offset sobre el rail inferior | ✅ |
| G3 | `OfflineBanner` al perder conexión | ✅ |
| G4 | Toasts con `aria-live`/`role=status|alert` | ✅ |
| G5 | Toasts con dedupe y tope de 3 | ✅ |
| G6 | BackToTop + OfflineBanner en `layout.tsx` | ✅ |
| G7 | `scroll-behavior: smooth` con reduced-motion | ✅ |
| G8 | `scroll-padding-top` (anchors bajo el header) | ✅ |
| G9 | `::selection` de marca | ✅ |
| G10 | Colisiones del BackToTop | ✅ |
| G11 | Error boundary raíz con reintento | ✅ |
| G12 | **Service worker offline** (`public/sw.js`): estáticos cache-first, páginas network-first; nunca cachea /api, /auth, /admin, /panel | ✅ |
| G13 | Registro del SW solo en producción (`RegisterSW`) | ✅ |

## 2. PWA e instalación

| # | Fase | Estado |
|---|---|---|
| W1-W4 | id/scope, maskable, shortcuts, theme_color | ✅ |
| W5 | standalone + safe areas (auditado) | ✅ |
| W6 | OfflineBanner como puente offline | ✅ |
| W7 | **Banner de instalación A2HS**: `beforeinstallprompt` en Android + instrucciones en iOS; tras 25 s, dismiss persistente, sin colisiones | ✅ |
| W8 | Share target para recibir listas de insumos | 🔜 |
| W9 | Push notifications de estado de pedido | 🔜 |
| W10 | Background sync del carrito | 🔜 |

## 3. Catálogo, búsqueda y ciudades

| # | Fase | Estado |
|---|---|---|
| C1 | Haptic al agregar | ✅ |
| C2 | CTA "Avísame" por WhatsApp en agotados | ✅ |
| C3 | Grid semántico `ul/li` con conteo anunciado | ✅ |
| C4 | Empty state con salida al catálogo | ✅ |
| C5-C6 | role=search, type=search; atajo `/` corregido | ✅ |
| C7-C8 | Ciudades: búsqueda sin acentos; marca de ciudad actual | ✅ |
| C9-C10 | aria-labels; overscroll en listas | ✅ |
| C11 | **Stepper − N + en la card cuando el producto ya está en el carrito** | ✅ |
| C12 | **Rail "Vistos recientemente"** en la página de producto | ✅ |
| C13 | Comparador de precios por kilo/pieza entre presentaciones | 🔜 |

## 4. Carrito y checkout

| # | Fase | Estado |
|---|---|---|
| K1-K5 | Foco, overscroll, aria-live, haptic, aria-labels en drawer y barra | ✅ |
| K6-K10 | autocomplete/inputMode/enterKeyHint, htmlFor, radiogroup, required, grupos etiquetados | ✅ |
| K11 | **Autoguardado de la última dirección + "Usar mi última dirección"** | ✅ |
| K12 | **Swipe-down para cerrar el drawer** con handle visual y haptic | ✅ |
| K13 | Reanudar el paso exacto del checkout tras interrupción | 🔜 |

## 5. Recompensas

| # | Fase | Estado |
|---|---|---|
| R1-R4 | Sync `?tab=`, refresh al volver, aria en tabs, **fix tab bar móvil** | ✅ |
| R5-R8 | Título por sección, overscroll, error boundary, OG | ✅ |
| R9-R10 | Haptic y scroll-to-top al cambiar de sección | ✅ |
| R11 | **Pull-to-refresh del saldo** con indicador animado | ✅ |
| R12 | Notificaciones de cashback ganado tras cada pedido | 🔜 |

## 6. Cuenta y autenticación

| # | Fase | Estado |
|---|---|---|
| U1-U7 | Fechas relativas, aria-labels, form accesible, badge predeterminada, scroll al editar | ✅ |
| U8-U12 | Mostrar/ocultar contraseña, Bloq Mayús, autocomplete, hints, roles | ✅ |
| U13 | Passkeys / WebAuthn | 🔜 |

## 7. Panel del restaurante

| # | Fase | Estado |
|---|---|---|
| P1-P8 | Listbox accesible, scroll lock, foco, aria-current, overscroll | ✅ |
| P9-P10 | Buscador global con aria-keyshortcuts; resiliencia (auditado) | ✅ |
| P11 | **Atajos 1-9 para abrir herramientas** | ✅ |
| P12 | Widget de pedidos de la tienda en el hub | 🔜 |

## 8. Administración

| # | Fase | Estado |
|---|---|---|
| A1-A8 | Dashboard del PR #18: KPIs vs ayer, alertas, auto-refresh, CSV, badge pendientes, guard server-side | ✅ (PR #18) |
| A9-A10 | Gráficas con `role=img` + resumen textual de la serie para lectores de pantalla | ✅ |
| A11 | Error boundary del área /admin | ✅ |
| WA1 | Sync catálogo WhatsApp: cliente Graph API a nivel catálogo (`items_batch`, precio en el payload, `whatsapp_product_id` persistido, `catalog_id` por catálogo) | ✅ |
| WA2 | Sync seguro no destructivo: diff crear/actualizar/stale, borrado en Meta solo con confirmación explícita | ✅ |
| WA3 | Batch en chunks de 100 + backoff exponencial (429/80004/5xx) + timeout; fallos parciales vía handles | ✅ |
| WA4 | Historial de syncs: `whatsapp_sync_runs` + `whatsapp_sync_items`, registro en cada corrida | ✅ |
| WA5 | Cola de sync automático (`whatsapp_sync_queue`): cambios de precio/imagen/stock/visibilidad/curaduría encolan sync incremental; job `whatsapp-sync-queue` en el cron diario | ✅ |
| WA6 | UI /admin/whatsapp: previsualización del diff con confirmación de borrados, historial por catálogo, botón "Procesar cola"; endpoint legacy `/api/whatsapp/catalog/sync` retirado | ✅ |
| WA7 | Validación previa al sync (imagen https, precio > 0, límites de Meta); inválidos excluidos y listados con motivo | ✅ |
| WB1 | Observabilidad del sync: parseo defensivo de handles de Meta (`parseBatchErrors`) y módulo `whatsapp-batch-status.ts` que vuelca errores por producto a `whatsapp_sync_items` | ✅ |
| WB2 | Detalle por producto en cada corrida (items `pending` → `ok`/`error` vía job cron `whatsapp-batch-status`) | ✅ |
| WB3 | Reintento individual de producto y "reintentar fallidos" por corrida (handles acumulados en el run) | ✅ |
| WB4 | UI: historial expandible con detalle por producto + panel de cola (motivo, intentos, antigüedad, quitar) | ✅ |
| WB5 | Higiene de runs huérfanos: `running` > 6 h ⇒ `failed` en el job cron | ✅ |
| A13 | Productos: operaciones masivas (precio/visibilidad/disponibilidad) con auditoría | ✅ |
| A16 | Productos: publicar/despublicar por fila (switch), CRUD completo (crear/editar/duplicar), filtros por estado con conteos, export CSV, orden por columnas, deshacer en lote | ✅ |
| A17 | Productos: paginación server-side (`/api/admin/products/list`), badge de sync WA pendiente y "última edición" por fila (`/api/admin/products/row-meta`) | ✅ |
| A18 | Productos ronda 2: bulk WhatsApp, campo `unit`, lightbox, deep-link de filtros en URL, vista grid, panel Salud del catálogo (sin precio/categoría/imagen/ciudades, WA sin publicar) | ✅ |
| A19 | Productos ronda 2: eliminar protegido (409 si tiene pedidos, order_items es CASCADE), historial por producto (audit), categoría inline, dry-run de importación CSV | ✅ |
| A20 | Publicación programada: `publish_at`/`unpublish_at` (00096) + job `scheduled-publishing` en cron diario (antes del sync WA); toggle manual cancela la programación | ✅ |
| A12 | Asignación de repartidor desde el dashboard | 🔜 |
| A14 | Pedidos: filtros guardados y acciones masivas de estado | 🔜 |
| A15 | Dashboard: alertas accionables con deep-link al recurso | 🔜 |

## 9. Blog

| # | Fase | Estado |
|---|---|---|
| BL1-BL10 | Escape, scroll al paginar, aria-live, `<time>`, RSS, limpiar filtros | ✅ |
| BL11 | Barra de progreso de lectura en artículos | 🔜 |

## 10. Navegación global

| # | Fase | Estado |
|---|---|---|
| N1-N10 | Escape, role=menu, aria-expanded, footer directo, 404 con salidas | ✅ |
| N11 | Mega-menú de categorías en desktop | 🔜 |

---

## Verificación

El pipeline `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`
corre en CI (`.github/workflows/ci.yml`) y en el build de Vercel al hacer
merge. Revisión estática completa del diff sin errores evidentes (los puntos
de riesgo — imports, tipos estrictos, componentes nuevos — fueron verificados
uno a uno).

Smoke móvil (375px) — flujo de compra completo:
1. Agregar el mismo producto dos veces → aparece stepper − N + en la card.
2. Abrir el drawer y cerrarlo deslizando hacia abajo.
3. Checkout: rellenar con "Usar mi última dirección" (2ª compra).
4. Modo offline → navegar al catálogo cacheado (SW) y ver el banner offline.
5. /recompensas: pull-to-refresh del saldo y cambio de tabs.

## Agentes de mantenimiento por dominio

Ver `docs/agents/` — perímetro, invariantes y verificación por feature.
