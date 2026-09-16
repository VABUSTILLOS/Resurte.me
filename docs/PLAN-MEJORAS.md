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
| W8 | **Share target para recibir listas de insumos**: `manifest.json` declara `share_target` con `method: "GET"` hacia `/compartir` (parámetros `titulo`/`texto`/`url`) y un cuarto shortcut "Compartir lista". `/compartir` es una página **estática** (`robots: noindex`) que resuelve cada renglón contra el catálogo de la ciudad en el cliente, en tandas de 5 (`searchProducts`), y muestra "Encontrados" con checkbox + stepper de cantidad y "Sin coincidencia" con deep link al buscador (`/{ciudad}/buscar?q=`). Nada entra al carrito sin confirmar: un solo `addOrderItems` + un toast + `AnalyticsEvents.addToCart` por ítem. El parseo (cantidad, unidad, viñetas, URLs, tope de 20 renglones) vive en `src/lib/share-list.ts` (27 tests) y el UI nunca guarda `resolving` en estado (se deriva del texto, para respetar `react-hooks/set-state-in-effect`). Sin service worker nuevo: al ser GET no hace falta handler de `fetch` | ✅ |
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
| C13 | **Comparador de precios por unidad**: `unit-price.ts` normaliza la presentación (`por kilo`, `500 g`, `1 l`, `por pieza`…) a un precio por kg/l/pieza; la ficha de producto muestra el `$/kg` real y una sección "Comparar presentaciones" con la más barata y el sobreprecio (`+N%`) de las demás, y las cards y la búsqueda global muestran el `$/kg` como insignia | ✅ |

## 4. Carrito y checkout

| # | Fase | Estado |
|---|---|---|
| K1-K5 | Foco, overscroll, aria-live, haptic, aria-labels en drawer y barra | ✅ |
| K6-K10 | autocomplete/inputMode/enterKeyHint, htmlFor, radiogroup, required, grupos etiquetados | ✅ |
| K11 | **Autoguardado de la última dirección + "Usar mi última dirección"** | ✅ |
| K12 | **Swipe-down para cerrar el drawer** con handle visual y haptic | ✅ |
| K13 | Reanudar el paso exacto del checkout tras interrupción | 🔜 |
| K14 | **Bump sells encadenados sin tope**: el checkout omite `limit` y el motor devuelve **todas** las reglas activas que apliquen al carrito (el pool lo determina `bump_rules`; `MAX_BUMPS` = 3 es solo la ventana visible y `MAX_BUMPS_REQUEST_LIMIT` = 100 el tope anti-abuso del endpoint público); al elegir una oferta su tarjeta desaparece, se agrega como línea del pedido y el hueco lo ocupa la siguiente, de forma indefinida. **La selección sobrevive salir del checkout**: localStorage (`resurte_bumps`) + `user_carts.bumps` (migración `00113`) con endpoints dedicados (`PUT /api/cart/bumps/selection`, `POST /api/cart/bumps/hydrate`) y `bumps_updated_at` propio, con merge last-write-wins compartido (`bumps-sync.ts`). **Cantidades editables** en la lista del pedido con +/− y piso 0: una línea en 0 sigue visible con la insignia "En 0" y un segundo "−" abre el prompt `RemoveLineDialog` para quitarla (`order-lines.ts` como regla pura, `useOrderLines` compartido por drawer y checkout full-page) | ✅ |
| K15 | **Bumps = productos reales del catálogo**: las tarjetas encabezan con `bump.product.name` (el `bump_rules.title` pasa a ser subtítulo adorno, p. ej. "Limón" en vez de "Limones para tus tacos"). **Afinidad por ingrediente** (`ingredient-affinity.ts` + tabla `bump_affinity` 00112 + recetario): el primer tier del ranking sugiere los ingredientes que combinan con lo que ya está en el checkout (carne → especias/salsa; cebolla → chiles y tomate; receta → sus otros ingredientes), con descuento de 10 % al registrarse la regla y `display_order = 100`. Panel de admin en `/admin/marketing` → "Afinidad entre productos" (CRUD + búsqueda de producto); el tier es aditivo y tolerante a fallos si la migración no está aplicada | ✅ |

## 5. Recompensas

| # | Fase | Estado |
|---|---|---|
| R1-R4 | Sync `?tab=`, refresh al volver, aria en tabs, **fix tab bar móvil** | ✅ |
| R5-R8 | Título por sección, overscroll, error boundary, OG | ✅ |
| R9-R10 | Haptic y scroll-to-top al cambiar de sección | ✅ |
| R11 | **Pull-to-refresh del saldo** con indicador animado | ✅ |
| R12 | Notificaciones de cashback ganado tras cada pedido (helper único `notifyCashbackCredited` invocado desde el webhook de Stripe, la conciliación y el cambio de estado en admin) | ✅ |
| R13 | **Progreso semanal de calificación**: bloque "Esta semana" en la meta mensual y avisos deterministas (semana calificada, sin compras, cierre próximo) con IDs por semana ISO | ✅ |
| R14 | **Transparencia del monedero**: `getWalletSummary()` y tarjetas de total ganado/canjeado en la vista de créditos; filtros Todos/Cashback/Canjes en la actividad, con exportación CSV que respeta el filtro | ✅ |
| R15 | **Canje más claro**: avance por servicio y "Más cerca" en la tienda; comprobante con folio, saldo restante y CTAs explícitos tras canjear (sin redirección automática) | ✅ |
| R16 | **Accesibilidad de la campana**: `aria-expanded`/`aria-controls`, panel `role="dialog"` con foco gestionado, anuncios de estado y objetivos táctiles de 44 px | ✅ |
| R17 | Créditos por expirar (requiere migración: fecha de caducidad por movimiento) | 🔜 |

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
| WC1 | Motor de automatizaciones respeta la config persistida (`whatsapp_automations`): is_active, delays, niveles de payment_recovery | ✅ |
| WC2 | Motor cron `whatsapp-automations` para carrito, reactivación, rating, onboarding y cumpleaños con dedupe (`whatsapp_automation_sends`) | ✅ |
| WC3 | Bitácora de envíos + stats (7 días, último envío) en la API de automatizaciones | ✅ |
| WC4 | Página de automatizaciones sin mocks: loading/error con reintento, delay editable, badge "sin plantilla" | ✅ |
| WC5 | Drag & drop HTML5 nativo en la curaduría (flechas conservadas como fallback accesible) | ✅ |
| WC6 | Vista previa del catálogo tal como lo vería el cliente (burbuja product_list) | ✅ |
| WC7 | Curaduría masiva: agregar toda la vista (tope 50, doble confirmación) y quitar por selección múltiple | ✅ |
| WC8 | Credenciales por catálogo desde la UI (token cifrado AES-GCM, nunca devuelto; fallback plataforma) | ✅ |
| WC9 | Botón "Probar conexión" a Meta con latencia y diagnóstico | ✅ |
| WD1 | Cliente de lectura de Meta ampliado: `getCatalogProducts` con precio, sale_price, availability, imagen y review_status; parser defensivo `parseMetaPriceToMajor` | ✅ |
| WD2 | Comparador puro tienda vs Meta (`compareMetaVsStore`): match, price_diff, sale_price_diff, image_missing_meta, only_meta, only_store | ✅ |
| WD3 | Actions del explorador: `getWaMetaCatalog` (cruce vivo Meta ↔ tienda) y `pushWaProductToMeta` (corrección individual con run+handle) | ✅ |
| WD4 | Panel "Explorador Meta" en /admin/whatsapp: tabla viva con chips de diferencia, filtros por estado, contadores, refetch y "Corregir" por fila | ✅ |
| WD5 | Verificación (1345 tests + build) y docs de la ronda WD | ✅ |
| WE1 | Operaciones individuales de Meta: `deleteCatalogProductsByRetailer` (batch DELETE) y `setCatalogProductAvailability` (UPDATE parcial defensivo) | ✅ |
| WE2 | Actions directas: `deleteWaMetaProduct` (trazable), `setWaMetaProductAvailability` (DB fuente única si existe en tienda), `fixAllWaCatalogIssues` (corrección masiva, un solo run) | ✅ |
| WE3 | Salud del catálogo: `computeCatalogHealth` (score 0–100 + issues por severidad alta/media/info) con tests | ✅ |
| WE4 | Explorador con acciones por fila (corregir / pausar-activar / eliminar con doble confirmación), barra de salud y "Corregir N problemas" | ✅ |
| WF1 | Distribución: módulo `whatsapp-share.ts` (normalización MX, enlaces wa.me chat + `wa.me/c/`, texto de compartido) con tests; QR a data-URL (`qrcode`); migración `display_phone` | ✅ |
| WF2 | Panel "Distribución" por catálogo: enlaces con copiar, QR descargable PNG, número público en el formulario de credenciales | ✅ |
| WF3 | Difusión del catálogo: `broadcastWaCatalog` (audiencia ciudad + marketing_consent o manual, tope 200, dedupe por día) con conteo previo y resultado | ✅ |
| WF4 | Plantillas administrables: lista/alta/estado/eliminar + `syncWaTemplatesFromMeta` (status real desde Meta) | ✅ |
| A13 | Productos: operaciones masivas (precio/visibilidad/disponibilidad) con auditoría | ✅ |
| A16 | Productos: publicar/despublicar por fila (switch), CRUD completo (crear/editar/duplicar), filtros por estado con conteos, export CSV, orden por columnas, deshacer en lote | ✅ |
| A17 | Productos: paginación server-side (`/api/admin/products/list`), badge de sync WA pendiente y "última edición" por fila (`/api/admin/products/row-meta`) | ✅ |
| A18 | Productos ronda 2: bulk WhatsApp, campo `unit`, lightbox, deep-link de filtros en URL, vista grid, panel Salud del catálogo (sin precio/categoría/imagen/ciudades, WA sin publicar) | ✅ |
| A19 | Productos ronda 2: eliminar protegido (409 si tiene pedidos, order_items es CASCADE), historial por producto (audit), categoría inline, dry-run de importación CSV | ✅ |
| A20 | Publicación programada: `publish_at`/`unpublish_at` (00096) + job `scheduled-publishing` en cron diario (antes del sync WA); toggle manual cancela la programación | ✅ |
| A21 | Productos ronda 3: toasts de éxito, page size configurable, atajos de teclado (/, n, Esc), link "Ver en tienda", columna Ventas (order_items vía row-meta) | ✅ |
| A22 | Productos ronda 3: filtros por ciudad y marca server-side, bulk delete (omite productos con pedidos), bulk duplicate, Deshacer genérico (visibilidad/categoría/precio) | ✅ |
| A23 | Nota interna del producto (`admin_note`, 00098, solo admin) y galería de imágenes (`products.images`: agregar, principal ★ = image_url, quitar) | ✅ |
| A24 | Productos ronda 4: chip "En oferta", bulk oferta con Deshacer, chip "Nombres duplicados", shift-click por rango, columna `imagen` en importación CSV | ✅ |
| A25 | Productos ronda 4: descripción e imagen con IA (kie-ai chat/image + polling), copiar selección al portapapeles, Ventas $ por producto, drawer de actividad reciente | ✅ |
| A26 | Papelera con soft delete (`deleted_at`, 00099): eliminar preserva historial de pedidos, filtro Papelera + Restaurar; accesibilidad (aria-live, focus rings) | ✅ |
| A27 | Productos ronda 5: orden manual del catálogo (`sort_order` 00100, ↑↓ con swap + normalización; la tienda ordena sort_order,name con fallback), stock numérico (`stock_quantity` 00101, deriva stock_status), costo y margen % (00102), búsqueda pg_trgm (00103) | ✅ |
| A28 | Productos ronda 5: reporte de ventas CSV por rango, vistas guardadas de filtros, fusión de duplicados (merge → papelera), renombrar al duplicar | ✅ |
| A29 | SEO por producto (`seo_title`/`seo_description` 00104, generateMetadata los prefiere), recorte 1:1 opcional al subir imágenes, sparkline de precios, bulk unidad | ✅ |
| A30 | Productos ronda 6: precios por tienda (`product_stores`, modal con overrides + GET/PUT), unidad en export/copiar/CSV, badge ✨ Nuevo (<7 días) | ✅ |
| A31 | Productos ronda 6: imagen por URL, duplicar eligiendo categoría, pausa temporal (⏸ republica en N días vía publish_at), oferta por margen objetivo en lote | ✅ |
| A32 | SEO con IA (kie-ai), imágenes IA en lote (tandas de 10), dictado por voz (Web Speech API es-MX), QR descargable por producto (`qrcode` client-side) | ✅ |
| A33 | Productos ronda 7: SKU y código de barras (`sku`/`barcode` 00106, índice único parcial sobre `sku`, búsqueda por SKU/código en `search_product_ids_fuzzy` 00110 y fallback `.or(sku.ilike,barcode.ilike)`), etiquetas editables (`tags` JSONB con chips + bulk agregar/quitar), filtro por defecto `low_stock_threshold` | ✅ |
| A34 | Productos ronda 7: ventana de oferta programada (`sale_starts_at`/`sale_ends_at` 00107, `sale-window.ts` como fuente única, `withResolvedSale` en tienda/pagos/bumps/upsells, `get_products_by_collection` 00111 devuelve la ventana) y productos relacionados (`related_product_ids` 00109, selector en el modal, `buildRelatedProducts` en la ficha de producto) | ✅ |
| A35 | Productos ronda 7: umbral de stock por producto (`low_stock_threshold` 00108 con backfill de `stock_status`), reposición sugerida con cantidad (`restock.ts`), importación CSV con match por SKU, modos de actualización y dry-run enriquecido | ✅ |
| A36 | Productos ronda 7: detección de imágenes rotas en lote (`product-images.ts` + `check-images`, reemplazar/quitar URL), retención y purga de papelera (`trash.ts`, 30 días, `purge-trash` en cron diario y botón "Vaciar papelera") y diff antes/después en el historial (`audit-diff.ts`, sparkline de precios) | ✅ |
| A37 | Productos ronda 7: SEO con IA en lote (`seo-batch.ts` + `bulk-seo`, solo propuestas con vista previa editable) y reporte de ventas ampliado con margen, costo faltante y clasificación ABC (`sales-report.ts`, CSV + `format=json` con resumen del rango) | ✅ |
| A38 | Productos en móvil: contenedor `max-w-7xl`, barra de acciones con CTA primario + menú "Más", bloques de diagnóstico plegables (`MobileCollapsible`), vista grid por defecto en móvil y tabla en escritorio (`admin-products-view.ts`, derivada con `useMediaQuery`), columnas secundarias ocultas bajo `md` | ✅ |
| A12 | Asignación de repartidor desde el dashboard | 🔜 |
| A14 | Pedidos: filtros guardados ✅ (`admin_saved_filters`) **y acciones masivas de estado** ✅: checkbox por renglón + "seleccionar todos los visibles" (indeterminado), barra de acciones con cambio de estado, confirmación de pago y asignación de repartidor, y exportación CSV de la selección. Las reglas puras viven en `src/lib/order-bulk.ts` (28 tests): los pedidos en estado terminal (`delivered`/`cancelled`) se omiten de las acciones de estado pero siguen seleccionables a mano para correcciones puntuales, y la partición devuelve `{eligible, skipped}` por acción. La barra hace fan-out **secuencial** al `PATCH /api/orders/[id]/status` existente (no hay endpoint batch) para no duplicar ni perder efectos por pedido — cupones, `payment_status: "failed"` al cancelar, workflows de WhatsApp, cashback y auditoría. La cancelación masiva es la única acción destructiva: pide `window.confirm` | ✅ |
| A15 | Dashboard: alertas accionables con deep-link al recurso | 🔜 |

## 9. Blog

| # | Fase | Estado |
|---|---|---|
| BL1-BL10 | Escape, scroll al paginar, aria-live, `<time>`, RSS, limpiar filtros | ✅ |
| BL11 | **Barra de progreso de lectura** en artículos (`reading-progress.tsx`, `role="progressbar"` con `aria-valuenow` actualizado por rAF) | ✅ |
| BL12 | **Índice del artículo con scroll-spy**: `article-toc.tsx` reutiliza `extractHeadings` (los ids ya coinciden con los anclajes de `rehypeHeadingAnchors`), se muestra a partir de 3 H2 y marca la sección activa con `aria-current="location"`; la barra de progreso respeta `prefers-reduced-motion`. Automatizado en `e2e/smoke.spec.ts` (verifica que cada enlace apunte a un encabezado real y que el activo siga al scroll) | ✅ |

## 10. Navegación global

| # | Fase | Estado |
|---|---|---|
| N1-N10 | Escape, role=menu, aria-expanded, footer directo, 404 con salidas | ✅ |
| N11 | **Mega-menú de categorías en desktop**: `/api/categories` sirve las categorías con el conteo de productos visibles (cacheado 1 h / CDN 1 día, sin `cookies()` para no romper el prerender); `category-mega-menu.tsx` carga el catálogo solo al abrir por primera vez, cierra con Escape (devolviendo el foco al disparador), con clic fuera y al cambiar de ruta, y el header se mantiene visible mientras está abierto. El panel se ancla a la fila del header (no al disparador) para no desbordar la ventana a 640px, verificado por e2e | ✅ |

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
6. Checkout con un producto de la receta: el primer bump es un ingrediente
   afín con nombre real del catálogo ("Limón"), y al agregarlo desaparece y
   lo reemplaza otro.
7. Recompensas: la meta muestra el avance "Esta semana"; la campana anuncia el
   cashback de un pago con tarjeta; en Actividad los filtros Cashback/Canjes
   cambian la lista y el CSV exportado; en la Tienda el servicio más cercano
   lleva la insignia "Más cerca" y su barra de avance; al canjear aparece el
   comprobante con folio y los CTAs "Ver mis créditos" / "Volver a la tienda".
8. Ficha de un producto vendido "por kilo" con hermanos de 500 g / 1 kg: la
   insignia `$/kg` y la sección "Comparar presentaciones" marcan la más barata.
9. Artículo del blog con 3+ H2: el índice abre, resalta la sección visible y
   los anclajes llevan al encabezado correcto. Automatizado: `npx playwright
   test e2e/smoke.spec.ts --grep "índice del artículo"`.
10. Compartir una lista desde WhatsApp eligiendo Resurte.me: `/compartir`
   precarga el texto, muestra el resumen "N productos · M piezas" y separa
   "Encontrados" de "Sin coincidencia". Los renglones sin coincidencia
   enlazan a `/{ciudad}/buscar?q=<sustantivo>` (sin cantidad ni unidad) y el
   CTA queda deshabilitado mientras no haya nada incluido.
   Automatizado: `npx playwright test e2e/compartir.spec.ts --grep "share target"`.

Smoke escritorio (1280px):
1. Header → "Categorías" abre el mega-menú con conteo por categoría; Escape
   cierra y devuelve el foco; el panel no se sale de la ventana a 640px.
   Automatizado: `npx playwright test e2e/keyboard.spec.ts --project=chromium
   --grep "mega-menú"`.
2. `/api/categories` responde 200 sin sesión (página prerenderizada).
3. `/admin/pedidos` con sesión admin: marcar el checkbox del encabezado deja
   la columna en estado indeterminado cuando la selección es parcial, la barra
   masiva muestra el conteo de elegibles/omitidos por acción, cancelar en lote
   pide confirmación, y "Exportar selección" descarga solo las filas marcadas.
   Automatizado (guards sin sesión): `npx playwright test
   e2e/compartir.spec.ts --grep "acciones masivas"`.

## Agentes de mantenimiento por dominio

Ver `docs/agents/` — perímetro, invariantes y verificación por feature.
