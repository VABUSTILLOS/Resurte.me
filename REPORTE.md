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
