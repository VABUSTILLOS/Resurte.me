# Reporte — Revivir código muerto: Resurte.me

Auditoría de código sin uso e integración de cada módulo huérfano en flujos vivos de la app.
**Objetivo cumplido**: ningún módulo fue borrado; todos quedaron **en uso** (mejorados y cableados).

## Resumen de resultados

| Módulo | Estado inicial | Estado final | Riesgo |
| --- | --- | --- | --- |
| `src/lib/supabase/middleware.ts` | 0 imports | En uso (vía `proxy.ts`) | Bajo |
| `cn()` en `src/lib/utils.ts` | 0 usos | Adoptado en ~15 componentes | Bajo |
| `src/lib/feature-flags.ts` | 0 imports | Operativo (banner promocional + A/B) | Bajo |
| `src/app/api/payments/stripe/create-intent` | Sin llamadores | Cableado en checkout | Medio |
| `src/components/city/city-page-client.tsx` | 0 imports, mocks | Datos reales + página `/catalogo/[slug]` | Medio |
| `src/components/panel/{NumberInput,StatCard}` | 0 imports | Adoptados en panel + variantes `cva` | Bajo |
| `src/lib/data.ts` | 0 imports | Consolidado en capa de datos viva | Medio |
| `src/lib/wallet-actions.ts` | 0 imports | Server actions en recompensas + `/api/redeem` | Medio-alto |
| `src/lib/i18n/es.ts` | 0 imports | `t()` en shell del panel + 4 páginas core | Bajo |
| Deps `class-variance-authority`, `clsx`, `tailwind-merge` | Sin uso real | En uso vía `cva` y `cn()` | Bajo |

Verificación: `npx tsc --noEmit` ✅ · `npx next build` ✅ · `npx vitest run` (10/10) ✅ · lint sin errores nuevos (los existentes son preexistentes) ✅ · knip ya no reporta los módulos integrados ✅

---

## 1. `src/lib/supabase/middleware.ts` → proxy

- **Estado inicial**: `updateSession()` 0 imports; `src/proxy.ts` (convención proxy de Next.js 16) repetía inline el refresh de cookies `sb-` + `getUser()`.
- **Integración**: `proxy.ts` ahora llama a `updateSession()` con el skip-list de rutas y el retorno de cookies; se eliminó la duplicación.
- **Archivos**: `src/lib/supabase/middleware.ts`, `src/proxy.ts`.
- **Riesgo**: bajo (auth cookies). Requiere smoke de login/logout.

## 2. `cn()` → adopción en componentes

- **Estado inicial**: export de `cn()` en `utils.ts` con 0 usos; componentes construían `className` con template literals.
- **Integración**: `cn()` (clsx + tailwind-merge) adoptado en componentes: `search-page-client`, `product-card`, `city-landing`, `city-page-client`, `scroll-reveal`, `testimonial-carousel`, `storefront`, `ThemeToggle`, `NumberInput`, `StatCard`, páginas del panel, etc.
- **Archivos**: `src/lib/utils.ts` + ~15 componentes/páginas.
- **Riesgo**: bajo.

## 3. `src/lib/feature-flags.ts` → operativo

- **Estado inicial**: framework completo (flags + A/B) sin importar; sin `NEXT_PUBLIC_FEATURE_*` en env.
- **Integración**:
  - `NEXT_PUBLIC_FEATURE_PROMO_BANNER` documentado y operativo: enciende/apaga el nuevo `PromoBanner` en la landing.
  - `getABVariant`/`trackABConversion` conectados vía `analytics.tsx` (gtag) para variantes de CTA.
- **Archivos**: `src/lib/feature-flags.ts`, `src/components/ui/promo-banner.tsx`, `src/lib/analytics.tsx`, `src/app/[slug]/page.tsx`, `.env.local.example`.
- **Riesgo**: bajo.

## 4. `create-intent` → checkout

- **Estado inicial**: `POST /api/payments/stripe/create-intent` nunca llamado; `POST /api/orders` creaba el `clientSecret` inline (mezcla de responsabilidades).
- **Integración**: el checkout llama a `POST /api/payments/stripe/create-intent` para obtener el `clientSecret`; `api/orders` solo registra la orden.
- **Archivos**: `src/app/api/payments/stripe/create-intent/route.ts`, `src/app/api/orders/route.ts`, `src/app/[slug]/checkout/page.tsx`.
- **Riesgo**: medio (flujo de pago). Requiere checkout de prueba.

## 5. `city-page-client.tsx` → datos reales + catálogo

- **Estado inicial**: 0 imports; renderizaba catálogo con `MOCK_PRODUCTS`/`MOCK_CATEGORIES`.
- **Integración**: `MOCK_*` reemplazados por datos reales (`getCached*` de catalog-cache); `city-landing.tsx` pasa a usar el componente; nueva página `/catalogo/[slug]` con el componente.
- **Archivos**: `src/components/city/city-page-client.tsx`, `src/components/city/city-landing.tsx`, `src/app/catalogo/[slug]/page.tsx`.
- **Riesgo**: medio. Verificar `/cdmx`, `/guadalajara`, etc.

## 6. `NumberInput` / `StatCard` + `cva`

- **Estado inicial**: 0 imports; páginas del panel reimplementaban componentes locales equivalentes.
- **Integración**: adopción de los componentes compartidos en el panel; variantes con `class-variance-authority` (`cva`) en `StatCard` y `NumberInput` — revive la dependencia.
- **Archivos**: `src/components/panel/NumberInput.tsx`, `src/components/panel/StatCard.tsx`, `src/app/panel/foodos/clientes/page.tsx` y demás páginas del panel.
- **Riesgo**: bajo (UI).

## 7. `src/lib/data.ts` → consolidación de la capa de datos

- **Estado inicial**: 0 imports; `catalog.ts` + `catalog-cache.ts` duplicaban sus queries.
- **Integración**: `data.ts` pasa a ser la **única capa de acceso a datos**; `catalog-cache.ts` (wrappers `unstable_cache`) delega en `data.ts`. Se elimina la duplicación de queries y la cache se reutiliza.
- **Archivos**: `src/lib/data.ts`, `src/lib/catalog.ts`, `src/lib/catalog-cache.ts`, consumidores (`buscar/actions`, `coleccion`, `sitemap.xml`, `storefront`, `city-*`).
- **Riesgo**: medio. Verificado con build + rutas de catálogo/landing.

## 8. `src/lib/wallet-actions.ts` → recompensas + mejoras

- **Estado inicial**: 0 imports; `redeemCredits` superado por `/api/redeem` + RPC `redeem_service`; saldo/historial/tier duplicados en queries client-side de recompensas.
- **Integración**:
  - `getWalletBalance`, `getWalletHistory`, `getMonthlyCashbackProgress` (nueva: incluye `monthlySpend` y usa `QUALIFYING_WEEK_MIN` desde `utils.ts`) y **nueva** `getTotalRewards` como server actions usadas en `recompensas/page`, `ActivityFeed`, `LoyaltyTierCard`, `DashboardScreen`.
  - **`redeemCredits` mejorada**: firma `(userId, service: {id, name, cost})`, llama al RPC `redeem_service` (FOR UPDATE) con client service-role; `/api/redeem` delega en ella (conserva dedupe de idempotencia 5 min en `redemptions`).
  - `getUserPurchaseHistory` cableada en `mis-pedidos/page.tsx` (elimina el query client-side duplicado).
- **Archivos**: `src/lib/wallet-actions.ts`, `src/lib/utils.ts`, `src/app/recompensas/page.tsx`, `_components/{ActivityFeed,LoyaltyTierCard,DashboardScreen}.tsx`, `src/app/api/redeem/route.ts`, `src/app/[slug]/mis-pedidos/page.tsx`.
- **Riesgo**: medio-alto (dinero). Requiere pruebas manuales de saldo, historial y canje.

## 9. `src/lib/i18n/es.ts` → capa `t()` del panel (fase 1)

- **Estado inicial**: 0 imports; textos hardcodeados en español en el panel.
- **Integración**: `t()` introducido en el shell (`panel-layout-client`: título, selector de cocina, "Actual", "Quitar selección", banner) y en las páginas core `costeo`, `ventas`, `inventario`, `mermas` (títulos, empty states, botones, aria-labels). Se añadieron claves `panel.*` y se alinearon valores con el texto real del producto. `ThemeToggle` ya usaba `t()`.
- **Archivos**: `src/lib/i18n/es.ts`, `src/app/panel/panel-layout-client.tsx`, `src/app/panel/{costeo,ventas,inventario,mermas}/page.tsx`.
- **Riesgo**: bajo. Queda el resto de páginas del panel para una fase 2 (mismo patrón).

## 10. Dependencias y env

- **`class-variance-authority`**: ahora en uso vía `cva` (ítem 6).
- **`clsx` / `tailwind-merge`**: en uso vía `cn()` (ítem 2).
- **`.env.local.example`**: agregadas `ADMIN_API_SECRET`, `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`; documentados alias `FBPIXEL`/`GOOGLEANALYTICS`; `PLAN` opcional (scripts); marcadas como no usadas `CONEKTA_*`, `MERCADOPAGO_ACCESS_TOKEN`, `NEXT_PUBLIC_APP_NAME`.

---

## Observaciones (deuda técnica registrada, no corregida)

- `scripts/*` — migraciones/seeders one-off y herramientas dev manuales. Documentadas, sin tocar.
- `mock-orders.ts` / `mock-products.ts` — usados en páginas de producción (admin/mis-pedidos); deuda técnica a resolver cuando existan datos reales completos.
- ~132 imágenes de producto sin referencia directa en código — candidatas a verificar contra `products.image_url` en Supabase (si están en DB, están en uso).
- Knip sigue reportando módulos fuera de alcance de esta tarea (`lib/images.ts`, `lib/blog.ts`, `lib/recipes.ts`, `lib/whatsapp.ts`, tipos de `foodos.ts`/`index.ts`, `Skeleton.tsx` en recompensas, `sharp`/`vercel` devDeps) — candidatos a una siguiente iteración.

---

# Segunda auditoría — knip (wave 2)

Escaneo `npx knip` sobre la base de la primera ola. Resultados: 25 archivos sin uso (23 `scripts/*` + `Skeleton.tsx`), 2 devDeps sin uso (`sharp`, `vercel`), 1 dep no listada (`unified`), 58 exports sin uso y 26 tipos sin uso. Misma filosofía: **revivir/integrar, no borrar**.

## Verificación final

- `npx knip` → solo queda el Grupo D documentado (0 en A/B/C). ✅
- `npx tsc --noEmit` ✅ · `npm run lint` sin errores nuevos ✅ · `npx vitest run` ✅ · `npx next build` ✅

## Grupo A — Sobre-exportados (se quita `export`; viven dentro del módulo)

Símbolos usados solo internamente que ya no se exportan: `ProgressRing`, `LoyaltyTierCard`, `comboValue`, `normalizeCategory`, `BLOG_DIR`, `DEFAULT_PANEL_CONFIG`, `toBaseQty`, `getABVariant`, `COLLECTION_COVERS`, `clearGuestToken`, `es` (i18n), `upsertCatalogProduct`, `setProductPrice`, `deleteCatalogProduct`, `getCatalogProducts` (whatsapp), y los tipos `AdminOrderItem`, `BlogFAQ`, `BlogCTAVariant`, `BlogCTAConfig`, `MockOrder`, `TemplateComponent`, `TemplateParameter`, `OrderWithDetails`. `Skeleton` en recompensas deja de exportarse (solo `DashboardSkeleton` es la API pública).

## Grupo B — Revividos cableando en flujos vivos

| # | Ítem | Integración | Riesgo |
| --- | --- | --- | --- |
| B1 | `getProductSchema`/`getBreadcrumbSchema` | JSON-LD `Product` + `BreadcrumbList` en `/producto/[productSlug]`; breadcrumbs en `/catalogo`, `/coleccion`, `/categoria` | Bajo |
| B2 | `runNewOrderWorkflows` | `POST /api/orders` → tras registrar la orden: notificar staff + confirmar al cliente | Medio (WhatsApp) |
| B3 | `resetCatalogCache` | Admin routes `update`, `toggle-visibility`, `seed-products`, `update-images` (junto a `revalidateCatalogCache`) | Bajo |
| B4 | `DashboardSkeleton` | `loading.tsx` en `/recompensas` | Bajo |
| B5 | `ProductCardGrid` | Grids de `/catalogo/[slug]`, `/categoria/[categorySlug]`, `/coleccion/[collectionSlug]` | Bajo |
| B6 | `WhatsAppBadge`/`OrderByWhatsAppButton` | CTA "ordenar por WhatsApp" en `/producto/[productSlug]` | Bajo |
| B7 | `searchPosts` + `getContentType` | Filtro búsqueda/categoría en `blog-index-client`. `searchPosts` se extrae a `lib/blog-search.ts` (función pura client-safe, sin `fs`) y `lib/blog.ts` la envuelve para uso server-side; `blog/page.tsx` pre-filtra con `?q=` (SEO) | Bajo |
| B8 | `generateMockOrders` | Reemplaza el generador local duplicado en `dashboard-sidebar` | Bajo |
| B9 | `getAllRecipes` | Índice/base de recetas del panel planificador | Medio |
| B10 | `createClientOrNotFound` | **Decisión**: no encaja hoy — home/city degradan a render vacío por diseño y las API routes necesitan errores JSON. Se documenta como utilidad para futuras server pages | — |
| B11 | `getCurrentUser` | Centraliza `createClient()+auth.getUser()` en `page.tsx` y `[slug]/page.tsx` | Medio |
| B12 | `AnalyticsEvents` | Refactor de llamadas gtag inline → constantes: viewItem, addToCart, beginCheckout(items), purchase(value?, items?), repeatOrder, search, lead, signUp (8 call sites) | Bajo |
| B13 | `CASHBACK_TIERS` | `TIER_CONFIGS` deriva `name`/`pct` de `CASHBACK_TIERS` vía `TIER_INDEX` (fuente única de % por tier) | Bajo |
| B14 | `useOnboardingCompleted` | Banner de bienvenida post-onboarding en `DashboardScreen` de recompensas | Bajo |

## Grupo C — Tipos de features vivas (cablear el tipo donde la feature ya existe)

- **Coupon**: `Coupon.expires_at` → `string | null` (alineado con migración 00001). `api/orders` tipa `CouponRow extends Pick<Coupon, ...>`; `api/coupons/validate` devuelve `AppliedCoupon`; `cart/coupon-input.tsx` tipa el fetch con `AppliedCoupon` y el error con `{ error?: string }`.
- **WhatsApp**: `WhatsAppTemplateStatus` usado en `send-template` (check de aprobación); `WhatsAppMessage` (Pick) tipa el insert del log en `whatsapp_messages`; `WhatsAppTemplate` tipa la consulta `.maybeSingle<Pick<...>>()`; `WhatsAppAutomation` tipa `MOCK_AUTOMATIONS` en `api/whatsapp/automations`. La página admin `automations` sigue con `AutomationUI` local (UI mock) — `AUTOMATION_TEMPLATE_MAP` es la fuente de los `templateName`.
- **Foodos**: las unions `FoodosRestaurantStatus`, `FoodosRuleTriggerType`, `FoodosOrderChannel`, `FoodosFulfillment`, `FoodosPaymentStatus` y `FoodosCampaignStatus` ahora se importan y usan directamente en `panel/foodos/actions.ts` y `panel/foodos/pedidos/page.tsx` (en vez de acceso indexado `T["status"]`): `FULFILLMENT_LABEL: Record<FoodosFulfillment, string>`, `CHANNEL_OPTIONS` tipado, `PAID: FoodosPaymentStatus`, `"failed" satisfies FoodosCampaignStatus`.
- **CashbackTier**: queda vivo al consolidar `CASHBACK_TIERS`/`TIER_CONFIGS` (B13).

## Grupo D — Documentado (deuda técnica, no se toca)

- `scripts/*` (24): migraciones/seeders one-off y herramientas dev manuales (`test-workflows.ts`, `validate-whatsapp.ts`, generadores de imágenes, fetch de covers/recetas). No se borran.
- devDeps `sharp` (usado por scripts de imágenes) y `vercel` (CLI deploy manual): se conservan como tooling.
- `unified`: **agregada a `dependencies`** en `package.json` (dep real de `lib/blog-rss-html.ts` que faltaba en el manifest).
- **Constantes mock** `COLLECTION_*` (12) y `IMG_*` (13) en `lib/images.ts`: candidatas a purga cuando se elimine el mock de producción.
- `StoreSkeleton` (recompensas): skeleton del tab Store sin consumidor — queda para un futuro lazy-load de `StoreScreen`.
- **Contract types sin feature consumidora** (decisión: no borrar, documentar):
  - `Profile`, `DeliveryZone` (types/index.ts) — contrato de tablas/datos no implementadas.
  - `WalletState`, `OnboardingStep` (recompensas) — el estado/onboarding actuales usan estructuras locales distintas.
  - `RecipeGroup` (lib/recipes) — `getAllRecipes` devuelve un shape plano; el grupo tipado espera la futura agrupación.
  - `WhatsAppTemplateType` — la union de tipos de template que requiere el flujo de sync con Meta (hoy solo se usa el `status`).
- `createClientOrNotFound` (supabase/server): ver decisión B10.

## Observaciones nuevas

- **Bloqueador de build resuelto**: `blog-index-client.tsx` (componente `"use client"`) importaba `searchPosts` desde `lib/blog.ts`, que usa `node:fs` → Turbopack fallaba ("chunking context does not support external modules: node:fs"). Se extrajo el filtro a `lib/blog-search.ts` (puro, sin `fs`); el cliente lo usa sobre los posts que recibe por props y el server pre-filtra con `?q=`. `next build` ✅.
- `AutomationUI` en `admin/whatsapp/automations` y `MOCK_AUTOMATIONS` en `api/whatsapp/automations` son mocks — el POST queda con `TODO: Upsert en Supabase whatsapp_automations` (la tabla requiere `store_id`, esquema B2B pendiente).
- `handleIncomingMessage` (webhook whatsapp) solo loggea a console — no inserta en `whatsapp_messages` (modelo de tenant pendiente). `WhatsAppMessage` queda listo para ese insert.
