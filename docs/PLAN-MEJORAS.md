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
| K11 | **Autoguardado de la última dirección + "Usar mi última dirección"** (superado por K17) | ✅ |
| K12 | **Swipe-down para cerrar el drawer** con handle visual y haptic | ✅ |
| K13 | Reanudar el paso exacto del checkout tras interrupción | 🔜 |
| K16 | **El carrito cuenta catálogo + bumps**: al agregar bump sells en el checkout, todas las superficies de carrito muestran el total combinado de productos con `countOrderUnits(itemCount, selectedBumps)` (unidades, no líneas) — insignia y `aria-label` del header, `MobileCartBar`, cabecera del drawer "Mi Carrito", `/cart` y `/{ciudad}/carrito`; 2 productos + 3 bumps = **5 productos**. En `/cart` y `/{ciudad}/carrito` el resumen queda en una sola fila "Subtotal (N productos)" con el monto ya sumado (`effectiveSubtotal`) y sin fila "Artículos especiales"; el total del pedido no cambia y `itemCount` conserva su semántica de catálogo | ✅ |
| K14 | **Bump sells encadenados sin tope**: el checkout omite `limit` y el motor devuelve **todas** las reglas activas que apliquen al carrito (el pool lo determina `bump_rules`; `MAX_BUMPS` = 3 es solo la ventana visible y `MAX_BUMPS_REQUEST_LIMIT` = 100 el tope anti-abuso del endpoint público); al elegir una oferta su tarjeta desaparece, se agrega como línea del pedido y el hueco lo ocupa la siguiente, de forma indefinida. **La selección sobrevive salir del checkout**: localStorage (`resurte_bumps`) + `user_carts.bumps` (migración `00113`) con endpoints dedicados (`PUT /api/cart/bumps/selection`, `POST /api/cart/bumps/hydrate`) y `bumps_updated_at` propio, con merge last-write-wins compartido (`bumps-sync.ts`). **Cantidades editables** en la lista del pedido con +/− y piso 0: una línea en 0 sigue visible con la insignia "En 0" y un segundo "−" abre el prompt `RemoveLineDialog` para quitarla (`order-lines.ts` como regla pura, `useOrderLines` compartido por drawer y checkout full-page) | ✅ |
| K15 | **Bumps = productos reales del catálogo**: las tarjetas encabezan con `bump.product.name` (el `bump_rules.title` pasa a ser subtítulo adorno, p. ej. "Limón" en vez de "Limones para tus tacos"). **Afinidad por ingrediente** (`ingredient-affinity.ts` + tabla `bump_affinity` 00112 + recetario): el primer tier del ranking sugiere los ingredientes que combinan con lo que ya está en el checkout (carne → especias/salsa; cebolla → chiles y tomate; receta → sus otros ingredientes), con descuento de 10 % al registrarse la regla y `display_order = 100`. Panel de admin en `/admin/marketing` → "Afinidad entre productos" (CRUD + búsqueda de producto); el tier es aditivo y tolerante a fallos si la migración no está aplicada | ✅ |
| K17 | **Libro de direcciones del checkout**: la dirección se guarda tras la primera compra y **ya no se reescribe**. Regla única de preselección `pickPreferredAddress` (`src/lib/address-book.ts`): `is_default` → última usada (`addresses.last_used_at`, que `POST /api/orders` toca al resolver la dirección) → más reciente. `use-checkout-order` carga y borra la lista para **invitado y usuario** (`GET/DELETE /api/addresses/guest` con `guest_token`, `service_role` porque RLS oculta las filas sin dueño) y `AddressStep` pinta el `radiogroup` con las guardadas + "Nueva dirección" + eliminar con confirmación; la página `/[slug]/checkout` activa `autoSelectSavedAddress` (antes solo el drawer) y se elimina el bloque duplicado "Usar mi última dirección" (clave `resurte-last-address`). **Eliminar es soft delete** (`deleted_at`, migración `00117`) porque `orders.address_id` es `ON DELETE SET NULL`: `/mis-direcciones` y el checkout filtran `deleted_at IS NULL` y el cron de invitados purga por `COALESCE(last_used_at, created_at)` sin tocar direcciones referenciadas por un pedido | ✅ |

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
| A39 | Productos: **chips de categoría con el conteo de productos y el emoji de la categoría** (`getCategoryIcon`, misma fuente que la tienda), con el mismo lenguaje visual de píldoras que `/admin/whatsapp` (gris relleno sin borde / verde sólido al activo), servidos por `categoryCounts` del listado (`categoryTally` pagina 10 × 1000 filas porque PostgREST corta en 1000; degrada a 0 sin romper el panel). Conviven con el `<select>` "Todas las categorías" (conservado a petición del equipo), que comparte estado vía `updateFilters`. "Sin categoría" y los chips de categoría se limpian entre sí para no dejar el listado vacío; scroll horizontal en móvil y wrap en escritorio | ✅ |
| A40 | Productos: **barra de acciones masivas sticky** — se ancla debajo del sub-nav de `/admin` (`sticky z-30 top-[calc(var(--header-top-offset)+var(--admin-subnav-h))]`) para poder aplicar acciones sin volver a subir. El alto del sub-nav lo publica `AdminSubNav` con un `ResizeObserver` en `--admin-subnav-h` (default 45px en `globals.css`, el alto medido; mismo patrón que `--toast-stack-h`), así que sigue al header auto-oculto sin offsets hardcodeados. En móvil es una sola fila con scroll horizontal (`overflow-x-auto`, contador `shrink-0`, `touch-target` de 44px, `whitespace-nowrap` y `py-1.5` ⇒ 58px de alto) para no comerse la pantalla; en `sm+` conserva el wrap y el padding | ✅ |
| A41 | Productos: **orden por más vendidos** en `/admin/productos` (`?sort=sales`). El orden lo aplica Postgres antes de paginar, así que no puede resolverse en JS tras el `range()`; como `products` no tiene columna de ventas y PostgREST no ordena por agregados de `order_items`, la lectura usa la vista `products_with_sales` (00116: `p.*` + `sales_units` + `sales_revenue`, NULL si no vendió, pedidos cancelados excluidos — misma semántica que `sales-report`). La clave vive en `admin-product-sort.ts` con dirección por defecto por clave (`defaultProductSortDir`: `sales` abre en `desc`, el resto en `asc`), de modo que `?sort=sales` sin `dir` ya muestra los más vendidos. `NULLS LAST` con `desc` / `NULLS FIRST` con `asc` deja los no vendidos al final y la app los pinta como 0. Degradación en dos capas si la migración no está aplicada: `clampProductSortToColumns(..., { hasSales })` y reintento contra `products` con `schemaDrift` (aviso ámbar), nunca un 5xx. `row-meta` excluye cancelados para que el número de la columna "Ventas" coincida con el orden | ✅ |
| A42 | Productos: **fila de categorías sticky con el lenguaje visual del catálogo de WhatsApp** (píldoras `rounded-full` blancas con borde `warm-200` en reposo y verde WhatsApp `brand-500` = `#0E7A0E` con `shadow-md shadow-brand-500/20` al activo, emoji de `getCategoryIcon` + nombre + contador atenuado — referencia canónica `user-shop-view.tsx`, la única superficie del repo con píldoras de categoría sticky **y** con icono; supera el estilo/scroll de A39). Queda pegada debajo del sub-nav con `sticky z-30 top-[calc(var(--header-top-offset)+var(--admin-subnav-h))]` y publica su alto real en `--admin-catbar-h` (default `0px`, `ResizeObserver` sobre `categoryBarRef` con deps `[categories.length]` porque las categorías llegan por fetch), así que la barra masiva pasa a `z-20` anclada debajo de **ambas** filas (`…+var(--admin-catbar-h)`) y se desliza por detrás de las píldoras sin cortarlas. Una sola línea con scroll horizontal en todos los breakpoints (`snap-x snap-mandatory`, `scrollbar-hide scroll-fade-x`, sin `flex-wrap`, alto estable) y sangrado a todo el ancho con `-mx-4 px-4 sm:-mx-6 sm:px-6` sobre `bg-gray-50/95` + `backdrop-blur-md` (el `gray-50` del shell admin, no el `#faf8f5` del `body`); `touch-target` en móvil (44px). Contraste verificado ≥4.5:1 en los cuatro estados (nombre y contador, activo e inactivo) | ✅ |
| A12 | Asignación de repartidor desde el dashboard: columna "Repartidor" en "Pedidos recientes" con selector de repartidores **activos** (`activeDrivers` de `src/lib/drivers.ts`, compartido con `/admin/pedidos`) en los pedidos no terminales y nombre fijo en los cerrados. Reutiliza `canAssignDriver` (`order-bulk.ts`) como fuente única de la regla y el `PATCH /api/orders/[id]/status` existente (`driver_id: null` desasigna), con actualización optimista y reversión + toast si falla | ✅ |
| A14 | Pedidos: filtros guardados ✅ (`admin_saved_filters`) **y acciones masivas de estado** ✅: checkbox por renglón + "seleccionar todos los visibles" (indeterminado), barra de acciones con cambio de estado, confirmación de pago y asignación de repartidor, y exportación CSV de la selección. Las reglas puras viven en `src/lib/order-bulk.ts` (28 tests): los pedidos en estado terminal (`delivered`/`cancelled`) se omiten de las acciones de estado pero siguen seleccionables a mano para correcciones puntuales, y la partición devuelve `{eligible, skipped}` por acción. La barra hace fan-out **secuencial** al `PATCH /api/orders/[id]/status` existente (no hay endpoint batch) para no duplicar ni perder efectos por pedido — cupones, `payment_status: "failed"` al cancelar, workflows de WhatsApp, cashback y auditoría. La cancelación masiva es la única acción destructiva: pide `window.confirm` | ✅ |
| A15 | Dashboard: alertas accionables con deep-link al recurso. Las alertas ya enlazaban, pero 3 de los 5 enlaces no llevaban al recurso concreto; la ronda 2 lo cierra: los `href` los resuelve `buildAlertHref` (`src/lib/admin-alerts.ts`) en lugar de escribirse a mano, y las alertas se devuelven con `sortAlertsBySeverity` (crítica → aviso → informativa) para que una crítica no quede debajo de una informativa. `/admin/pedidos` acepta `?status=&q=&from=&to=` (lectura validada con allowlist + escritura de vuelta a la URL, mismo patrón que `/admin/productos`), `/admin/marketing` acepta `?code=` y enfoca el cupón (banner dismissible + anillo + `scrollIntoView` respetando `prefers-reduced-motion`, y aviso propio si el cupón ya no existe), y la alerta de leads apunta a `/admin/leads` en vez de al propio dashboard (era un enlace a sí mismo). El badge "N pendientes por atender" enlaza a `/admin/pedidos?status=pending` | ✅ |
| A43 | Dashboard: **sección "Desempeño de cada ciudad"** — ranking de ciudades por score relativo al mejor de la ventana (`scoreCity`: 0.4 ingreso + 0.25 pedidos + 0.2 tendencia + 0.15 cancelación; una ciudad sin pedidos puntúa 0) con selector 7/30/90 días y comparativa contra el periodo anterior, más un bloque "Ciudades que necesitan atención" y otro "Sin pedidos en el periodo" (a petición: las ciudades sin ventas no se ocultan, se agrupan aparte con sus propios tips). La aritmética vive en `src/lib/admin-city-performance.ts` (41 tests) y las actions `getAdminCityPerformance`/`getAdminCityTip` solo leen y delegan; el componente nunca recalcula. La cobertura de catálogo respeta la semántica **por producto** de `product_city_availability` (00065): sin filas ⇒ disponible en todas, así que la cobertura es `(visibles - restringidos) + disponibles_por_ciudad` — el inverso marcaba como catálogo vacío a toda ciudad sin excepciones. Tips deterministas (8 reglas con umbrales en constantes, ordenadas por severidad con `sortAlertsBySeverity`) + **un tip de IA opcional bajo demanda** (`POST /api/admin/city-performance/tip`, 503 si falta `KIE_AI_API_KEY`, el guard de admin se evalúa antes); el cliente solo manda `{ cityId, days }` y el servidor recalcula. `days` se valida con la allowlist `isPeriodDays` (default 30) y nunca produce 5xx; lectura paginada 1000/20000 con aviso de truncado; deep-links a `/admin/productos?city=`, `/admin/pedidos?status=cancelled`, `/admin/marketing` y `/admin/whatsapp`; tabla en escritorio y tarjetas a 375px, sin recharts (barras CSS) y con `motion-reduce` respetado | ✅ |
| B1 | Productos ronda 8: **conteos y disponibilidad calculados en servidor**. Los contadores de los chips (estado, categoría, "sin ciudad", papelera…) pasan a una sola llamada a la RPC `admin_product_filter_counts` (migración `00115`: 5 índices parciales + función `jsonb`), con el `categoryTally` en JS como fallback si la migración no está aplicada — nunca un 5xx por eso. La lista de ids de "sin ciudad" deja de truncarse. La disponibilidad por ciudad se sirve **por página** (`GET /api/admin/products/city-availability?ids=…` + `pageAvailability` en el listado) en lugar de descargar `product_city_availability` entera en el cliente; el modal la pide al abrirse. `PATCH` sobre esa ruta deja bitácora (`product_city_availability`): era la única mutación del panel sin auditoría | ✅ |
| B2 | Productos ronda 8: **escritura masiva en un endpoint**. `POST /api/admin/products/bulk` sustituye el fan-out de 16 acciones × `N × PATCH /update` por una sola llamada (`{ids, patch}` uniforme **XOR** `{ids, patches: {id: {...}}}` por producto), con ids deduplicados, tope `MAX_BULK_IDS`, escrituras en trozos de `BULK_CHUNK` agrupadas por `JSON.stringify(patch)` y `.select("id")` obligatorio para no reportar como actualizado un id inexistente. El whitelist y las reglas puras viven en `src/lib/product-patch.ts` / `src/lib/product-bulk.ts` porque un `route.ts` de Next **solo puede exportar handlers HTTP**. El lote deja **una** entrada agrupada (`product_bulk_update`) y `related_product_ids` entra en `AUDIT_FIELDS` (antes sus cambios no generaban diff). Siguen siendo por producto borrar, duplicar, generar imágenes, `applySeoBatch`, merge, purga y `bulkSaveImage` | ✅ |
| B3 | Productos ronda 8: **accesibilidad, orden y deep-links**. `src/lib/admin-product-sort.ts` como fuente única del orden (claves `name`/`price`/`stock`/`quantity`/`cost`/`created_at`, dirección por clave, cláusulas `ORDER BY` y degradación) compartida por el cliente y el listado; `aria-sort` en el `<th>` (no en el `<button>` interno), `aria-busy` + `opacity-60` en tabla/grid durante el refetch y región `role="status"`. Selector de orden con dirección y reset en la barra. Todo filtro viaja en la URL (`brokenImage` incluido) y `clearFilters` delega en `clearedProductFilters()`; las confirmaciones destructivas usan el diálogo accesible con foco atrapado en vez de `window.confirm`/`window.prompt` | ✅ |
| B4 | Productos ronda 8: **lotes largos con red**. Toda acción masiva ofrece deshacer (`setUndoAction`, incluidas WhatsApp, unidad, visibilidad, ofertas, etiquetas, categoría, precio y disponibilidad), y los lotes muestran barra de progreso (`aria-valuenow`/`aria-valuemax`) con **cancelar** y resumen de fallos parciales. `postBulk`/`bulkPatchEach` nunca lanzan: convierten el error en entradas `failed` por id, así que el panel dice cuántos fallaron en vez de morir a medias. Tamaños de página revisados (25/50/100/200) | ✅ |
| B5 | Productos ronda 8: **adelgazar el monolito y cubrirlo**. La página (>6 000 líneas) deja de acumular lógica: filtros, listado, selección y ejecución de lotes salen a `src/lib/admin-product-filters.ts`, `-list.ts`, `-selection.ts` y `-bulk-run.ts` (con tests), y el estado de cliente a `use-product-selection.ts` y `use-bulk-runner.ts`. Regla: si se puede probar sin React ni Supabase, va a `src/lib/`. Cobertura por capas: unitarias de los módulos puros + `e2e/admin-productos.spec.ts` (guardas de API para anónimos y robustez de deep-links, etiquetadas `@ci`) | ✅ |
| B6 | Productos ronda 9 — **índice de secciones en el modal de producto**. `ProductFormModal` dejó de ser un scroll de 900 px sin mapa: los campos se agrupan en 7 `<fieldset id="pf-sec-*">` (identidad, catálogo, imágenes, precios, inventario, SEO, publicación) y `FORM_SECTIONS` es la fuente única que alimenta el índice, así que añadir una sección es una línea. El índice se pinta dos veces con el mismo componente `SectionNav`: **rail fijo** de 160 px a la izquierda en `lg+` y **chips** con scroll horizontal en móvil (una sola fila, `overflow-x-auto`, sin wrap). La sección activa la resuelve un `IntersectionObserver` con `root` = cuerpo scrolleable del modal (no la ventana) y `rootMargin: "0px 0px -55% 0px"`, y se marca con `aria-current="true"`; los saltos usan `goToSection()`, que respeta `prefers-reduced-motion` (`behavior: auto` en vez de `smooth`) | ✅ |
| B7 | Productos ronda 9 — **el modal es un diálogo accesible de verdad**. `role="dialog"` + `aria-modal="true"` + `aria-labelledby="pf-dialog-title"` y `tabIndex={-1}` en el `<form>`; el foco inicial va al **diálogo** y no al primer input (para que en móvil no se despliegue el teclado al abrir), se **atrapa** con Tab/Shift+Tab sobre los controles habilitados del diálogo, `Escape` cierra (y si la confirmación de descarte está abierta, la cierra a ella primero), el clic en el velo cierra y el scroll del listado que queda detrás se bloquea (`body.overflow = hidden`, restaurado al desmontar) | ✅ |
| B8 | Productos ronda 9 — **guarda de cambios sin guardar**. Un `FormSnapshot` + `snapshotKey()` (JSON) y una línea base capturada una sola vez en `baselineRef` dan el booleano `dirty`, que alimenta tres cosas: el chip ámbar "Cambios sin guardar" en la cabecera, un `beforeunload` activo solo mientras hay cambios (cerrar la pestaña avisa) y `requestClose()`, que en vez de perder lo escrito abre la barra de confirmación de descarte. Con `saving` en curso el cierre está deshabilitado. La trampa es que un cambio de estado interno no cuenta como sucio: solo los campos del formulario entran en el snapshot | ✅ |
| B9 | Productos ronda 9 — **validación completa de una vez, con el foco donde falla**. `handleSubmit` acumula **todos** los errores en `fieldErrors` en lugar de abortar en el primero, de modo que el usuario ve de golpe qué falta; el resumen es una región `role="alert"` ("Revisa los campos marcados en rojo") y el foco más un `scrollIntoView({ block: "center" })` van al primer campo inválido, resuelto por `PRODUCT_FIELD_INPUT_IDS` (mapa campo → `id` del control, no consultas al DOM a mano). Las reglas viven en `src/lib/product-form.ts` (`validateProductForm()` devuelve `{ errors, firstInvalid, ...valores parseados }`) siguiendo la regla B5 —lógica pura fuera del componente— y por eso se prueban en `src/lib/product-form.test.ts` sin montar React. Las reglas espejan las del servidor (`create`/`update`): nombre obligatorio, precio/oferta/costo finitos y ≥ 0, cantidad y umbral enteros ≥ 0, `validateSku`/`validateBarcode` de `src/lib/sku.ts` y la ventana de oferta (no puede empezar después de terminar). `deriveStockStatus` sigue siendo la regla compartida para derivar el estado desde el umbral | ✅ |
| B10 | Productos ronda 9 — **error por campo, no solo un aviso arriba**. Tres helpers concentran el patrón en `ProductFormModal`: `fieldCls(key)` pinta el control con `border-red-300 bg-red-50/40`, `fieldA11y(key)` publica `aria-invalid` + `aria-describedby="pf-err-<campo>"` y `clearFieldError(key)` retira la marca en cuanto el usuario escribe en ese campo (y baja el resumen cuando ya no queda ningún error). El texto lo renderiza `FieldError` (`id` estable, sin `role`; ver B14). Cableado en nombre, SKU, código de barras, precio, oferta, costo, cantidad, umbral y la ventana de oferta (los dos `datetime-local` comparten el error `saleWindow` y lo anuncian con `aria-describedby`) | ✅ |
| B11 | Productos ronda 9 — **"Guardar y cerrar" desde la confirmación de descarte**. La lógica de guardado se separó en `submitForm()` (llamable sin evento) más un `handleSubmit` que solo hace `preventDefault`; la barra de descarte pasó a tres acciones ordenadas —**Descartar cambios** / **Seguir editando** / **Guardar y cerrar**— con la primaria al final, todas `disabled={saving}` y con spinner en la de guardar. "Guardar y cerrar" cierra primero el aviso (`setConfirmingClose(false)`) y después llama a `submitForm()`: si la validación falla el usuario ve los errores de campo en vez de la barra de descarte, y si guarda bien el modal lo cierra el padre desde `onSaved` (`handleFormSaved`), sin que el modal tenga que cerrarse solo | ✅ |
| B12 | Productos ronda 9 — **los errores del servidor marcan su campo**. `validateProductPatch` (`src/lib/product-patch.ts`) devuelve `field` en sus 25 ramas de error y `create`/`update` lo reenvían en el 400 (y en el 409 de SKU duplicado), así que un SKU repetido ya no cae solo en el aviso general. En el cliente, `formKeyForServerField(field)` (`src/lib/product-form.ts`) traduce el nombre del servidor al del formulario y `markServerField()` vuelca el mensaje a `fieldErrors` y lleva el foco al control; si el campo no se reconoce se mantiene el comportamiento anterior (aviso general). Contrato fijado por `src/lib/product-patch.test.ts` (una prueba por rama) y por los tests de `formKeyForServerField` en `src/lib/product-form.test.ts` | ✅ |
| B13 | Productos ronda 9 — **cobertura e2e del modal** (`e2e/admin-productos-modal.spec.ts`, `@ci`). Sin sesión corre siempre la guarda: `/admin/productos` no expone ni el diálogo ni `#pf-name` a anónimos. Con sesión (`E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD`; sin ellas los casos se saltan solos) se abren los 6 casos de comportamiento: enviar con nombre vacío y precio/costo/cantidad inválidos y ver los cuatro errores a la vez con el foco en `#pf-name` y el resumen anunciado; corregir el precio y ver desaparecer su error y su `aria-invalid`; `Escape` con cambios que abre la confirmación (y un segundo `Escape` que cierra la confirmación, no el modal); "Guardar y cerrar" con el precio inválido, que debe dejar a la vista el error y no la barra de descarte; "Descartar cambios", que sí cierra; y el índice marcando la sección visible al bajar el cuerpo del modal. Ningún caso guarda: el formulario se deja inválido a propósito | ✅ |
| B14 | Productos ronda 9 — **menos ruido en lectores de pantalla**. `FieldError` dejó de ser `role="alert"`: con 9 campos mal, un envío anunciaba 9 alertas encima del resumen. Ahora el único `role="alert"` del formulario es el resumen ("Revisa los campos marcados en rojo") y cada error de campo se anuncia al enfocar su control vía `aria-describedby` | ✅ |
| B15 | Productos ronda 10 — **conteos de los chips en una sola llamada**. La RPC `admin_product_filter_counts(p_include_deleted)` (migración `00118`) devuelve los 11 contadores de la barra de filtros más `brands` y `tagCounts` en un único viaje, en lugar de 11 `count: "exact"` + dos barridos de 1 000 filas. `src/lib/admin-product-counts.ts` valida el payload (descarta una RPC de la versión anterior sin `brands`/`tagCounts`) y el listado conserva el cálculo en JS como respaldo cuando la migración no está aplicada | ✅ |
| B16 | Productos ronda 10 — **historial por producto sin seq scan**. `idx_admin_audit_log_entity (entity, entity_id, created_at DESC)` (migración `00118`) respalda el panel de auditoría de un producto concreto | ✅ |
| B17 | Productos ronda 10 — **export e import comparten una sola cabecera**. `src/lib/product-csv.ts` es la fuente única (cabecera + celdas) del CSV de productos y el import valida las columnas contra ella: `validateImportColumns`/`describeImportColumns` en `src/lib/product-import.ts` marcan las obligatorias que falten (`nombre`, `precio`), el endpoint `import` responde **400** antes de tocar la base y el modal avisa en ámbar y bloquea la vista previa | ✅ |
| B18 | Productos ronda 10 — **cobertura de las rutas sin pruebas**. 11 `route.test.ts` nuevos (delete, duplicate, purge-trash, reorder, merge, store-prices, bulk-seo, audit, check-images, sales-report, upload-image) fijan el contrato actual, incluido lo que hoy degrada mal y queda anotado: `delete` responde 500 con JSON inválido o sin `deleted_at`, `audit` responde 500 si falta la tabla en vez de lista vacía, y `bulk-seo` devuelve 200 con fallos por producto en `failed[]` | ✅ |
| B19 | Productos ronda 10 — **escritura optimista sin pisar cambios ajenos**. `src/lib/product-conflict.ts` define el contrato: `PATCH /update` acepta `expectedUpdatedAt` y responde **409 `stale_write`** con `conflict.current` (fila y versión actuales) en vez de sobreescribir; `POST /bulk` acepta `expected` (mapa id → versión) y `force`, y devuelve los ids `stale` sin escribir. La migración `00119` añade el trigger `products_touch_updated_at` y su índice; el endpoint además sella `updated_at` explícitamente para funcionar antes de aplicarla. En el panel, la escritura de imagen, la de SEO y el guardado rápido mandan su versión previa, adoptan la devuelta y un banner ámbar ofrece recargar | ✅ |
| B20 | Productos ronda 10 — **vistas guardadas sobre la URL canónica**. `src/lib/product-filter-presets.ts` guarda la query normalizada (filtros + orden + tabla/tarjetas + tamaño de página), con tope de 8 y sin `page`. El panel deja de enumerar filtros a mano: lee/escribe la clave `admin-productos-vistas`, migra las vistas del formato anterior (`resurte-admin-product-views`) y marca la vista activa con su número de filtros | ✅ |
| B21 | Productos ronda 10 — **documentación y verificación**: esta tabla, el bloque de la ronda en `docs/agents/admin.md` (con el traspaso del envío desde el modal a la sesión del modal) y la pasada completa de la puerta de calidad | ✅ |

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
4. `/admin` con sesión admin: la alerta "N pedidos sin confirmar" abre
   `/admin/pedidos` ya filtrado por "Pendientes" (y la URL refleja el filtro);
   la alerta de cupón por expirar abre `/admin/marketing?code=<cupón>`, que
   resalta el cupón y permite quitar el foco; la alerta de leads abre
   `/admin/leads`. En "Pedidos recientes", el selector de "Repartidor" de un
   pedido no terminal asigna/desasigna sin salir del dashboard (y el toast
   confirma), mientras que un pedido entregado o cancelado muestra el nombre
   fijo en lugar del selector.
   Automatizado (guards y render sin sesión): `npx playwright test
   e2e/admin-deep-links.spec.ts`.

## Agentes de mantenimiento por dominio

Ver `docs/agents/` — perímetro, invariantes y verificación por feature.
