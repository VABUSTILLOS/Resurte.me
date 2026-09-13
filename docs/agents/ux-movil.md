# Agente: UX móvil global

## Posee
- `src/app/globals.css` (tokens, animaciones, reglas de colisión, reduced motion)
- `src/app/layout.tsx` (shell raíz)
- `src/components/layout/**` (header, footer, BackToTop, OfflineBanner)
- `src/components/toast.tsx`, `src/lib/haptics.ts`
- `src/components/pwa/**` (InstallPrompt, RegisterSW) y `public/sw.js`

## Invariantes
- `--floating-bottom-offset` es la fuente única del rail inferior; sus cambios de
  estado son clases en `body` (ver regla 3 del README de agentes). Nuevo flotante
  ⇒ registrar su regla de colisión (InstallPrompt y BackToTop ya tienen la suya).
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

## Verificación
Recorrido a 320px/375px/768px: header, drawer de carrito, WhatsApp FAB, cookie
banner, BackToTop, InstallPrompt, BottomTabBar de recompensas y PanelQuickNav sin
solapes. Modo offline: el catálogo visitado abre desde el SW.
