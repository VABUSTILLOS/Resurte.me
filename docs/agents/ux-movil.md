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
  del carril: "Hacer Checkout" vive abajo-derecha). Su separación del rail es
  `--toast-bottom-gap` (1rem en mobile, 3.5rem en `sm+` = 46px del
  StickyCatalogButton + 10px de aire); no volver a fijarlo con `sm:bottom-6`,
  que ignora `--floating-bottom-offset`.
- Header sticky: cualquier anchor nuevo respeta `scroll-padding-top`.
- La regla `.touch-target:not(.hidden)` es unlayered a propósito — ver nota en
  `globals.css`; no moverla a una capa de Tailwind.
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
