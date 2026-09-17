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
- **Ningún flotante del rail con `z >= 60` sin decidir su colisión con el banner
  de cookies** (regla 10 del README de agentes). El banner vive en ese mismo
  carril con `z-[60]` y su franja de botones es la parte baja de su caja: un `z`
  estrictamente mayor **intercepta el tap de "Aceptar todas"** y el usuario se
  queda sin poder consentir. Un `z` **igual** no intercepta —el banner se
  renderiza al final de `layout.tsx` y gana el empate por orden de DOM— pero
  también hay que declararlo. El barrido medido de `src/` da **5 flotantes** en
  ese carril (banner, guía del panel, 2 pills del dashboard, toast) y solo el de
  la guía interceptaba. `src/lib/floats.contract.test.ts` lo bloquea.
- El pill de la guía del panel escribe su offset **a mano** a propósito
  (`bottom-[calc(var(--inset-bottom)+4.5rem)]`): la clase `has-panel-bottom-nav`
  que define ese mismo valor llega en un efecto que espera a que la colección
  cargue, así que leer la variable lo haría arrancar 3.5rem abajo y saltar. La
  coincidencia de valores es intencionada; el acoplamiento a la clase, no.
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

### Ronda W10 — background sync del carrito

- El push del carrito a `user_carts` sigue siendo **debounced y best-effort**
  (`src/contexts/cart-context.tsx`); el background sync **no** lo reemplaza.
  localStorage continúa siendo la fuente visible offline.
- Solo se encola cuando el fallo es reintentable: `fetch` lanzó (sin red) o el
  servidor respondió **5xx**. Un 4xx (sesión expirada, payload inválido) **no**
  se encola: reintentarlo daría el mismo resultado para siempre
  (`shouldQueueCartSync`).
- Un snapshot encolado **caduca a las 24 h** y **nunca se sube vacío**
  (`CART_SYNC_MAX_AGE_MS`): resucitar un carrito viejo o borrar el del servidor
  es una decisión del usuario, no un efecto de la reconexión.
- `public/sw.js` **duplica** el tag, el nombre de la base, el store, la clave, la
  URL y el tope de edad porque un SW servido como archivo estático no puede
  importar módulos del bundle. La prueba de contrato
  `src/lib/cart-background-sync.test.ts` lee `public/sw.js` y falla si alguno se
  desincroniza — es lo que impide el fallo silencioso "el flush nunca corre".
- El handler `sync` **solo reintenta el PUT**; no agrega rutas al caché. El
  invariante de `NEVER_CACHE_PREFIXES` (`/api/`, `/auth/`, `/admin/`, `/panel/`)
  sigue vigente y también está cubierto por la prueba de contrato.
- Safari/iOS no implementa Background Sync: ahí el respaldo es el listener
  `online` del provider, que reintenta el snapshot actual y limpia el pendiente.
  `registerCartBackgroundSync()` acota `serviceWorker.ready` con timeout (3 s)
  para no dejar promesas colgadas en dev/preview, donde no hay SW.
- Todo el acceso a IndexedDB es tolerante a fallos (modo privado, cuota): si
  falla, el carrito sigue funcionando solo con localStorage.

### Ronda W9 — push de estado de pedido

- El push es un **canal adicional**, no un reemplazo: la campana
  (`notifyUser`) y el correo siguen siendo la fuente. Los tres salen del mismo
  sitio (`sendOrderStatusEmail` en `src/lib/order-emails.ts`) y comparten los
  locales `title`/`body`/`trackingPath`; por eso no pueden divergir. No agregar
  un `sendPush` suelto en la ruta de estado.
- Solo los hitos empujan: `PUSHABLE_ORDER_STATUSES`
  (`confirmed`, `out_for_delivery`, `delivered`) debe seguir siendo **idéntico**
  a `EMAILED_STATUSES`; hay una prueba que compara ambos arreglos.
- `public/sw.js` **duplica** el `tag`, el icono y la URL por defecto, y el
  `push`/`notificationclick` viven ahí. `notificationclick` enfoca una pestaña
  ya abierta del pedido antes de abrir una nueva, y **solo** abre URLs del mismo
  origen.
- El SW **no** gana rutas al caché con esto: `NEVER_CACHE_PREFIXES` sigue
  vigente (y cubierto por la prueba de contrato de `src/lib/push.test.ts`).
- `urlBase64ToUint8Array("")` devuelve `null`, no un `Uint8Array` de 0 bytes: una
  clave vacía hace que `subscribe` lance un `InvalidAccessError` opaco.
- El opt-in se oculta —en vez de fallar— cuando no hay clave VAPID pública, el
  navegador no soporta push o el service worker no está registrado
  (`RegisterSW` solo registra en producción). En dev, por tanto, la tarjeta no
  aparece: es esperado, no un bug.
- `disable()` hace primero el `DELETE` y después `unsubscribe()` local. Al revés,
  el servidor seguiría mandando push a un endpoint que ya no existe.
- Las escrituras a `push_subscriptions` son solo de `service_role`: la tabla
  tiene RLS con políticas **SELECT** y **DELETE** propias, y **ninguna** de
  `INSERT`/`UPDATE`. En un equipo compartido, una clave anónima no debe poder
  reclamar el endpoint de otra persona.

## Verificación
Recorrido a 320px/375px/768px: header, drawer de carrito, WhatsApp FAB, cookie
banner, BackToTop, InstallPrompt, BottomTabBar de recompensas y PanelQuickNav sin
solapes. Modo offline: el catálogo visitado abre desde el SW.

Colisiones del rail: `npx vitest run src/lib/floats.contract.test.ts` — 4 pruebas.
Barre `src/**/*.tsx`, localiza los flotantes anclados al rail con `z >= 60` y
exige que cada uno tenga decisión escrita (clase oculta presente en `globals.css`
o exención con motivo). Es la red que faltaba cuando el pill de la guía
interceptaba el tap de "Aceptar todas" en el panel: el fallo estaba **medido y
descartado** en la documentación, no detectado. Verificación manual del caso
completo: abrir `/panel` en móvil sin consentimiento previo
(`localStorage.removeItem("resurte_cookie_consent")`) y comprobar que el tap en
"Aceptar todas" cierra el banner.

Share target: `npx playwright test e2e/compartir.spec.ts --grep "share target"`
(ambos proyectos: `chromium` y `mobile-chromium`). Cubre estado vacío, precarga
desde `?texto=`/`?titulo=`, resumen de la lista, deep links de "sin coincidencia"
y que el manifest siga declarando el `share_target` GET.

Background sync del carrito (W10): `npx vitest run src/lib/cart-background-sync.test.ts`
— 21 pruebas. Cubre la decisión de encolar (red vs. 5xx vs. 4xx), la caducidad a
24 h, el rechazo de carrito vacío y de registros corruptos de IndexedDB, el
round-trip de serialización y el **contrato con `public/sw.js`** (constantes,
listener `sync`, `PUT` + limpieza, y que `NEVER_CACHE_PREFIXES` siga intacto).
La parte con efectos (IndexedDB real, `sync.register`, reintento del SW) no tiene
prueba automatizada: no hay SW en dev/CI y Playwright no dispara `sync`.
Verificación manual: DevTools → Network → Offline, agregar al carrito con sesión
iniciada, volver a Online y comprobar en Application → IndexedDB →
`resurte-offline`/`cart-sync` que el registro `pending` desaparece tras el PUT.

Push de estado de pedido (W9): `npx vitest run src/lib/push.test.ts` — 30 pruebas
(reglas puras, `urlBase64ToUint8Array`, validación del alta, contrato con
`public/sw.js` y contrato con la migración `00134_push_subscriptions.sql`), más
`npx vitest run src/lib/order-emails.test.ts` — 16 pruebas, tres de ellas
comprobando que el push sale con **la misma copia y el mismo enlace** que la
campana. La parte con efectos (permiso, `pushManager.subscribe`, `web-push`
contra un endpoint real) no tiene prueba automatizada.
Verificación manual: con `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`
definidas y la migración `00134` aplicada, en un build de producción
(`npm run build && npm start`) abrir `/recompensas`, activar el interruptor,
aceptar el permiso y confirmar que aparece la fila en `push_subscriptions`;
luego avanzar un pedido propio a `out_for_delivery` y comprobar la notificación
del sistema, que al pulsarla abre `/cdmx/pedido/<id>?t=<token>` enfocando la
pestaña ya abierta. Desactivar y comprobar que la fila desaparece.
