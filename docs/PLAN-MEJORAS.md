# Plan Maestro de Mejoras — Resurte.me

> Programa de mejora continua por feature. **Estado: Fase 1 del plan implementada** en la rama
> `mejoras/plan-maestro-ux` (10 fases ejecutadas por feature; las fases 11+ quedan
> planificadas como backlog priorizado por impacto).
>
> Cada fase es un cambio concreto, revisable y reversible. Convenciones: ✅ implementada
> en esta rama · 🔜 backlog (siguiente iteración).

---

## 1. UX Global y experiencia móvil

| # | Fase | Estado |
|---|---|---|
| G1 | Librería de haptics (`src/lib/haptics.ts`) — micro-vibración fail-safe en acciones clave | ✅ |
| G2 | `BackToTop` flotante con offset sobre el rail inferior y reduced-motion | ✅ |
| G3 | `OfflineBanner` — aviso persistente al perder conexión (pedidos desde la cocina) | ✅ |
| G4 | Toasts con `aria-live`/`role=status|alert` | ✅ |
| G5 | Toasts con dedupe de mensajes idénticos y tope de 3 visibles | ✅ |
| G6 | Cableado de BackToTop + OfflineBanner en `layout.tsx` | ✅ |
| G7 | `scroll-behavior: smooth` respetando `prefers-reduced-motion` | ✅ |
| G8 | `scroll-padding-top` — los anchors ya no quedan bajo el header sticky | ✅ |
| G9 | `::selection` en color de marca | ✅ |
| G10 | Reglas de colisión del BackToTop (BottomTabBar / cookie banner) | ✅ |
| G11 | Error boundary raíz (`app/error.tsx`) con reintento y rutas de escape | ✅ |
| G12 | Service worker con caché offline del catálogo | 🔜 |

## 2. PWA e instalación

| # | Fase | Estado |
|---|---|---|
| W1 | `id`/`scope` explícitos en manifest | ✅ |
| W2 | Icono maskable (Android adaptive icon) | ✅ |
| W3 | App shortcuts: Catálogo, Recompensas, Panel | ✅ |
| W4 | `theme_color` alineado al verde de marca (#0E7A0E) | ✅ |
| W5 | `display: standalone` + safe areas (viewport-fit=cover) | ✅ (preexistente, auditado) |
| W6 | OfflineBanner como puente de la experiencia offline | ✅ |
| W7 | Prompt de instalación A2HS contextual (tras 2° pedido) | 🔜 |
| W8 | Share target para recibir listas de insumos | 🔜 |
| W9 | Push notifications de estado de pedido | 🔜 |
| W10 | Sincronización en background del carrito | 🔜 |

## 3. Catálogo, búsqueda y ciudades

| # | Fase | Estado |
|---|---|---|
| C1 | Haptic al agregar al carrito | ✅ |
| C2 | CTA "Avísame" por WhatsApp en productos agotados (recupera demanda) | ✅ |
| C3 | Grid como lista semántica `ul/li` con conteo anunciado a lectores de pantalla | ✅ |
| C4 | Empty state del grid con salida al catálogo completo | ✅ |
| C5 | `role="search"`, `type="search"`, `enterKeyHint` en la barra de búsqueda | ✅ |
| C6 | El atajo `/` ya no roba la tecla cuando otro campo tiene foco | ✅ |
| C7 | Selector de ciudades con búsqueda insensible a acentos ("merida" → "Mérida") | ✅ |
| C8 | Marca visual + `aria-current` de la ciudad actual; empty state con el término buscado | ✅ |
| C9 | aria-labels en búsqueda móvil/desktop y botón limpiar | ✅ |
| C10 | Ciudad: lista con `overscroll-contain` (sin scroll chaining) | ✅ |
| C11 | Vistos recientemente (localStorage) en la página de producto | 🔜 |

## 4. Carrito y checkout

| # | Fase | Estado |
|---|---|---|
| K1 | Foco inicial dentro del drawer al abrir (diálogo accesible) | ✅ |
| K2 | `overscroll-contain` en la lista de items | ✅ |
| K3 | `aria-live` en total y cantidades | ✅ |
| K4 | Haptic al iniciar checkout (drawer y barra móvil) | ✅ |
| K5 | aria-labels descriptivos en la barra móvil (total incluido) | ✅ |
| K6 | `autocomplete`/`inputMode`/`enterKeyHint` en todo el formulario de dirección | ✅ |
| K7 | `htmlFor`/`id` en todos los campos del checkout | ✅ |
| K8 | Direcciones guardadas como `radiogroup`/`radio` accesibles | ✅ |
| K9 | `required` + hints de formato (CP numérico, tel nacional) | ✅ |
| K10 | Grupo de etiquetas (Casa/Oficina/Otro) con `role=group` etiquetado | ✅ |
| K11 | Autoguardado del paso actual del checkout (reanudar tras interrupción) | 🔜 |

## 5. Recompensas (wallet, tienda, referidos)

| # | Fase | Estado |
|---|---|---|
| R1 | El tab activo se sincroniza a `?tab=` en la URL (compartible, sobrevive reload) | ✅ |
| R2 | Saldo se refresca al volver a la pestaña (`visibilitychange`) | ✅ |
| R3 | `aria-current` y labels en la BottomTabBar (móvil y sidebar) | ✅ |
| R4 | **Fix**: la BottomTabBar móvil no se renderizaba (wrapper `hidden md:flex` ocultaba la instancia única); ahora hay instancia móvil dedicada | ✅ |
| R5 | `document.title` por sección ("Cartera · Recompensas — Resurte.me") | ✅ |
| R6 | `overscroll-contain` en el contenedor principal | ✅ |
| R7 | Error boundary de /recompensas ("tu saldo está seguro") | ✅ |
| R8 | OpenGraph del programa de recompensas | ✅ |
| R9 | Haptic al cambiar de sección (patrón app nativa) | ✅ |
| R10 | Scroll al inicio al cambiar de sección | ✅ |
| R11 | Historial de movimientos con pull-to-refresh | 🔜 |

## 6. Cuenta y autenticación

| # | Fase | Estado |
|---|---|---|
| U1 | Fecha relativa en español ("hace 3 días") en Mis pedidos | ✅ |
| U2 | aria-labels descriptivos en tarjeta de pedido y botón Repetir | ✅ |
| U3 | Estado vacío de pedidos con CTA (auditado) | ✅ |
| U4 | Mis direcciones: `htmlFor`/`id` en todos los campos | ✅ |
| U5 | autocomplete/inputMode/enterKeyHint en formulario de direcciones | ✅ |
| U6 | `aria-pressed` en etiquetas; `role=alert|status` en mensajes | ✅ |
| U7 | Badge "Predeterminada" visible en la lista + scroll al form al editar | ✅ |
| U8 | Mostrar/ocultar contraseña en auth | ✅ |
| U9 | Aviso de Bloq Mayús activado en el campo de contraseña | ✅ |
| U10 | `autocomplete=current-password|new-password`, `email`, `name` | ✅ |
| U11 | Hint de contraseña mínima y `aria-describedby` | ✅ |
| U12 | role alert/status en mensajes de auth | ✅ |
| U13 | Passkeys / WebAuthn para login sin contraseña | 🔜 |

## 7. Panel del restaurante (13 herramientas)

| # | Fase | Estado |
|---|---|---|
| P1 | Selector de cocina como `listbox`/`option` con `aria-selected` | ✅ |
| P2 | `aria-expanded`/`aria-haspopup` en el selector | ✅ |
| P3 | Escape cierra el sheet de navegación móvil | ✅ |
| P4 | `overscroll-contain` en dropdowns del panel | ✅ |
| P5 | Scroll lock del fondo con el sheet abierto | ✅ |
| P6 | Foco inicial en el botón cerrar del sheet | ✅ |
| P7 | `aria-current` en la navegación de herramientas | ✅ |
| P8 | Bloqueo de herramientas sin cocina seleccionada (auditado) | ✅ |
| P9 | Buscador global con aria-label + `aria-keyshortcuts` | ✅ |
| P10 | Error boundary del área y sync status (auditado) | ✅ |
| P11 | Atajos de teclado por herramienta (1-9) | 🔜 |

## 8. Administración (backoffice)

| # | Fase | Estado |
|---|---|---|
| A1 | Auto-refresh silencioso de pedidos cada 60 s (solo con pestaña visible) | ✅ |
| A2 | Botón "Actualizar" manual con estado de carga | ✅ |
| A3 | "Actualizado hace X" bajo el título | ✅ |
| A4 | Estado de error con botón Reintentar | ✅ |
| A5 | Timestamps relativos en pedidos recientes | ✅ |
| A6 | Error boundary del área /admin | ✅ |
| A7 | Subnav móvil con scrollbar oculta + fade de borde (pista de scroll) | ✅ |
| A8 | Selector de período como radiogroup etiquetado | ✅ |
| A9-A10 | Gráficas con `role=img` + resumen textual de la serie (tendencia, total) para lectores de pantalla | ✅ |
| A11 | Notificación sonora/visual al entrar pedido nuevo | 🔜 |

## 9. Blog y contenido

| # | Fase | Estado |
|---|---|---|
| BL1 | Escape cierra el menú de orden | ✅ |
| BL2 | Scroll a resultados al cambiar de página (móvil) | ✅ |
| BL3 | Conteo de resultados anunciado con `aria-live` | ✅ |
| BL4 | `enterKeyHint=search` en el buscador | ✅ |
| BL5 | Paginación con aria-labels de página destino | ✅ |
| BL6 | Fechas como `<time datetime>` (SEO + SR) | ✅ |
| BL7 | "min de lectura" expandido para lectores de pantalla | ✅ |
| BL8 | Feed RSS descubrible (`alternates.types`) | ✅ |
| BL9 | Botón "Limpiar filtros" global cuando hay filtros activos | ✅ |
| BL10 | Botón de limpieza también en el estado vacío | ✅ |

## 10. Navegación global (header/footer)

| # | Fase | Estado |
|---|---|---|
| N1 | Escape cierra menú de usuario y selector de ciudad | ✅ |
| N2 | Menú de usuario con `role=menu`/`menuitem` | ✅ |
| N3 | `aria-expanded` en triggers de ciudad y búsqueda móvil | ✅ |
| N4 | aria-label del badge de recompensas con el saldo | ✅ |
| N5 | Contacto directo (WhatsApp/email) en el footer | ✅ |
| N6 | Links del footer con hover underline y padding táctil móvil | ✅ |
| N7 | 404 con rutas de escape (catálogo, FAQ, WhatsApp) | ✅ |
| N8 | Skip-to-content y focus visible (auditado, preexistente) | ✅ |
| N9 | Header: badge de carrito con conteo anunciado (auditado) | ✅ |
| N10 | Menú móvil de navegación principal (hoy los items caben; evaluar drawer si crecen) | 🔜 |

---

## Verificación recomendada antes de merge

```bash
npm install
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Smoke móvil manual (375px): abrir/cerrar drawer de carrito, checkout completo,
cambio de tab en /recompensas, selector de ciudad buscando "merida", y navegación
por teclado en header (Tab, Escape, `/`).

## Agentes de mantenimiento por dominio

Ver `docs/agents/` — cada feature tiene un playbook con archivos propios,
invariantes y comandos de verificación para futuras iteraciones asistidas.
