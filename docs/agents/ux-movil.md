# Agente: UX móvil global

## Posee
- `src/app/globals.css` (tokens, animaciones, reglas de colisión, reduced motion)
- `src/app/layout.tsx` (shell raíz)
- `src/components/layout/**` (header, footer, BackToTop, OfflineBanner)
- `src/components/toast.tsx`, `src/lib/haptics.ts`
- `src/components/pwa/**` (InstallPrompt, RegisterSW), `public/sw.js` y
  `public/manifest.json` (identidad de la app, shortcuts y share target)
- `src/app/compartir/**` y `src/components/share/**` (destino del share target)

## Invariantes
- `--floating-bottom-offset` es la fuente única del rail inferior; sus cambios de
  estado son clases en `body` (ver regla 3 del README de agentes). Nuevo flotante
  ⇒ registrar su regla de colisión (InstallPrompt y BackToTop ya tienen la suya).
- El contenedor de toasts se ancla abajo-izquierda en `sm+` (nunca sobre los CTAs
  del carril: "Hacer Checkout" vive abajo-derecha) y a la MISMA altura que el
  WhatsApp FAB (`.whatsapp-floating`), en la esquina opuesta. Su separación del
  rail es `--toast-bottom-gap` (1rem en mobile, 0 en `sm+`); no volver a fijarlo
  con `sm:bottom-6`, que ignora `--floating-bottom-offset`.
- Mientras hay avisos, `ToastProvider` marca `body.has-toast` y publica el alto
  real del stack en `--toast-stack-h`; el CSS sube el `StickyCatalogButton` por
  encima del aviso (misma esquina) y lo devuelve al rail al expirar el último.
  No sustituir por `:has()` (el repo no lo usa) ni ocultar el pill.
- Header sticky: cualquier anchor nuevo respeta `scroll-padding-top`.
- La regla `.touch-target:not(.hidden)` es unlayered a propósito — ver nota en
  `globals.css`; no moverla a una capa de Tailwind.
- Header móvil: aloja 5 accesos táctiles (Todo, buscar, ciudad, carrito, cuenta)
  más el logo, así que **no** puede llevar iconos con etiqueta de texto ni un
  logo de tamaño fijo. El logo escala con `clamp()`, los gaps se comprimen en
  móvil y en ≤340px el `min-width` de `.touch-target:not(.hidden)` baja a 40px
  (la altura sigue en 44px). Si se revierte cualquiera de los tres, el header
  vuelve a desbordar en ≤375px y rompe el test `header móvil no desborda en
  360px`.
- Header en tablet (768–1023px): el trigger del mega menú **no** muestra el
  texto "Categorías" (el `<span>` es `hidden … lg:inline`, solo icono) y el
  contenedor del buscador lleva `min-w-0`. El texto del trigger es el que
  desborda (78px a 768px y 26px a 820px); el `min-w-0` es defensivo, para que
  el buscador no quede clavado en su ancho min-content.
- `.touch-target:not(.hidden)` debe usar `max-width: 639.98px`, **nunca**
  `640px`: 640px se solapa con el breakpoint `sm:` de Tailwind (`min-width:
  640px`) y, al ser unlayered, pisa `sm:hidden` en ese ancho exacto; el header
  renderiza a la vez los accesos móviles y los de escritorio y desborda 110px.
  El `:not(.hidden)` solo neutraliza la utilidad `hidden` a secas, no
  `sm:hidden`.
- **Al medir desborde del header hay que medir el propio `<header>`**
  (`header.scrollWidth - header.clientWidth`) y que ningún `a`/`button`/`input`
  visible salga de sus bordes. `html`/`body` llevan `overflow-x: clip`, así que
  el desborde interno no genera scroll del documento y
  `documentElement.scrollWidth` da 0 aunque los controles estén recortados e
  invisibles. Lo cubre `header: no desborda ni recorta controles` en
  `e2e/mobile-chrome.spec.ts` (320 → 1280px).
- Toasts: dedupe + tope de 3 + `aria-live`; no apilar más ni auto-cerrar errores
  sin salida.
- Todo script inline del layout debe respetar la CSP estática (sin nonce).
- El service worker (`public/sw.js`) es conservador: GET same-origin únicamente,
  nunca `/api/`, `/auth/`, `/admin/`, `/panel/`; al cambiarlo, subir
  `CACHE_VERSION`. `RegisterSW` solo registra en producción.
- `InstallPrompt` respeta dismiss persistente (`resurte-install-dismissed`) y no
  se muestra en standalone ni en iOS web app.
- **Share target**: el `share_target` del manifest usa `method: "GET"` hacia
  `/compartir`, así que **no** se agrega un handler de `fetch` al service worker
  (si algún día pasa a POST, hay que añadirlo y subir `CACHE_VERSION`). Los
  nombres de `params` (`titulo`/`texto`/`url`) son el contrato con el sistema
  operativo: cambiarlos rompe el share sheet instalado.
- `/compartir` es **estática** y no lee `cookies()`/`headers()`: la ciudad se
  resuelve en el cliente con `useCity()` y `useSearchParams()` vive dentro de un
  `<Suspense>`. Es `robots: noindex` (contenido efímero por usuario).
- El UI de `/compartir` **no guarda `resolving` en estado**: se deriva del texto
  pendiente, porque `react-hooks/set-state-in-effect` es error con
  `--max-warnings 0`. Mantener ese patrón al editarlo.
- Nada se agrega al carrito sin confirmación explícita del usuario: un solo
  `addOrderItems`, un toast y un `AnalyticsEvents.addToCart` por ítem.

## Verificación
Recorrido a 320px/375px/768px: header, drawer de carrito, WhatsApp FAB, cookie
banner, BackToTop, InstallPrompt, BottomTabBar de recompensas y PanelQuickNav sin
solapes. Modo offline: el catálogo visitado abre desde el SW.

Share target: `npx playwright test e2e/compartir.spec.ts --grep "share target"`
(ambos proyectos: `chromium` y `mobile-chromium`). Cubre estado vacío, precarga
desde `?texto=`/`?titulo=`, resumen de la lista, deep links de "sin coincidencia"
y que el manifest siga declarando el `share_target` GET.
