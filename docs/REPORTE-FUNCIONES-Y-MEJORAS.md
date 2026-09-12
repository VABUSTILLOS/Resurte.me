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
- Carrito con **order bumps** (reglas admin + fallback dinámico por colección) y restauración de carrito (`/api/cart`).
- Checkout con Stripe (PaymentIntent vía `/api/payments/stripe/create-intent`, webhook `/api/webhooks/stripe`), cupones, upsells con descuento.
- Cuenta: favoritos, mis direcciones, mis pedidos, confirmación de pedido con emails.
- Auth: login, registro, reset de password, callback OAuth.

### Recompensas (`/recompensas`)
- Wallet de cashback: saldo, historial, progreso mensual (semana calificante ≥ $2,500 MXN).
- Tienda de servicios canjeables (`/api/redeem` + RPC `redeem_service`), tiers de lealtad.
- Calculadora ROI, escáner de facturas, onboarding y feed de actividad (UI con framer-motion).

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
- **Pedidos**: gestión y estados; **Productos**: catálogo, imágenes (`update-images`, `kie-ai`), seed de productos.
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
- Nota: la whitelist de `/api/orders` ya admite `spei`, `oxxo`, `mercado_pago` y `codi`; A1 requiere habilitar esos métodos en la cuenta de Stripe y la UI de confirmación.
- Pendientes con credenciales externas: C1 (PAC para timbrado CFDI), A1 (Stripe MX para OXXO/SPEI).
