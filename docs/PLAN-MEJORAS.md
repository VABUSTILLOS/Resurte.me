# Plan Maestro de Mejoras — Resurte.me

> Programa de mejora continua por feature. **Oleadas 1 y 2 implementadas** en la rama
> `mejoras/plan-maestro-ux`. Oleada 1: fases 1-10 por feature. Oleada 2 (fases 11+):
> compra fácil priorizando móvil — todo lo que el usuario necesita para pedir sin
> confundirse. El backlog restante queda al final.
>
> Convenciones: ✅ implementada en esta rama · 🔜 backlog priorizado.

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
| G12 | **Service worker offline** (`public/sw.js`): estáticos cache-first, páginas network-first con respaldo en caché; nunca cachea /api, /auth, /admin, /panel | ✅ |
| G13 | Registro del SW solo en producción (`RegisterSW`) | ✅ |

## 2. PWA e instalación

| # | Fase | Estado |
|---|---|---|
| W1-W4 | id/scope, maskable, shortcuts, theme_color | ✅ |
| W5 | standalone + safe areas (auditado) | ✅ |
| W6 | OfflineBanner como puente offline | ✅ |
| W7 | **Banner de instalación A2HS**: `beforeinstallprompt` en Android + instrucciones Compartir→"Añadir a inicio" en iOS; tras 25 s de engagement, dismiss persistente, sin colisiones con cookie banner/BottomTabBar | ✅ |
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
| C11 | **Stepper − N + en la card cuando el producto ya está en el carrito** — ajustar cantidades de un pedido grande sin abrir el drawer; siempre visible, con haptic y aria-live | ✅ |
| C12 | **Rail "Vistos recientemente"** en la página de producto (localStorage, scroll horizontal con fade) | ✅ |
| C13 | Comparador de precios por kilo/pieza entre presentaciones | 🔜 |

## 4. Carrito y checkout

| # | Fase | Estado |
|---|---|---|
| K1-K5 | Foco, overscroll, aria-live, haptic, aria-labels en drawer y barra | ✅ |
| K6-K10 | autocomplete/inputMode/enterKeyHint, htmlFor, radiogroup, required, grupos etiquetados | ✅ |
| K11 | **Autoguardado de la última dirección + botón "Usar mi última dirección"** — el cliente B2B repite la misma cocina cada semana | ✅ |
| K12 | **Swipe-down para cerrar el drawer** con handle visual y haptic (patrón app nativa) | ✅ |
| K13 | Reanudar el paso exacto del checkout tras interrupción | 🔜 |

## 5. Recompensas

| # | Fase | Estado |
|---|---|---|
| R1-R4 | Sync `?tab=`, refresh al volver, aria en tabs, **fix tab bar móvil** | ✅ |
| R5-R8 | Título por sección, overscroll, error boundary, OG | ✅ |
| R9-R10 | Haptic y scroll-to-top al cambiar de sección | ✅ |
| R11 | **Pull-to-refresh del saldo** con indicador animado (patrón app nativa) | ✅ |
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
| P11 | **Atajos 1-9 para abrir herramientas** (sin robar teclas de campos ni con modificadores) | ✅ |
| P12 | Widget de pedidos de la tienda en el hub | 🔜 |

## 8. Administración

| # | Fase | Estado |
|---|---|---|
| A1-A5 | Auto-refresh 60 s, actualizar manual, timestamps relativos, reintento | ✅ |
| A6-A10 | Error boundary, subnav con fade, radiogroup, gráficas accesibles | ✅ |
| A11 | **Banner + beep al detectar pedidos nuevos** en el auto-refresh | ✅ |
| A12 | Asignación de repartidor desde el dashboard | 🔜 |

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

## Verificación recomendada antes de merge

```bash
npm install
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Smoke móvil (375px) — flujo de compra completo:
1. Agregar el mismo producto dos veces → aparece stepper − N + en la card.
2. Abrir el drawer y cerrarlo deslizando hacia abajo.
3. Checkout: rellenar con "Usar mi última dirección" (2ª compra).
4. Matar la red (modo offline) → navegar al catálogo cacheado (SW) y ver el banner offline.
5. /recompensas: pull-to-refresh del saldo y cambio de tabs.

## Agentes de mantenimiento por dominio

Ver `docs/agents/` — perímetro, invariantes y verificación por feature.
