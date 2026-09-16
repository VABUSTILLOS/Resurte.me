# Resurte.me — Reporte de funcionalidades por rol + Plan de mejoras

Marketplace mayorista B2B de insumos para restaurantes (México) + suite SaaS de gestión restaurantera. Stack: Next.js 16 (App Router), React 19, Supabase, Stripe, Tailwind 4.

## Modelo de roles

| Rol | Cómo se define | Ámbito |
|---|---|---|
| **Cliente** (público/registrado) | `profiles.role = 'cliente'` (default) | Marketplace, compras, recompensas |
| **Vendedor** (comercial) | `profiles.role = 'vendedor'` | `/comercializacion` (CRM/ventas) |
| **Admin** | `ADMIN_EMAILS` env, `profiles.role='admin'` o tabla `admin_users` | `/admin` + todo lo anterior |
| **Roles del panel SaaS** | `dueño / gerente / cocina / mesero` (matriz `panel-roles.ts`, migración 00058) | `/panel` del restaurante |

---

## 1. Funciones del USUARIO (cliente)

### Marketplace y compras (`/`, `/[ciudad]`, `/[slug]/*`)
- Landing pública y catálogo por ciudad (`/cdmx`, `/guadalajara`, etc.) con datos reales cacheados (ISR).
- Catálogo: búsqueda, categorías, colecciones, ficha de producto (`/[slug]/buscar|categoria|coleccion|producto`).
- Precio por unidad (`$/kg`, `$/l`, `$/pieza`) en cards, búsqueda y ficha, con comparador de presentaciones (la más barata + sobreprecio de las demás).
- Carrito con **order bumps** (reglas admin + fallback dinámico por colección) y restauración de carrito (`/api/cart`).
- Checkout con Stripe (PaymentIntent vía `/api/payments/stripe/create-intent`, webhook `/api/webhooks/stripe`), cupones, upsells con descuento.
- Cuenta: favoritos, mis direcciones, mis pedidos, confirmación de pedido con emails.
- Auth: login, registro, reset de password, callback OAuth.
- PWA instalable con **share target**: al compartir una lista desde WhatsApp y elegir Resurte.me, `/compartir` la convierte en pedido (resuelve cada renglón contra el catálogo de la ciudad y separa lo encontrado de lo que hay que buscar).

### Recompensas (`/recompensas`)
- Wallet de cashback: saldo, historial filtrable (todo / ganado / canjeado) y exportable, progreso semanal y mensual (semana calificante ≥ $2,500 MXN).
- Tienda de servicios canjeables (`/api/redeem` + RPC `redeem_service`) con barra de avance por servicio y "Más cerca", tiers de lealtad, comprobante de canje con folio.
- Campana de notificaciones proactivas (cashback acreditado, semana en riesgo, cierre de semana), calculadora ROI, escáner de facturas, onboarding y feed de actividad (UI con framer-motion).

### Canal de restaurantes (FoodOS público)
- `/comer`: directorio de restaurantes para pedir directo sin comisiones.
- `/r/[slug]`: menú digital del restaurante (ISR, pre-render por slug), pedidos al restaurante.

### Portal B2B (`/negocio`)
- Cotizaciones por volumen (landing + WhatsApp/ejecutivo), línea de crédito 7/15/30 días, facturación CFDI 4.0 automática.
- Contenido: blog (MDX), FAQ, about, careers, contact, legal, RSS, sitemap.

## 2. Funciones del COMERCIAL (vendedor)

### `/comercializacion` (requiere rol vendedor o admin)
- **Dashboard**: KPIs, seguimientos pendientes, clientes para reorden, metas semanales, tendencias semanales.
- **Prospectos**: pipeline/CRM filtrado por `seller_id` (el vendedor solo ve lo suyo; el admin ve todo).
- **Pedidos**: gestión de pedidos del canal comercial.
- **Agente IA** (`/comercializacion/agente` + `lib/agente/llm.ts`): asistente con acceso a prospectos, mensajes y operación del vendedor.

## 3. Funciones del ADMIN (`/admin`, noindex)

- **Dashboard**: métricas de revenue, órdenes, AOV y conversión por período (recharts lazy).
- **Pedidos**: gestión y estados, con acciones masivas (cambio de estado, confirmar pago, asignar repartidor, exportar la selección) y filtros guardados; **Productos**: catálogo, imágenes (`update-images`, `kie-ai`), seed de productos.
- **Visibilidad / Disponibilidad**: qué productos se muestran y dónde.
- **Proveedores**, **Usuarios**, **Facturas** (CFDI), **Recompensas** (catálogo de servicios canjeables).
- **Conversión**: funnel; **Marketing**: campañas (incl. campañas FoodOS).
- **WhatsApp**: mensajería + automatizaciones; **Workflows**: flujos automáticos (confirmaciones, etc.).
- APIs admin: bump-rules, coupons, drivers, funnel, metrics, orders, products, suppliers, reward-services.
- Cron (`/api/cron`), notificaciones, leads, social-proof, reportes CSP.

## 4. Panel SaaS del restaurante (`/panel`)

12 herramientas con matriz de acceso por rol:

| Herramienta | dueño | gerente | cocina | mesero |
|---|:-:|:-:|:-:|:-:|
| Ventas, Comanda | ✓ | ✓ | (comanda ✓) | ✓ |
| Mermas, Inventario | ✓ | ✓ | ✓ | — |
| Costeo, Planificador, Rentabilidad, Analítica, Temporada, Apertura, FoodOS | ✓ | ✓ | — | — |
| Personal (gestión de miembros) | ✓ | — | — | — |

- FoodOS: menú digital, combos, pedidos, clientes, tablero y configuración del restaurante; `/panel/unirse` para sumar miembros.
- Escritura granular por clave (config solo dueño; backup solo dueño; platillos dueño/gerente).

---

# Plan de mejoras

## A. Usuario / marketplace
1. **Checkout**: agregar OXXO/SPEI vía Stripe (mercado MX), guardado de tarjeta y compra en 1 clic; retry de pago fallido desde "mis pedidos".
2. **Pedidos**: tracking en tiempo real (estados + notificación WhatsApp/email por cambio), reorden en 1 clic, descarga de CFDI desde "mis pedidos".
3. **Recompensas**: notificaciones proactivas de cashback por expirar, referidos con QR compartible, historial filtrable/exportable.
4. **Catálogo**: filtros por precio/marca/disponibilidad, listas de compra recurrentes ("mi canasta semanal"), comparador de precio por unidad.
5. **Cuenta**: perfil con RFC/datos fiscales editables (hoy el flujo de facturación es landing + proceso manual), centro de notificaciones.

## B. Comercial
1. **CRM**: estados de pipeline configurables, recordatorios push/email de follow-ups vencidos, importación de prospectos por CSV.
2. **Agente IA**: acciones transaccionales (crear cotización, agendar seguimiento) además de consulta; resumen diario por WhatsApp al vendedor.
3. **Metas**: metas mensuales además de semanales, leaderboard de vendedores, alertas de clientes inactivos con sugerencia de reorden.
4. **Comisiones**: cálculo y reporte de comisiones por vendedor.

## C. Admin
1. **Facturación**: timbrado CFDI automático integrado a PAC (hoy es parcialmente manual), cancelación y complementos desde el backoffice.
2. **Logística**: asignación de drivers a pedidos con ruta y prueba de entrega (existe API `drivers`, falta UI operativa completa).
3. **Inventario del marketplace**: alertas de stock bajo y sincronización con disponibilidad.
4. **Moderación FoodOS**: aprobación de restaurantes/menús antes de publicarse en `/comer`.
5. **Auditoría**: bitácora de acciones admin (quién cambió precio/visibilidad/estado) y roles admin granulares (ops vs marketing vs finanzas).
6. **Reportes**: exportación CSV/Excel de métricas y pedidos, cohortes de recompra.

## D. Panel SaaS
1. **Sincronización nube** de las herramientas (hoy storage por claves; consolidar multi-dispositivo real-time con Supabase Realtime).
2. **Reportes fiscales/nómina** desde Personal y Ventas; exportación a Excel.
3. **FoodOS**: pagos en línea al restaurante, integración con impresoras de comandas, estadísticas de menú (vistas → pedidos).
4. **Onboarding guiado** del restaurante (checklist: menú → costeo → primera venta).

## E. Transversal / técnico
1. **Tests e2e** de los flujos críticos de dinero (checkout, redeem, crédito) — ampliar cobertura Playwright.
2. **Observabilidad**: alertas sobre `/api/log-error`, Sentry o similar; dashboard de salud de webhooks Stripe.
3. **Consolidar fuentes de rol admin** (env + profiles + admin_users → una sola fuente gestionable).
4. **i18n**: extender `t()` a todo el sitio (hoy parcial) si se planea inglés.
5. **Performance**: revisar rutas admin client-heavy, paginación de pedidos/productos.

## Priorización sugerida
- **P0 (dinero/riesgo)**: A1 pagos MX, A2 tracking/CFDI, C1 timbrado automático, E1 tests de flujos de dinero.
- **P1 (retención/ventas)**: A3 recompensas proactivas, B2 agente transaccional, B3 alertas de reorden, C6 reportes.
- **P2 (operación/escala)**: C2 logística, C5 auditoría, D1 realtime, D3 pagos FoodOS.
- **P3 (crecimiento)**: A4 listas recurrentes, B4 comisiones, E4 i18n.

## Avance implementado (2026-09-12, sin credenciales externas)
- ✅ **E1**: `e2e/money-flows.spec.ts` — 10 tests e2e de flujos de dinero (validación zod de `/api/orders` y `create-intent`, whitelist de métodos de pago, rechazo de `amount` del cliente, cupón UI inválido/válido/quitar).
- ✅ **C6 (parcial)**: botón "Exportar CSV" en `/admin/pedidos` (respeta filtro/búsqueda; helper `src/lib/csv.ts` con BOM UTF-8 + tests).
- ✅ **A3 (parcial)**: QR del link de referido en `ReferralDashboard` (compartir en persona) y exportación CSV del historial completo del monedero en `ActivityFeed`.
- ✅ **C3**: banner de alertas de inventario en `/admin/productos` (conteo de stock bajo/agotado con filtro de un clic).
- ✅ **C6**: exportación CSV del funnel en `/admin/conversion` (resumen + toques de recuperación + UTM).
- ✅ **B3**: meta mensual de ventas en el dashboard de comercialización (`getMonthlyRevenueGoal`, env `SELLER_MONTHLY_GOAL_REVENUE`, default semanal ×4.33) + 3 tests.
- ✅ Refactor: módulo CSV consolidado en `src/lib/csv.ts` (el de comercialización ahora re-exporta, `@deprecated`).
- Nota: la whitelist de `/api/orders` ya admite `spei`, `oxxo`, `mercado_pago` y `codi`; A1 requiere habilitar esos métodos en la cuenta de Stripe y la UI de confirmación.
- Nota 2: B1 (importar prospectos CSV) y B4 (exportar comisiones) ya existían (`import-csv-modal.tsx`, "Exportar mes" en el dashboard de comercialización).
- ✅ **C5 (ligero)**: bitácora de acciones admin — `src/lib/audit.ts` registra cambios de estado/pago/repartidor en `/api/orders/[id]/status` (log estructurado `[AUDIT]` + notificación `admin_audit` a todos los admins), feed "Bitácora de actividad" en el dashboard `/admin`, API `GET /api/admin/audit-log` (solo admins), tests unitarios + e2e de guards (`e2e/admin-audit.spec.ts`). Sin migración: reutiliza `notifications` (00073).
- Nota 3: A4 ya estaba cubierto — `search-page-client.tsx` tiene toggle "Solo disponibles", rangos de precio y orden por precio/nombre. R3.4 (guards `/admin` sin sesión) ya estaba en `e2e/auth.spec.ts`; i18n del panel ya cubre las 5 páginas restantes.
- ✅ **B2**: agente IA transaccional — `getDailyBriefing` (resumen del día con IA + fallback) + `BriefingModal` (copiar/compartir WhatsApp) + atajo "Hacer pedido" en la cola (commit `d06091e`).
- ✅ **A4**: "Mi canasta" — listas de compra recurrentes en localStorage (`shopping-lists.ts`), guardar carrito como lista, Mis listas con reordenar/renombrar/borrar en `/carrito` (commit `081e186`, 6 tests).
- ✅ **B3**: alertas de reorden específicas — `getClientsToReorder` con productos del último pedido + días sin pedir, badge de inactividad >14d, mensaje WhatsApp con el detalle (commit `081e186`, 2 tests).
- ✅ **A1 (parcial)**: instrucciones de pago SPEI/OXXO en `pedido-confirmado` (CLABE/referencia por env `NEXT_PUBLIC_SPEI_CLABE`/`_BENEFICIARIO`/`_OXXO_REFERENCIA`); el admin confirma el cobro manualmente (commit `081e186`).
- ✅ **E2**: `/admin/bitacoras?tab=errores` (antes `/admin/errores`) — salud de la app leyendo `error_logs` (conteos por severidad, filtro por fuente client/server/edge, export CSV), sin Sentry. Link en sub-nav (commit `9d679cb`).
- ✅ **C6**: export CSV de la cola de facturas en `/admin/recompensas?tab=facturas` (antes `/admin/facturas`) (commit `9d679cb`).
- ⏸️ **C2 prueba de entrega**: pospuesta (requiere migración `orders.delivery_proof_url`; el usuario decidió no tocar la BD por ahora).
- ✅ **A3**: ronda de recompensas sin migración — (1) **fix**: el cashback de pagos con tarjeta ya no se acredita en silencio (`notifyCashbackCredited` lee el crédito real de `wallet_transactions` y es el productor único, usado por el webhook de Stripe, el reconciliador y el cambio de estado admin); (2) **proactividad semanal**: bloque "Esta semana" en la meta + avisos deterministas por semana ISO (`wallet-progress.ts`); (3) **transparencia**: filtros y CSV filtrado en Actividad, "Total ganado / Total canjeado" en el monedero (`wallet-summary.ts`); (4) **canje claro**: barra de avance y "Más cerca" en la tienda (`store-affordability.ts`), comprobante con folio y CTAs explícitos en el checkout (sin redirección automática); (5) **accesibilidad** de la campana (roles, foco, `aria-*`).
- ✅ **C13 / BL11 / BL12 / N11**: ronda mixta catálogo + blog + navegación, sin migración — (1) **precio por unidad**: `src/lib/unit-price.ts` normaliza el texto libre de `products.unit` (`por kilo`, `500 g`, `1 l`, `por pieza`…) a un precio por kg/l/pieza con tests propios; la ficha de producto muestra el `$/kg` real y una sección "Comparar presentaciones" que marca la más barata y el sobreprecio (`+N%`) de las demás, y las cards y la búsqueda global llevan la insignia `$/kg`; (2) **índice del artículo**: `article-toc.tsx` reutiliza `extractHeadings` (los ids ya coinciden con los anclajes de `rehypeHeadingAnchors`), aparece a partir de 3 H2 y marca la sección visible con `aria-current="location"` (un e2e en `smoke.spec.ts` comprueba que cada enlace apunte a un encabezado real y que el activo siga al scroll, en escritorio y móvil); (3) **reduced motion** en la barra de progreso de lectura (`reading-progress.tsx` ya existía); (4) **mega-menú de categorías**: `/api/categories` (categorías + conteo de productos visibles, cacheado, sin `cookies()` para no romper el prerender) y `category-mega-menu.tsx`, que carga el catálogo solo al abrir por primera vez y cierra con Escape (devolviendo el foco al disparador), con clic fuera y al cambiar de ruta; el panel se ancla a la fila del header en vez del disparador para no desbordar la ventana a 640px (un e2e en `keyboard.spec.ts` lo fija midiendo la caja a 1280px y 640px).
- ✅ **A14 / W8**: ronda mixta admin + PWA, sin migración — (1) **acciones masivas de pedidos** en `/admin/pedidos`: checkbox por renglón + "seleccionar todos los visibles" (encabezado indeterminado con selección parcial), barra con cambio de estado, confirmación de pago y asignación de repartidor, y exportación CSV solo de la selección; las reglas de elegibilidad son puras (`src/lib/order-bulk.ts`, 28 tests) y el fan-out es **secuencial** contra el `PATCH /api/orders/[id]/status` existente para no duplicar ni perder efectos por pedido (cupones, `payment_status: "failed"` al cancelar, workflows de WhatsApp, cashback, auditoría) — la cancelación masiva pide `window.confirm`; (2) **share target PWA** (`W8`): `manifest.json` declara `share_target` GET hacia `/compartir` (+ 4.º shortcut), y `/compartir` es una página **estática** (`robots: noindex`) que resuelve cada renglón contra el catálogo de la ciudad en el cliente en tandas de 5, separando "Encontrados" (checkbox + stepper) de "Sin coincidencia" (deep link a `/{ciudad}/buscar?q=`); el parseo (cantidad, unidad, viñetas, URLs, tope de 20) vive en `src/lib/share-list.ts` (27 tests) y nada entra al carrito sin confirmar (un `addOrderItems`, un toast y un `addToCart` por ítem). Sin service worker nuevo: al ser GET no necesita handler de `fetch`. Verificado por `e2e/compartir.spec.ts` (14 casos, `chromium` + `mobile-chromium`).
- Pendientes con credenciales externas: C1 (PAC para timbrado CFDI), A1 completo (confirmación Stripe OXXO/SPEI en la cuenta).
