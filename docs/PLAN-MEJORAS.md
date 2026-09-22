# Plan Maestro de Mejoras — Resurte.me

> Programa de mejora continua por feature. **Oleadas 1 y 2 implementadas**
> (fases 1-10 por feature + fases 11+ de compra fácil priorizando móvil).
> **Backlog abierto, medido**: cada ronda empieza midiendo el backlog declarado
> antes de tocarlo, porque una fila 🔜 envejece mal —la `BL13` se declaró con una
> medición de 25 s que hoy es de 1,4 s, y la `C12` afirmaba que sus cinco
> escrituras estaban cubiertas por pruebas cuando ninguna tenía consumidor—. El
> trabajo real sale de **deuda medida con herramientas** (ver la Ronda 3), no de
> la prosa de la ronda anterior. Si aparece backlog nuevo, se declara al final de
> su sección. Estado tras la Ronda 13: las filas abiertas son las **cuatro que la
> propia ronda 13 declaró al medir** (A14–A17); ninguna de las rondas 12 y 13
> salió del backlog —la 12 encontró un defecto vivo (el enum `payment_status`
> declaraba dos valores que la base no tenía) y la 13 midió el backlog heredado y
> lo **desmintió** (decía "42 de 61 archivos con patrones de foco" donde hay
> 11)—, que son las otras dos fuentes legítimas de trabajo.
>
> **Estado tras la Ronda 19** (auditoría de estatus de las 54 superficies de
> producto): el backlog abierto creció con las **diez debilidades que esa ronda
> midió** (AU1–AU10). El diagnóstico completo por superficie, con evidencia
> archivo:línea, vive en [`docs/AUDITORIA-ESTATUS.md`](AUDITORIA-ESTATUS.md).
>
> **Estado tras la Ronda 21** (tests de superficie del panel y las reglas de
> dinero que destaparon): de las diez debilidades `AU1`–`AU10`, **cuatro quedan
> cerradas** (`AU4`, `AU5`, `AU7`, `AU8`) y dos avanzaron (`AU3`, `AU9`). El
> resto sigue abierto por depender de terceros —`AU1` Connect, `AU6` PAC, `AU2`
> hardware— o de trabajo que aún no toca. El detalle está en las actas de las
> rondas 20 y 21, más abajo.
>
> **Estado tras la Ronda 25** (guía de credenciales y su contrato): los 8 todos
> que se venían atribuyendo en bloque a «faltan credenciales externas» quedaron
> **rastreados hasta su origen**, y la premisa resultó **falsa en 3 de los 8**
> —`w4-a11y` y `w4-pos-escpos` no necesitan ninguna credencial, y `w3-e2e-auth` se
> auto-provisiona en tu propio Supabase—. Dónde se consigue cada valor, cuánto
> cuesta y cómo se verifica está en [`docs/CREDENCIALES.md`](CREDENCIALES.md),
> vigilado por `src/lib/credenciales.contract.test.ts`. Con esto, la frase «abierto
> por depender de terceros» del párrafo anterior deja de ser una explicación y pasa
> a ser **una lista con nombre y precio**.
>
> Convenciones: ✅ implementada · 🟡 resuelta a medias, con la parte que queda
> abierta nombrada en la propia fila · 🔜 backlog priorizado. Los **IDs de fila** se
> acotan **por sección** —el `A14` de §8 no es el `A14` de la Ronda 13, y es a
> propósito—: un puntero desnudo («ver la fila X») solo resuelve si la fila está
> en su propia sección o si su ID es único en todo el documento; si el ID se
> reutiliza, se califica («de la ronda N» / «de la sección N»). El contrato
> `docs-pointers.contract.test.ts` vigila las dos cosas.

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
| G12 | **Service worker offline** (`public/sw.js`): estáticos cache-first, páginas network-first; nunca cachea /api, /auth, /admin, /panel | ✅ |
| G13 | Registro del SW solo en producción (`RegisterSW`) | ✅ |

## 2. PWA e instalación

| # | Fase | Estado |
|---|---|---|
| W1-W4 | id/scope, maskable, shortcuts, theme_color | ✅ |
| W5 | standalone + safe areas (auditado) | ✅ |
| W6 | OfflineBanner como puente offline | ✅ |
| W7 | **Banner de instalación A2HS**: `beforeinstallprompt` en Android + instrucciones en iOS; tras 25 s, dismiss persistente, sin colisiones | ✅ |
| W8 | **Share target para recibir listas de insumos**: `manifest.json` declara `share_target` con `method: "GET"` hacia `/compartir` (parámetros `titulo`/`texto`/`url`) y un cuarto shortcut "Compartir lista". `/compartir` es una página **estática** (`robots: noindex`) que resuelve cada renglón contra el catálogo de la ciudad en el cliente, en tandas de 5 (`searchProducts`), y muestra "Encontrados" con checkbox + stepper de cantidad y "Sin coincidencia" con deep link al buscador (`/{ciudad}/buscar?q=`). Nada entra al carrito sin confirmar: un solo `addOrderItems` + un toast + `AnalyticsEvents.addToCart` por ítem. El parseo (cantidad, unidad, viñetas, URLs, tope de 20 renglones) vive en `src/lib/share-list.ts` (27 tests) y el UI nunca guarda `resolving` en estado (se deriva del texto, para respetar `react-hooks/set-state-in-effect`). Sin service worker nuevo: al ser GET no hace falta handler de `fetch` | ✅ |
| W9 | **Push notifications de estado de pedido**: los hitos (`confirmed`/`out_for_delivery`/`delivered`) llegan como notificación del sistema además de la campana y el correo. El push se dispara desde el **mismo** punto que el correo (`sendOrderStatusEmail` en `src/lib/order-emails.ts`), reutilizando los locales `title`/`body`/`trackingPath`, así campana/correo/push no pueden divergir. `src/lib/push.ts` (reglas puras + `urlBase64ToUint8Array`, que devuelve `null` con clave vacía en vez de un array de 0 bytes) y `src/lib/push-server.ts` (`web-push`, borra suscripciones muertas 404/410, cuenta `failure_count`, tolera `42P01` si la migración no está aplicada, nunca lanza). Alta/baja desde `POST`/`DELETE /api/push/subscribe` (sesión obligatoria; `INSERT`/`UPDATE` **sin** política RLS: solo `service_role` escribe, para que una clave anónima no pueda reclamar el endpoint de otro en un equipo compartido). Opt-in en `/recompensas` (`PushOptInCard`, se oculta si no hay VAPID, si el navegador no soporta push o si el SW no está registrado); el SW gana los listeners `push` y `notificationclick`. Requiere `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` y `supabase db push` de `00134` | ✅ |
| W10 | **Background sync del carrito**: si el push a `/api/cart` falla **sin red o con 5xx**, el snapshot se encola en IndexedDB (`resurte-offline`/`cart-sync`, clave `pending`) y se registra el tag `resurte-cart-sync`; el handler `sync` del service worker reintenta el **PUT** al volver la conexión. Solo se encola lo reintentable (un 4xx no se repite), un snapshot **caduca a las 24 h** y **nunca se sube vacío** (resucitar un carrito viejo o borrar el del servidor es decisión del usuario). `src/lib/cart-background-sync.ts` (reglas puras, 21 tests incluida una **prueba de contrato que lee `public/sw.js`** para que las constantes duplicadas no se desincronicen) + `src/lib/cart-sync-queue.ts` (IndexedDB, tolerante a modo privado/cuota) + listener `online` como respaldo en Safari/iOS, que no implementa la API. El SW solo reintenta; **no** se agrega ninguna ruta privada al caché | ✅ |

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
| C11 | **Stepper − N + en la card cuando el producto ya está en el carrito** | ✅ |
| C12 | **Rail "Vistos recientemente"** en la página de producto | ✅ |
| C13 | **Comparador de precios por unidad**: `unit-price.ts` normaliza la presentación (`por kilo`, `500 g`, `1 l`, `por pieza`…) a un precio por kg/l/pieza; la ficha de producto muestra el `$/kg` real y una sección "Comparar presentaciones" con la más barata y el sobreprecio (`+N%`) de las demás, y las cards y la búsqueda global muestran el `$/kg` como insignia | ✅ |
| C14 | **Contraste AA de la insignia `$/kg`** (deuda detectada al cerrar W9/U13, no es de esas rondas): el `<p>` de precio por unidad de la card usaba `text-[#0E7A0E]/70` con `sm:text-[11px]` → **3.13:1** sobre blanco (`#56a256`), y el contador `.opacity-70` de los chips → **3.52:1** (`#b7d7b7` sobre `#0e7a0e`); axe los marca `color-contrast` serio, así que `npm run test:e2e` fallaba **de forma determinista** en `a11y.spec.ts › busqueda` (ambos proyectos) y **de forma intermitente** en `home`/`ciudad`/storefront según qué renderizara la rejilla. Regresión del commit `19cd8e0` (comparador por unidad), ajena a W9/U13. El `<p>` de `perUnit` se reconoce porque es el único que lleva `sm:text-[11px]`. Arreglo: quitar la opacidad en los 6 sitios con el mismo patrón — `product-card.tsx` (precio por unidad y pista de mayoreo), `header.tsx` (etiqueta *recompensas*), `recipe-slider.tsx` (*Recetario*), `collection-story-section.tsx` (*Nuestra Historia*) y los contadores de chip de `search-page-client.tsx` / `user-shop-view.tsx` (que también incumplían **en estado inactivo**: `#5C6068` al 70 % = 3.21:1). En el mismo barrido apareció `menu-view.tsx` L214 (`text-stone-500` sobre `bg-stone-100`, 10 px = **4.38:1**) bloqueando el storefront `/r/mr-fresh`: subido a `text-stone-600` (**≈7:1**). `e2e/a11y.spec.ts` queda **20/20 verde** en ambos proyectos. Ojo con el alcance: esto cierra la deuda de las **rutas públicas**, que son las únicas que ese spec recorre; el contraste del panel de admin (que exige sesión y axe nunca miró) es **B36/B37** en § 8 | ✅ |

## 4. Carrito y checkout

| # | Fase | Estado |
|---|---|---|
| K1-K5 | Foco, overscroll, aria-live, haptic, aria-labels en drawer y barra | ✅ |
| K6-K10 | autocomplete/inputMode/enterKeyHint, htmlFor, radiogroup, required, grupos etiquetados | ✅ |
| K11 | **Autoguardado de la última dirección + "Usar mi última dirección"** (superado por K17) | ✅ |
| K12 | **Swipe-down para cerrar el drawer** con handle visual y haptic | ✅ |
| K13 | **Reanudar el paso del checkout tras interrupción**: el checkout full-page guarda el paso en `sessionStorage` (`resurte:checkout-step`) y lo rehidrata con un inicializador perezoso de `useState`, así que una recarga no devuelve al usuario al principio. **`payment` nunca se reanuda** —el `PaymentIntent` vive en memoria y reanudarlo dejaría el botón sin `clientSecret`— y `resumeCheckoutStep` lo retrocede a `review`; el paso se limpia al pagar. La regla vive en `src/lib/checkout-resume.ts` (puro, `checkout-resume.test.ts`, 15 pruebas con pasos corruptos y un `sessionStorage` hostil). No se persiste ningún dato personal, solo el nombre del paso. El drawer no participa: su paso es estado local de una sola sesión de montaje | ✅ |
| K16 | **El carrito cuenta catálogo + bumps**: al agregar bump sells en el checkout, todas las superficies de carrito muestran el total combinado de productos con `countOrderUnits(itemCount, selectedBumps)` (unidades, no líneas) — insignia y `aria-label` del header, `MobileCartBar`, cabecera del drawer "Mi Carrito", `/cart` y `/{ciudad}/carrito`; 2 productos + 3 bumps = **5 productos**. En `/cart` y `/{ciudad}/carrito` el resumen queda en una sola fila "Subtotal (N productos)" con el monto ya sumado (`effectiveSubtotal`) y sin fila "Artículos especiales"; el total del pedido no cambia y `itemCount` conserva su semántica de catálogo | ✅ |
| K14 | **Bump sells encadenados sin tope**: el checkout omite `limit` y el motor devuelve **todas** las reglas activas que apliquen al carrito (el pool lo determina `bump_rules`; `MAX_BUMPS` = 3 es solo la ventana visible y `MAX_BUMPS_REQUEST_LIMIT` = 100 el tope anti-abuso del endpoint público); al elegir una oferta su tarjeta desaparece, se agrega como línea del pedido y el hueco lo ocupa la siguiente, de forma indefinida. **La selección sobrevive salir del checkout**: localStorage (`resurte_bumps`) + `user_carts.bumps` (migración `00113`) con endpoints dedicados (`PUT /api/cart/bumps/selection`, `POST /api/cart/bumps/hydrate`) y `bumps_updated_at` propio, con merge last-write-wins compartido (`bumps-sync.ts`). **Cantidades editables** en la lista del pedido con +/− y piso 0: una línea en 0 sigue visible con la insignia "En 0" y un segundo "−" abre el prompt `RemoveLineDialog` para quitarla (`order-lines.ts` como regla pura, `useOrderLines` compartido por drawer y checkout full-page) | ✅ |
| K15 | **Bumps = productos reales del catálogo**: las tarjetas encabezan con `bump.product.name` (el `bump_rules.title` pasa a ser subtítulo adorno, p. ej. "Limón" en vez de "Limones para tus tacos"). **Afinidad por ingrediente** (`ingredient-affinity.ts` + tabla `bump_affinity` 00112 + recetario): el primer tier del ranking sugiere los ingredientes que combinan con lo que ya está en el checkout (carne → especias/salsa; cebolla → chiles y tomate; receta → sus otros ingredientes), con descuento de 10 % al registrarse la regla y `display_order = 100`. Panel de admin en `/admin/marketing` → "Afinidad entre productos" (CRUD + búsqueda de producto); el tier es aditivo y tolerante a fallos si la migración no está aplicada | ✅ |
| K17 | **Libro de direcciones del checkout**: la dirección se guarda tras la primera compra y **ya no se reescribe**. Regla única de preselección `pickPreferredAddress` (`src/lib/address-book.ts`): `is_default` → última usada (`addresses.last_used_at`, que `POST /api/orders` toca al resolver la dirección) → más reciente. `use-checkout-order` carga y borra la lista para **invitado y usuario** (`GET/DELETE /api/addresses/guest` con `guest_token`, `service_role` porque RLS oculta las filas sin dueño) y `AddressStep` pinta el `radiogroup` con las guardadas + "Nueva dirección" + eliminar con confirmación; la página `/[slug]/checkout` activa `autoSelectSavedAddress` (antes solo el drawer) y se elimina el bloque duplicado "Usar mi última dirección" (clave `resurte-last-address`). **Eliminar es soft delete** (`deleted_at`, migración `00117`) porque `orders.address_id` es `ON DELETE SET NULL`: `/mis-direcciones` y el checkout filtran `deleted_at IS NULL` y el cron de invitados purga por `COALESCE(last_used_at, created_at)` sin tocar direcciones referenciadas por un pedido | ✅ |

## 5. Recompensas

| # | Fase | Estado |
|---|---|---|
| R1-R4 | Sync `?tab=`, refresh al volver, aria en tabs, **fix tab bar móvil** | ✅ |
| R5-R8 | Título por sección, overscroll, error boundary, OG | ✅ |
| R9-R10 | Haptic y scroll-to-top al cambiar de sección | ✅ |
| R11 | **Pull-to-refresh del saldo** con indicador animado | ✅ |
| R12 | Notificaciones de cashback ganado tras cada pedido (helper único `notifyCashbackCredited` invocado desde el webhook de Stripe, la conciliación y el cambio de estado en admin) | ✅ |
| R13 | **Progreso semanal de calificación**: bloque "Esta semana" en la meta mensual y avisos deterministas (semana calificada, sin compras, cierre próximo) con IDs por semana ISO | ✅ |
| R14 | **Transparencia del monedero**: `getWalletSummary()` y tarjetas de total ganado/canjeado en la vista de créditos; filtros Todos/Cashback/Canjes en la actividad, con exportación CSV que respeta el filtro | ✅ |
| R15 | **Canje más claro**: avance por servicio y "Más cerca" en la tienda; comprobante con folio, saldo restante y CTAs explícitos tras canjear (sin redirección automática) | ✅ |
| R16 | **Accesibilidad de la campana**: `aria-expanded`/`aria-controls`, panel `role="dialog"` con foco gestionado, anuncios de estado y objetivos táctiles de 44 px | ✅ |
| R17 | **Caducidad de créditos**: `supabase/migrations/00132_wallet_credit_expiry.sql` añade `expires_at`/`expiry_settled_at` a `wallet_transactions` y un trigger que fecha **solo los abonos** a 12 meses (los débitos no caducan, por eso no vale un `DEFAULT`); el backfill es **no retroactivo** (`GREATEST(created_at + 12 meses, now() + 12 meses)`) para no confiscar saldos ya acumulados. `supabase/migrations/00133_wallet_credit_expiry_job.sql` añade `wallet_credit_lots()` (reparte los canjes entre abonos en FIFO — mismo corte que la lib), `expire_wallet_credits()` (avisa 30 días antes con dedupe `wallet-expiry:<día>` y da de baja lo vencido con un **movimiento negativo compensatorio**, nunca editando el abono: el libro sigue append-only y cuadrando) y el cron diario `expire-wallet-credits` (05:37 UTC, `cron.unschedule` antes de `cron.schedule`). La baja toma `FOR UPDATE` sobre `wallets` (mismo punto de serialización que `redeem_service`/cashback) y se acota al saldo con `LEAST` para no violar `CHECK (balance_credits >= 0)`; es idempotente vía `expiry_settled_at`, incluso en lotes agotados. `src/lib/wallet-expiry.ts` calcula solo para mostrar (FIFO, `CREDIT_TTL_MONTHS`, `EXPIRY_WARNING_DAYS`) y **espeja el `GREATEST` del backfill** en `deriveExpiry`, para no acusar de vencido un saldo que la BD conserva; `getWalletExpiry()` degrada sin error (`42703`) si el `db push` aún no corrió, y `CreditExpiryCard` muestra próximo vencimiento, importe por vencer a 30 días y ya vencido. 25 tests unitarios + 17 de contrato SQL↔lib que fallan si el TTL, la ventana de aviso, el backfill, el clamp, el append-only o el cron se desincronizan | ✅ |

## 6. Cuenta y autenticación

| # | Fase | Estado |
|---|---|---|
| U1-U7 | Fechas relativas, aria-labels, form accesible, badge predeterminada, scroll al editar | ✅ |
| U8-U12 | Mostrar/ocultar contraseña, Bloq Mayús, autocomplete, hints, roles | ✅ |
| U13 | **Passkeys / WebAuthn**: entrar sin contraseña con huella, rostro, PIN o llave física. `src/lib/supabase/client.ts` enciende el flag que auth-js exige para la API experimental (`auth: { experimental: { passkey: true } }`); sin él `signInWithPasskey`/`auth.passkey.*` lanzan **al llamarse**, no al construirse. `AuthForm` (modo login) añade "Entrar con llave de acceso" (`signInWithPasskey()`, sin correo: la credencial es descubrible), oculto si `isPasskeySupported()` es falso y detectado con `useSyncExternalStore` para que el servidor pinte `false` sin desajuste de hidratación (y sin el render extra de un `setState` en efecto). En `/recompensas?tab=profile` la `PasskeyCard` lista, crea (`registerPasskey()`), renombra (`passkey.update`) y borra (`passkey.delete`, con confirmación: es irreversible y puede dejar al usuario sin su única entrada). `src/lib/passkeys.ts` (reglas puras, 31 tests) concentra lo que no debe reimplementarse en la UI: la fecha en la zona canónica del proyecto, la etiqueta (nombre del usuario → fecha → "Llave de acceso"; **nunca un índice**, que se recorre al agregar otra), la validación del nombre (recorta antes de medir, tope 120) y el mapeo de errores a español. Dos decisiones de correctitud: (a) `ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY` se resuelve por el **nombre de la causa**, no como cancelación — auth-js lo usa tanto para `NotAllowedError` como para el caso desconocido, y tratarlo en bloque silenciaría fallos reales; (b) `NotAllowedError` **no** se suprime: el navegador no distingue "cerré la ventana" de "este dispositivo no tiene ninguna llave" (privacidad), así que `passkeyErrorMessage(err, flow)` da copy distinto al entrar (con salida por correo) y al crear. `isPasskeyCancelled` se reserva para el aborto explícito. La tarjeta se oculta entera —sin dejar hueco— si WebAuthn no existe o si el proyecto no tiene las passkeys habilitadas (`list()` falla) | ✅ |
| U14 | **La recuperación de contraseña ya tiene entrada** (hallazgo de la ronda 4, **cerrado** — esta fila es su acta). La **mitad receptora** ya funcionaba: `/auth/reset` cambia la contraseña con `supabase.auth.updateUser({ password })` y `/auth/callback` intercambia el código por la sesión temporal. La **mitad iniciadora** que faltaba ahora existe: `AuthForm` (modo login) tiene el disparador **"¿Olvidaste tu contraseña?"** (`type="button"`, `disabled` mientras carga), que con el correo vacío avisa **sin viajar a la red** («Escribe tu correo y te enviamos el enlace.») y con correo llama a `resetPasswordForEmail`. El mensaje de éxito es **neutral a propósito** («Si {correo} tiene una cuenta, te enviamos un enlace…»): no revela si la cuenta existe. **Decisión que evita una rotura silenciosa en producción**: el destino viaja en la **cookie** `resurte_auth_next` (`rememberNextPath("/auth/reset")`), **no** como `?next=` en la `redirectTo`. Supabase valida la URL de redirección completa contra la allow-list de *Redirect URLs*, así que una entrada exacta de `/auth/callback` no coincide con `/auth/callback?next=/auth/reset`: el proveedor cae al **Site URL** y el enlace habría llevado a `/` en vez de a `/auth/reset`, **sin error visible**. Es exactamente la razón por la que `src/lib/auth-next.ts` existe (lo dice su comentario) y por la que el `redirectTo` se queda limpio. Cubierto por `e2e/auth.spec.ts` (disparador presente en login, ausente en registro, y aviso de correo vacío — lo único determinista sin backend de correo). El enlace mágico (`signInWithOtp`) **sigue sin existir en `src/`** | ✅ |

## 7. Panel del restaurante

| # | Fase | Estado |
|---|---|---|
| P1-P8 | Listbox accesible, scroll lock, foco, aria-current, overscroll | ✅ |
| P9-P10 | Buscador global con aria-keyshortcuts; resiliencia (auditado) | ✅ |
| P11 | **Atajos 1-9 para abrir herramientas** | ✅ |
| P12 | **Pedidos de la tienda en el hub**: el hub muestra el resumen del mostrador del día (`AppOrdersCard`) tras el resumen de ventas, con gate `canAccessTool(role, "foodos")` **además** del gate por nivel. `entryTotal` (`src/components/panel/ventas/ventas-shared.ts`) pasa a ser la **fuente única** de los totales del mostrador — recorta el descuento porcentual en 0 para que ningún total salga negativo — y `hubEntryTotal` (`hub-data.ts`) **delega** en él; antes era una copia que divergía y el hub podía mostrar un total negativo. `counterSummary(entries, day)` centraliza el filtro + suma del día. **Bug de zona horaria corregido**: las entradas se escriben con `todayStr()` (local) pero el hub comparaba con `new Date().toISOString().slice(0, 10)` (UTC), así que después de las ~18:00 de CDMX el hub mostraba $0 y perdía el resumen del día; los 5 sitios pasan a `todayStr()`. El copy de la tarjeta, incluido el plural, pasa por `t()` con un helper `plural()` porque i18n no tiene ICU | ✅ |
| P13 | **"Ver" separado de "usar"**: el nivel de lealtad ya **no oculta los campos**. Las 10 herramientas premium (más `inbox`) se renderizan completas en cualquier nivel —campos visibles y recorribles, lecturas reales o vacías— y el nivel solo se pide al **usar**: guardar, cobrar, ejecutar. Se eliminó el muro `<NivelGate>` a pantalla completa (la página entera quedaba tapada); `nivel-gate.tsx` conserva solo `featureLabel`, `featureDescription` y `NivelProgress`. Predicado único `canUseFeature(tier, feature, { isAdmin })` / `lockedTierFor(...)` (`foodos-entitlements.ts`), consumido por el contexto y por `useTierGuard(feature)` (`src/hooks/use-tier-guard.tsx`), que envuelve cada escritura (~56 sitios) y ante falta de nivel devuelve `{ ran: false }` **sin viajar al servidor** abriendo `TierUpsellDialog`. `<ToolPreviewNotice>` avisa de la vista previa y ofrece **"Ver demo"** (el overlay de `ToolGuideHost` con 9 datasets nuevos en `TOOL_DEMOS`). **El administrador de plataforma queda exento en las dos capas** —`isCurrentUserAdmin()` en `requireFoodosFeature()` (solo en la ruta de fallo, así el camino normal no paga una lectura de rol extra) y `isAdmin` propagado desde `panel/layout.tsx`— porque su nivel real es Verde y sin la exención no podría probar ni dar soporte | ✅ |
| P14 | **"Operar como restaurante" (fase 2)**: el admin ya puede abrir la herramienta con los datos de **cualquier** restaurante. Seam único `src/lib/foodos-operating.ts`: la cookie `resurte_foodos_operating` **solo pide** el restaurante y `isCurrentUserAdmin()` se revalida en cada llamada (caducidad 4 h, fail closed). Como todas las políticas de `foodos_*` son `auth.uid() = user_id`, al impersonar se lee y se escribe con **service role** —el seam pasa a ser la única barrera—, así que `requireFoodosAuth()` (149 llamadas en el panel) acota toda consulta de **visibilidad/propiedad** con `ownerUserId` y deja las columnas de **atribución** (`opened_by`, `cashier_user_id`, `reviewed_by`) en el usuario de la sesión. El nivel mostrado es el **real** del restaurante: la exención de admin se apaga mientras se impersona en las dos capas (`requireFoodosFeature` y el contexto del panel). Selector en `/admin/operar` (listado reutilizado de `/admin/restaurantes`, con nivel efectivo por restaurante, buscador y distintivos "Tu restaurante"/"Operando aquí"); franja ámbar no cerrable "Operando como X — Salir" en el panel, **fuera** del control de acceso para que el admin nunca quede atrapado, con `print:hidden` porque los tickets son del restaurante y no de la sesión. Auditoría en `admin_audit_log`: `foodos_operating_start`/`_stop` desde `operating-actions.ts` y `foodos_operating_action` en **cada** llamada mientras se impersona, lecturas incluidas (`getOperatingContext` no audita a propósito: corre en cada render del layout y registraría visitas, no acciones). `stopOperatingAs` sale **aunque el rol se haya revocado**. | ✅ |

## 8. Administración

| # | Fase | Estado |
|---|---|---|
| A1-A8 | Dashboard del PR #18: KPIs vs ayer, alertas, auto-refresh, CSV, badge pendientes, guard server-side | ✅ (PR #18) |
| A9-A10 | Gráficas con `role=img` + resumen textual de la serie para lectores de pantalla | ✅ |
| A11 | Error boundary del área /admin | ✅ |
| WA1 | Sync catálogo WhatsApp: cliente Graph API a nivel catálogo (`items_batch`, precio en el payload, `whatsapp_product_id` persistido, `catalog_id` por catálogo) | ✅ |
| WA2 | Sync seguro no destructivo: diff crear/actualizar/stale, borrado en Meta solo con confirmación explícita | ✅ |
| WA3 | Batch en chunks de 100 + backoff exponencial (429/80004/5xx) + timeout; fallos parciales vía handles | ✅ |
| WA4 | Historial de syncs: `whatsapp_sync_runs` + `whatsapp_sync_items`, registro en cada corrida | ✅ |
| WA5 | Cola de sync automático (`whatsapp_sync_queue`): cambios de precio/imagen/stock/visibilidad/curaduría encolan sync incremental; job `whatsapp-sync-queue` en el cron diario | ✅ |
| WA6 | UI /admin/whatsapp: previsualización del diff con confirmación de borrados, historial por catálogo, botón "Procesar cola"; endpoint legacy `/api/whatsapp/catalog/sync` retirado | ✅ |
| WA7 | Validación previa al sync (imagen https, precio > 0, límites de Meta); inválidos excluidos y listados con motivo | ✅ |
| WB1 | Observabilidad del sync: parseo defensivo de handles de Meta (`parseBatchErrors`) y módulo `whatsapp-batch-status.ts` que vuelca errores por producto a `whatsapp_sync_items` | ✅ |
| WB2 | Detalle por producto en cada corrida (items `pending` → `ok`/`error` vía job cron `whatsapp-batch-status`) | ✅ |
| WB3 | Reintento individual de producto y "reintentar fallidos" por corrida (handles acumulados en el run) | ✅ |
| WB4 | UI: historial expandible con detalle por producto + panel de cola (motivo, intentos, antigüedad, quitar) | ✅ |
| WB5 | Higiene de runs huérfanos: `running` > 6 h ⇒ `failed` en el job cron | ✅ |
| WC1 | Motor de automatizaciones respeta la config persistida (`whatsapp_automations`): is_active, delays, niveles de payment_recovery | ✅ |
| WC2 | Motor cron `whatsapp-automations` para carrito, reactivación, rating, onboarding y cumpleaños con dedupe (`whatsapp_automation_sends`) | ✅ |
| WC3 | Bitácora de envíos + stats (7 días, último envío) en la API de automatizaciones | ✅ |
| WC4 | Página de automatizaciones sin mocks: loading/error con reintento, delay editable, badge "sin plantilla" | ✅ |
| WC5 | Drag & drop HTML5 nativo en la curaduría (flechas conservadas como fallback accesible) | ✅ |
| WC6 | Vista previa del catálogo tal como lo vería el cliente (burbuja product_list) | ✅ |
| WC7 | Curaduría masiva: agregar toda la vista (tope 50, doble confirmación) y quitar por selección múltiple | ✅ |
| WC8 | Credenciales por catálogo desde la UI (token cifrado AES-GCM, nunca devuelto; fallback plataforma) | ✅ |
| WC9 | Botón "Probar conexión" a Meta con latencia y diagnóstico | ✅ |
| WD1 | Cliente de lectura de Meta ampliado: `getCatalogProducts` con precio, sale_price, availability, imagen y review_status; parser defensivo `parseMetaPriceToMajor` | ✅ |
| WD2 | Comparador puro tienda vs Meta (`compareMetaVsStore`): match, price_diff, sale_price_diff, image_missing_meta, only_meta, only_store | ✅ |
| WD3 | Actions del explorador: `getWaMetaCatalog` (cruce vivo Meta ↔ tienda) y `pushWaProductToMeta` (corrección individual con run+handle) | ✅ |
| WD4 | Panel "Explorador Meta" en /admin/whatsapp: tabla viva con chips de diferencia, filtros por estado, contadores, refetch y "Corregir" por fila | ✅ |
| WD5 | Verificación (1345 tests + build) y docs de la ronda WD | ✅ |
| WE1 | Operaciones individuales de Meta: `deleteCatalogProductsByRetailer` (batch DELETE) y `setCatalogProductAvailability` (UPDATE parcial defensivo) | ✅ |
| WE2 | Actions directas: `deleteWaMetaProduct` (trazable), `setWaMetaProductAvailability` (DB fuente única si existe en tienda), `fixAllWaCatalogIssues` (corrección masiva, un solo run) | ✅ |
| WE3 | Salud del catálogo: `computeCatalogHealth` (score 0–100 + issues por severidad alta/media/info) con tests | ✅ |
| WE4 | Explorador con acciones por fila (corregir / pausar-activar / eliminar con doble confirmación), barra de salud y "Corregir N problemas" | ✅ |
| WF1 | Distribución: módulo `whatsapp-share.ts` (normalización MX, enlaces wa.me chat + `wa.me/c/`, texto de compartido) con tests; QR a data-URL (`qrcode`); migración `display_phone` | ✅ |
| WF2 | Panel "Distribución" por catálogo: enlaces con copiar, QR descargable PNG, número público en el formulario de credenciales | ✅ |
| WF3 | Difusión del catálogo: `broadcastWaCatalog` (audiencia ciudad + marketing_consent o manual, tope 200, dedupe por día) con conteo previo y resultado | ✅ |
| WF4 | Plantillas administrables: lista/alta/estado/eliminar + `syncWaTemplatesFromMeta` (status real desde Meta) | ✅ |
| A13 | Productos: operaciones masivas (precio/visibilidad/disponibilidad) con auditoría | ✅ |
| A16 | Productos: publicar/despublicar por fila (switch), CRUD completo (crear/editar/duplicar), filtros por estado con conteos, export CSV, orden por columnas, deshacer en lote | ✅ |
| A17 | Productos: paginación server-side (`/api/admin/products/list`), badge de sync WA pendiente y "última edición" por fila (`/api/admin/products/row-meta`) | ✅ |
| A18 | Productos ronda 2: bulk WhatsApp, campo `unit`, lightbox, deep-link de filtros en URL, vista grid, panel Salud del catálogo (sin precio/categoría/imagen/ciudades, WA sin publicar) | ✅ |
| A19 | Productos ronda 2: eliminar protegido (409 si tiene pedidos, order_items es CASCADE), historial por producto (audit), categoría inline, dry-run de importación CSV | ✅ |
| A20 | Publicación programada: `publish_at`/`unpublish_at` (00096) + job `scheduled-publishing` en cron diario (antes del sync WA); toggle manual cancela la programación | ✅ |
| A21 | Productos ronda 3: toasts de éxito, page size configurable, atajos de teclado (/, n, Esc), link "Ver en tienda", columna Ventas (order_items vía row-meta) | ✅ |
| A22 | Productos ronda 3: filtros por ciudad y marca server-side, bulk delete (omite productos con pedidos), bulk duplicate, Deshacer genérico (visibilidad/categoría/precio) | ✅ |
| A23 | Nota interna del producto (`admin_note`, 00098, solo admin) y galería de imágenes (`products.images`: agregar, principal ★ = image_url, quitar) | ✅ |
| A24 | Productos ronda 4: chip "En oferta", bulk oferta con Deshacer, chip "Nombres duplicados", shift-click por rango, columna `imagen` en importación CSV | ✅ |
| A25 | Productos ronda 4: descripción e imagen con IA (kie-ai chat/image + polling), copiar selección al portapapeles, Ventas $ por producto, drawer de actividad reciente | ✅ |
| A26 | Papelera con soft delete (`deleted_at`, 00099): eliminar preserva historial de pedidos, filtro Papelera + Restaurar; accesibilidad (aria-live, focus rings) | ✅ |
| A27 | Productos ronda 5: orden manual del catálogo (`sort_order` 00100, ↑↓ con swap + normalización; la tienda ordena sort_order,name con fallback), stock numérico (`stock_quantity` 00101, deriva stock_status), costo y margen % (00102), búsqueda pg_trgm (00103) | ✅ |
| A28 | Productos ronda 5: reporte de ventas CSV por rango, vistas guardadas de filtros, fusión de duplicados (merge → papelera), renombrar al duplicar | ✅ |
| A29 | SEO por producto (`seo_title`/`seo_description` 00104, generateMetadata los prefiere), recorte 1:1 opcional al subir imágenes, sparkline de precios, bulk unidad | ✅ |
| A30 | Productos ronda 6: precios por tienda (`product_stores`, modal con overrides + GET/PUT), unidad en export/copiar/CSV, badge ✨ Nuevo (<7 días) | ✅ |
| A31 | Productos ronda 6: imagen por URL, duplicar eligiendo categoría, pausa temporal (⏸ republica en N días vía publish_at), oferta por margen objetivo en lote | ✅ |
| A32 | SEO con IA (kie-ai), imágenes IA en lote (tandas de 10), dictado por voz (Web Speech API es-MX), QR descargable por producto (`qrcode` client-side) | ✅ |
| A33 | Productos ronda 7: SKU y código de barras (`sku`/`barcode` 00106, índice único parcial sobre `sku`, búsqueda por SKU/código en `search_product_ids_fuzzy` 00110 y fallback `.or(sku.ilike,barcode.ilike)`), etiquetas editables (`tags` JSONB con chips + bulk agregar/quitar), filtro por defecto `low_stock_threshold` | ✅ |
| A34 | Productos ronda 7: ventana de oferta programada (`sale_starts_at`/`sale_ends_at` 00107, `sale-window.ts` como fuente única, `withResolvedSale` en tienda/pagos/bumps/upsells, `get_products_by_collection` 00111 devuelve la ventana) y productos relacionados (`related_product_ids` 00109, selector en el modal, `buildRelatedProducts` en la ficha de producto) | ✅ |
| A35 | Productos ronda 7: umbral de stock por producto (`low_stock_threshold` 00108 con backfill de `stock_status`), reposición sugerida con cantidad (`restock.ts`), importación CSV con match por SKU, modos de actualización y dry-run enriquecido | ✅ |
| A36 | Productos ronda 7: detección de imágenes rotas en lote (`product-images.ts` + `check-images`, reemplazar/quitar URL), retención y purga de papelera (`trash.ts`, 30 días, `purge-trash` en cron diario y botón "Vaciar papelera") y diff antes/después en el historial (`audit-diff.ts`, sparkline de precios) | ✅ |
| A37 | Productos ronda 7: SEO con IA en lote (`seo-batch.ts` + `bulk-seo`, solo propuestas con vista previa editable) y reporte de ventas ampliado con margen, costo faltante y clasificación ABC (`sales-report.ts`, CSV + `format=json` con resumen del rango) | ✅ |
| A38 | Productos en móvil: contenedor `max-w-7xl`, barra de acciones con CTA primario + menú "Más", bloques de diagnóstico plegables (`MobileCollapsible`), vista grid por defecto en móvil y tabla en escritorio (`admin-products-view.ts`, derivada con `useMediaQuery`), columnas secundarias ocultas bajo `md` | ✅ |
| A39 | Productos: **chips de categoría con el conteo de productos y el emoji de la categoría** (`getCategoryIcon`, misma fuente que la tienda), con el mismo lenguaje visual de píldoras que `/admin/whatsapp` (gris relleno sin borde / verde sólido al activo), servidos por `categoryCounts` del listado (`categoryTally` pagina 10 × 1000 filas porque PostgREST corta en 1000; degrada a 0 sin romper el panel). Conviven con el `<select>` "Todas las categorías" (conservado a petición del equipo), que comparte estado vía `updateFilters`. "Sin categoría" y los chips de categoría se limpian entre sí para no dejar el listado vacío; scroll horizontal en móvil y wrap en escritorio | ✅ |
| A40 | Productos: **barra de acciones masivas sticky** — se ancla debajo del sub-nav de `/admin` (`sticky z-30 top-[calc(var(--header-top-offset)+var(--admin-subnav-h))]`) para poder aplicar acciones sin volver a subir. El alto del sub-nav lo publica `AdminSubNav` con un `ResizeObserver` en `--admin-subnav-h` (default 45px en `globals.css`, el alto medido; mismo patrón que `--toast-stack-h`), así que sigue al header auto-oculto sin offsets hardcodeados. En móvil es una sola fila con scroll horizontal (`overflow-x-auto`, contador `shrink-0`, `touch-target` de 44px, `whitespace-nowrap` y `py-1.5` ⇒ 58px de alto) para no comerse la pantalla; en `sm+` conserva el wrap y el padding | ✅ |
| A41 | Productos: **orden por más vendidos** en `/admin/productos` (`?sort=sales`). El orden lo aplica Postgres antes de paginar, así que no puede resolverse en JS tras el `range()`; como `products` no tiene columna de ventas y PostgREST no ordena por agregados de `order_items`, la lectura usa la vista `products_with_sales` (00116: `p.*` + `sales_units` + `sales_revenue`, NULL si no vendió, pedidos cancelados excluidos — misma semántica que `sales-report`). La clave vive en `admin-product-sort.ts` con dirección por defecto por clave (`defaultProductSortDir`: `sales` abre en `desc`, el resto en `asc`), de modo que `?sort=sales` sin `dir` ya muestra los más vendidos. `NULLS LAST` con `desc` / `NULLS FIRST` con `asc` deja los no vendidos al final y la app los pinta como 0. Degradación en dos capas si la migración no está aplicada: `clampProductSortToColumns(..., { hasSales })` y reintento contra `products` con `schemaDrift` (aviso ámbar), nunca un 5xx. `row-meta` excluye cancelados para que el número de la columna "Ventas" coincida con el orden | ✅ |
| A42 | Productos: **fila de categorías sticky con el lenguaje visual del catálogo de WhatsApp** (píldoras `rounded-full` blancas con borde `warm-200` en reposo y verde WhatsApp `brand-500` = `#0E7A0E` con `shadow-md shadow-brand-500/20` al activo, emoji de `getCategoryIcon` + nombre + contador atenuado — referencia canónica `user-shop-view.tsx`, la única superficie del repo con píldoras de categoría sticky **y** con icono; supera el estilo/scroll de A39). Queda pegada debajo del sub-nav con `sticky z-30 top-[calc(var(--header-top-offset)+var(--admin-subnav-h))]` y publica su alto real en `--admin-catbar-h` (default `0px`, `ResizeObserver` sobre `categoryBarRef` con deps `[categories.length]` porque las categorías llegan por fetch), así que la barra masiva pasa a `z-20` anclada debajo de **ambas** filas (`…+var(--admin-catbar-h)`) y se desliza por detrás de las píldoras sin cortarlas. Una sola línea con scroll horizontal en todos los breakpoints (`snap-x snap-mandatory`, `scrollbar-hide scroll-fade-x`, sin `flex-wrap`, alto estable) y sangrado a todo el ancho con `-mx-4 px-4 sm:-mx-6 sm:px-6` sobre `bg-gray-50/95` + `backdrop-blur-md` (el `gray-50` del shell admin, no el `#faf8f5` del `body`); `touch-target` en móvil (44px). Contraste verificado ≥4.5:1 en los cuatro estados (nombre y contador, activo e inactivo) | ✅ |
| A12 | Asignación de repartidor desde el dashboard: columna "Repartidor" en "Pedidos recientes" con selector de repartidores **activos** (`activeDrivers` de `src/lib/drivers.ts`, compartido con `/admin/pedidos`) en los pedidos no terminales y nombre fijo en los cerrados. Reutiliza `canAssignDriver` (`order-bulk.ts`) como fuente única de la regla y el `PATCH /api/orders/[id]/status` existente (`driver_id: null` desasigna), con actualización optimista y reversión + toast si falla | ✅ |
| A14 | Pedidos: filtros guardados ✅ (`admin_saved_filters`) **y acciones masivas de estado** ✅: checkbox por renglón + "seleccionar todos los visibles" (indeterminado), barra de acciones con cambio de estado, confirmación de pago y asignación de repartidor, y exportación CSV de la selección. Las reglas puras viven en `src/lib/order-bulk.ts` (28 tests): los pedidos en estado terminal (`delivered`/`cancelled`) se omiten de las acciones de estado pero siguen seleccionables a mano para correcciones puntuales, y la partición devuelve `{eligible, skipped}` por acción. La barra hace fan-out **secuencial** al `PATCH /api/orders/[id]/status` existente (no hay endpoint batch) para no duplicar ni perder efectos por pedido — cupones, `payment_status: "failed"` al cancelar, workflows de WhatsApp, cashback y auditoría. La cancelación masiva es la única acción destructiva: pide `window.confirm` | ✅ |
| A15 | Dashboard: alertas accionables con deep-link al recurso. Las alertas ya enlazaban, pero 3 de los 5 enlaces no llevaban al recurso concreto; la ronda 2 lo cierra: los `href` los resuelve `buildAlertHref` (`src/lib/admin-alerts.ts`) en lugar de escribirse a mano, y las alertas se devuelven con `sortAlertsBySeverity` (crítica → aviso → informativa) para que una crítica no quede debajo de una informativa. `/admin/pedidos` acepta `?status=&q=&from=&to=` (lectura validada con allowlist + escritura de vuelta a la URL, mismo patrón que `/admin/productos`), `/admin/marketing` acepta `?code=` y enfoca el cupón (banner dismissible + anillo + `scrollIntoView` respetando `prefers-reduced-motion`, y aviso propio si el cupón ya no existe), y la alerta de leads apunta a `/admin/leads` en vez de al propio dashboard (era un enlace a sí mismo). El badge "N pendientes por atender" enlaza a `/admin/pedidos?status=pending` | ✅ |
| A43 | Dashboard: **sección "Desempeño de cada ciudad"** — ranking de ciudades por score relativo al mejor de la ventana (`scoreCity`: 0.4 ingreso + 0.25 pedidos + 0.2 tendencia + 0.15 cancelación; una ciudad sin pedidos puntúa 0) con selector 7/30/90 días y comparativa contra el periodo anterior, más un bloque "Ciudades que necesitan atención" y otro "Sin pedidos en el periodo" (a petición: las ciudades sin ventas no se ocultan, se agrupan aparte con sus propios tips). La aritmética vive en `src/lib/admin-city-performance.ts` (41 tests) y las actions `getAdminCityPerformance`/`getAdminCityTip` solo leen y delegan; el componente nunca recalcula. La cobertura de catálogo respeta la semántica **por producto** de `product_city_availability` (00065): sin filas ⇒ disponible en todas, así que la cobertura es `(visibles - restringidos) + disponibles_por_ciudad` — el inverso marcaba como catálogo vacío a toda ciudad sin excepciones. Tips deterministas (8 reglas con umbrales en constantes, ordenadas por severidad con `sortAlertsBySeverity`) + **un tip de IA opcional bajo demanda** (`POST /api/admin/city-performance/tip`, 503 si falta `KIE_AI_API_KEY`, el guard de admin se evalúa antes); el cliente solo manda `{ cityId, days }` y el servidor recalcula. `days` se valida con la allowlist `isPeriodDays` (default 30) y nunca produce 5xx; lectura paginada 1000/20000 con aviso de truncado; deep-links a `/admin/productos?city=`, `/admin/pedidos?status=cancelled`, `/admin/marketing` y `/admin/whatsapp`; tabla en escritorio y tarjetas a 375px, sin recharts (barras CSS) y con `motion-reduce` respetado | ✅ |
| B1 | Productos ronda 8: **conteos y disponibilidad calculados en servidor**. Los contadores de los chips (estado, categoría, "sin ciudad", papelera…) pasan a una sola llamada a la RPC `admin_product_filter_counts` (migración `00115`: 5 índices parciales + función `jsonb`), con el `categoryTally` en JS como fallback si la migración no está aplicada — nunca un 5xx por eso. La lista de ids de "sin ciudad" deja de truncarse. La disponibilidad por ciudad se sirve **por página** (`GET /api/admin/products/city-availability?ids=…` + `pageAvailability` en el listado) en lugar de descargar `product_city_availability` entera en el cliente; el modal la pide al abrirse. `PATCH` sobre esa ruta deja bitácora (`product_city_availability`): era la única mutación del panel sin auditoría | ✅ |
| B2 | Productos ronda 8: **escritura masiva en un endpoint**. `POST /api/admin/products/bulk` sustituye el fan-out de 16 acciones × `N × PATCH /update` por una sola llamada (`{ids, patch}` uniforme **XOR** `{ids, patches: {id: {...}}}` por producto), con ids deduplicados, tope `MAX_BULK_IDS`, escrituras en trozos de `BULK_CHUNK` agrupadas por `JSON.stringify(patch)` y `.select("id")` obligatorio para no reportar como actualizado un id inexistente. El whitelist y las reglas puras viven en `src/lib/product-patch.ts` / `src/lib/product-bulk.ts` porque un `route.ts` de Next **solo puede exportar handlers HTTP**. El lote deja **una** entrada agrupada (`product_bulk_update`) y `related_product_ids` entra en `AUDIT_FIELDS` (antes sus cambios no generaban diff). Siguen siendo por producto borrar, duplicar, generar imágenes, `applySeoBatch`, merge, purga y `bulkSaveImage` | ✅ |
| B3 | Productos ronda 8: **accesibilidad, orden y deep-links**. `src/lib/admin-product-sort.ts` como fuente única del orden (claves `name`/`price`/`stock`/`quantity`/`cost`/`created_at`, dirección por clave, cláusulas `ORDER BY` y degradación) compartida por el cliente y el listado; `aria-sort` en el `<th>` (no en el `<button>` interno), `aria-busy` + `opacity-60` en tabla/grid durante el refetch y región `role="status"`. Selector de orden con dirección y reset en la barra. Todo filtro viaja en la URL (`brokenImage` incluido) y `clearFilters` delega en `clearedProductFilters()`; las confirmaciones destructivas usan el diálogo accesible con foco atrapado en vez de `window.confirm`/`window.prompt` | ✅ |
| B4 | Productos ronda 8: **lotes largos con red**. Toda acción masiva ofrece deshacer (`setUndoAction`, incluidas WhatsApp, unidad, visibilidad, ofertas, etiquetas, categoría, precio y disponibilidad), y los lotes muestran barra de progreso (`aria-valuenow`/`aria-valuemax`) con **cancelar** y resumen de fallos parciales. `postBulk`/`bulkPatchEach` nunca lanzan: convierten el error en entradas `failed` por id, así que el panel dice cuántos fallaron en vez de morir a medias. Tamaños de página revisados (25/50/100/200) | ✅ |
| B5 | Productos ronda 8: **adelgazar el monolito y cubrirlo**. La página (>6 000 líneas) deja de acumular lógica: filtros, listado, selección y ejecución de lotes salen a `src/lib/admin-product-filters.ts`, `-list.ts`, `-selection.ts` y `-bulk-run.ts` (con tests), y el estado de cliente a `use-product-selection.ts` y `use-bulk-runner.ts`. Regla: si se puede probar sin React ni Supabase, va a `src/lib/`. Cobertura por capas: unitarias de los módulos puros + `e2e/admin-productos.spec.ts` (guardas de API para anónimos y robustez de deep-links, etiquetadas `@ci`) | ✅ |
| B6 | Productos ronda 9 — **índice de secciones en el modal de producto**. `ProductFormModal` dejó de ser un scroll de 900 px sin mapa: los campos se agrupan en 7 `<fieldset id="pf-sec-*">` (identidad, catálogo, imágenes, precios, inventario, SEO, publicación) y `FORM_SECTIONS` es la fuente única que alimenta el índice, así que añadir una sección es una línea. El índice se pinta dos veces con el mismo componente `SectionNav`: **rail fijo** de 160 px a la izquierda en `lg+` y **chips** con scroll horizontal en móvil (una sola fila, `overflow-x-auto`, sin wrap). La sección activa la resuelve un `IntersectionObserver` con `root` = cuerpo scrolleable del modal (no la ventana) y `rootMargin: "0px 0px -55% 0px"`, y se marca con `aria-current="true"`; los saltos usan `goToSection()`, que respeta `prefers-reduced-motion` (`behavior: auto` en vez de `smooth`) | ✅ |
| B7 | Productos ronda 9 — **el modal es un diálogo accesible de verdad**. `role="dialog"` + `aria-modal="true"` + `aria-labelledby="pf-dialog-title"` y `tabIndex={-1}` en el `<form>`; el foco inicial va al **diálogo** y no al primer input (para que en móvil no se despliegue el teclado al abrir), se **atrapa** con Tab/Shift+Tab sobre los controles habilitados del diálogo, `Escape` cierra (y si la confirmación de descarte está abierta, la cierra a ella primero), el clic en el velo cierra y el scroll del listado que queda detrás se bloquea (`body.overflow = hidden`, restaurado al desmontar) | ✅ |
| B8 | Productos ronda 9 — **guarda de cambios sin guardar**. Un `FormSnapshot` + `snapshotKey()` (JSON) y una línea base capturada una sola vez en `baselineRef` dan el booleano `dirty`, que alimenta tres cosas: el chip ámbar "Cambios sin guardar" en la cabecera, un `beforeunload` activo solo mientras hay cambios (cerrar la pestaña avisa) y `requestClose()`, que en vez de perder lo escrito abre la barra de confirmación de descarte. Con `saving` en curso el cierre está deshabilitado. La trampa es que un cambio de estado interno no cuenta como sucio: solo los campos del formulario entran en el snapshot | ✅ |
| B9 | Productos ronda 9 — **validación completa de una vez, con el foco donde falla**. `handleSubmit` acumula **todos** los errores en `fieldErrors` en lugar de abortar en el primero, de modo que el usuario ve de golpe qué falta; el resumen es una región `role="alert"` ("Revisa los campos marcados en rojo") y el foco más un `scrollIntoView({ block: "center" })` van al primer campo inválido, resuelto por `PRODUCT_FIELD_INPUT_IDS` (mapa campo → `id` del control, no consultas al DOM a mano). Las reglas viven en `src/lib/product-form.ts` (`validateProductForm()` devuelve `{ errors, firstInvalid, ...valores parseados }`) siguiendo la regla B5 —lógica pura fuera del componente— y por eso se prueban en `src/lib/product-form.test.ts` sin montar React. Las reglas espejan las del servidor (`create`/`update`): nombre obligatorio, precio/oferta/costo finitos y ≥ 0, cantidad y umbral enteros ≥ 0, `validateSku`/`validateBarcode` de `src/lib/sku.ts` y la ventana de oferta (no puede empezar después de terminar). `deriveStockStatus` sigue siendo la regla compartida para derivar el estado desde el umbral | ✅ |
| B10 | Productos ronda 9 — **error por campo, no solo un aviso arriba**. Tres helpers concentran el patrón en `ProductFormModal`: `fieldCls(key)` pinta el control con `border-red-300 bg-red-50/40`, `fieldA11y(key)` publica `aria-invalid` + `aria-describedby="pf-err-<campo>"` y `clearFieldError(key)` retira la marca en cuanto el usuario escribe en ese campo (y baja el resumen cuando ya no queda ningún error). El texto lo renderiza `FieldError` (`id` estable, sin `role`; ver B14). Cableado en nombre, SKU, código de barras, precio, oferta, costo, cantidad, umbral y la ventana de oferta (los dos `datetime-local` comparten el error `saleWindow` y lo anuncian con `aria-describedby`) | ✅ |
| B11 | Productos ronda 9 — **"Guardar y cerrar" desde la confirmación de descarte**. La lógica de guardado se separó en `submitForm()` (llamable sin evento) más un `handleSubmit` que solo hace `preventDefault`; la barra de descarte pasó a tres acciones ordenadas —**Descartar cambios** / **Seguir editando** / **Guardar y cerrar**— con la primaria al final, todas `disabled={saving}` y con spinner en la de guardar. "Guardar y cerrar" cierra primero el aviso (`setConfirmingClose(false)`) y después llama a `submitForm()`: si la validación falla el usuario ve los errores de campo en vez de la barra de descarte, y si guarda bien el modal lo cierra el padre desde `onSaved` (`handleFormSaved`), sin que el modal tenga que cerrarse solo | ✅ |
| B12 | Productos ronda 9 — **los errores del servidor marcan su campo**. `validateProductPatch` (`src/lib/product-patch.ts`) devuelve `field` en sus 25 ramas de error y `create`/`update` lo reenvían en el 400 (y en el 409 de SKU duplicado), así que un SKU repetido ya no cae solo en el aviso general. En el cliente, `formKeyForServerField(field)` (`src/lib/product-form.ts`) traduce el nombre del servidor al del formulario y `markServerField()` vuelca el mensaje a `fieldErrors` y lleva el foco al control; si el campo no se reconoce se mantiene el comportamiento anterior (aviso general). Contrato fijado por `src/lib/product-patch.test.ts` (una prueba por rama) y por los tests de `formKeyForServerField` en `src/lib/product-form.test.ts` | ✅ |
| B13 | Productos ronda 9 — **cobertura e2e del modal** (`e2e/admin-productos-modal.spec.ts`, `@ci`). Sin sesión corre siempre la guarda: `/admin/productos` no expone ni el diálogo ni `#pf-name` a anónimos. Con sesión (`E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD`; sin ellas los casos se saltan solos) se abren los 6 casos de comportamiento: enviar con nombre vacío y precio/costo/cantidad inválidos y ver los cuatro errores a la vez con el foco en `#pf-name` y el resumen anunciado; corregir el precio y ver desaparecer su error y su `aria-invalid`; `Escape` con cambios que abre la confirmación (y un segundo `Escape` que cierra la confirmación, no el modal); "Guardar y cerrar" con el precio inválido, que debe dejar a la vista el error y no la barra de descarte; "Descartar cambios", que sí cierra; y el índice marcando la sección visible al bajar el cuerpo del modal. Ningún caso guarda: el formulario se deja inválido a propósito | ✅ |
| B14 | Productos ronda 9 — **menos ruido en lectores de pantalla**. `FieldError` dejó de ser `role="alert"`: con 9 campos mal, un envío anunciaba 9 alertas encima del resumen. Ahora el único `role="alert"` del formulario es el resumen ("Revisa los campos marcados en rojo") y cada error de campo se anuncia al enfocar su control vía `aria-describedby` | ✅ |
| B15 | Productos ronda 10 — **conteos de los chips en una sola llamada**. La RPC `admin_product_filter_counts(p_include_deleted)` (migración `00118`) devuelve los 11 contadores de la barra de filtros más `brands` y `tagCounts` en un único viaje, en lugar de 11 `count: "exact"` + dos barridos de 1 000 filas. `src/lib/admin-product-counts.ts` valida el payload (descarta una RPC de la versión anterior sin `brands`/`tagCounts`) y el listado conserva el cálculo en JS como respaldo cuando la migración no está aplicada | ✅ |
| B16 | Productos ronda 10 — **historial por producto sin seq scan**. `idx_admin_audit_log_entity (entity, entity_id, created_at DESC)` (migración `00118`) respalda el panel de auditoría de un producto concreto | ✅ |
| B17 | Productos ronda 10 — **export e import comparten una sola cabecera**. `src/lib/product-csv.ts` es la fuente única (cabecera + celdas) del CSV de productos y el import valida las columnas contra ella: `validateImportColumns`/`describeImportColumns` en `src/lib/product-import.ts` marcan las obligatorias que falten (`nombre`, `precio`), el endpoint `import` responde **400** antes de tocar la base y el modal avisa en ámbar y bloquea la vista previa | ✅ |
| B18 | Productos ronda 10 — **cobertura de las rutas sin pruebas**. 11 `route.test.ts` nuevos (delete, duplicate, purge-trash, reorder, merge, store-prices, bulk-seo, audit, check-images, sales-report, upload-image) fijan el contrato actual, incluido lo que hoy degrada mal y queda anotado: `delete` responde 500 con JSON inválido o sin `deleted_at`, `audit` responde 500 si falta la tabla en vez de lista vacía, y `bulk-seo` devuelve 200 con fallos por producto en `failed[]` | ✅ |
| B19 | Productos ronda 10 — **escritura optimista sin pisar cambios ajenos**. `src/lib/product-conflict.ts` define el contrato: `PATCH /update` acepta `expectedUpdatedAt` y responde **409 `stale_write`** con `conflict.current` (fila y versión actuales) en vez de sobreescribir; `POST /bulk` acepta `expected` (mapa id → versión) y `force`, y devuelve los ids `stale` sin escribir. La migración `00119` añade el trigger `products_touch_updated_at` y su índice; el endpoint además sella `updated_at` explícitamente para funcionar antes de aplicarla. En el panel, la escritura de imagen, la de SEO y el guardado rápido mandan su versión previa, adoptan la devuelta y un banner ámbar ofrece recargar | ✅ |
| B20 | Productos ronda 10 — **vistas guardadas sobre la URL canónica**. `src/lib/product-filter-presets.ts` guarda la query normalizada (filtros + orden + tabla/tarjetas + tamaño de página), con tope de 8 y sin `page`. El panel deja de enumerar filtros a mano: lee/escribe la clave `admin-productos-vistas`, migra las vistas del formato anterior (`resurte-admin-product-views`) y marca la vista activa con su número de filtros | ✅ |
| B21 | Productos ronda 10 — **documentación y verificación**: esta tabla, el bloque de la ronda en `docs/agents/admin.md` (con el traspaso del envío desde el modal a la sesión del modal) y la pasada completa de la puerta de calidad | ✅ |
| B22 | Productos ronda 11 — **el estado de stock deja de mentir**. El `<select id="pf-stock">` mostraba `stockStatus` (el valor del formulario) mientras el guardado enviaba otro: con unidades capturadas el servidor derivaba el estado del umbral y la selección del admin se descartaba en silencio. Ahora la derivación vive en `resolveSubmittedStockStatus(quantity, threshold, manual)` (`src/lib/stock.ts`, con `src/lib/stock.test.ts`, que no existía) y devuelve `{ status, derived }`; el select pinta **ese** estado, se **deshabilita** cuando la derivación manda (`disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500`) y `submitForm` usa la misma función en vez de repetir la regla. Las unidades no enteras o negativas (texto a medio escribir) no cuentan como control de inventario, así que no bloquean el select | ✅ |
| B23 | Productos ronda 11 — **margen en vivo y avisos de precio no bloqueantes**. `src/lib/product-pricing.ts` (puro, `src/lib/product-pricing.test.ts`, 22 pruebas) expone `marginPct`, `markupPct`, `marginBand` y `analyzePricing({ price, salePrice, cost, saleStartsAt, saleEndsAt })`, que devuelve `{ effectivePrice, saleState, marginPct, markupPct, warnings }`. El modal lo pinta bajo la rejilla de precios: una franja `#pf-margin` con margen (coloreado con los **mismos cortes que la columna "Margen" del catálogo**, 30 / 10, ahora en `MARGIN_GOOD_PCT`/`MARGIN_WARN_PCT`), markup sobre el costo y precio efectivo con el estado de la oferta (activa / programada / vencida). Dos avisos que **no bloquean el guardado** —`below_cost` (costo ≥ precio efectivo) y `sale_not_a_discount` (oferta ≥ precio normal: la tienda cobraría más)— se listan con `id` que resuelve `pricingWarningId(key)` (kebab: `pf-warn-below-cost`, `pf-warn-sale-not-a-discount`), se anuncian desde `#pf-price`/`#pf-sale` y se resumen en la cabecera del modal como botón "N aviso(s) de precio" que salta a Precios | ✅ |
| B24 | Productos ronda 11 — **pistas que sí se anuncian**. `fieldA11y(key, ...hints)` pasó de publicar `aria-describedby` solo cuando había error a **concatenar** el id del error con los de las pistas estáticas, de modo que ninguna tapa a la otra. Las tres pistas nuevas/ajustadas llevan id y referencia: `#pf-stock-hint` (explica si el estado se deriva o lo elige el admin), `#pf-qty-hint` y `#pf-threshold-hint`. Además, `stock_status` entró en `SERVER_FIELD_TO_FORM_KEY` y `stockStatus` en `PRODUCT_FIELD_INPUT_IDS`: el servidor ya devolvía `field: "stock_status"` en su 400 (`src/lib/product-patch.ts`) pero la traducción lo tiraba, así que un estado de stock inválido acababa en el aviso general. Ahora marca el `<select>` (`#pf-err-stockStatus`), y una prueba nueva fija que **cada** columna traducida tenga control al que llevar el foco | ✅ |
| B25 | Productos ronda 12 — **el formulario completo deja de pisar cambios ajenos**. La ronda 10 dejó la escritura optimista para imagen, SEO y guardado rápido, pero el modal —que guarda **todos** los campos— seguía mandando su `PATCH` sin versión previa, así que el último en guardar ganaba en silencio y el admin veía "Guardado" sobre datos que ya no eran suyos. Ahora el modal manda `expectedUpdatedAt` (la `updated_at` con la que abrió, `product.updated_at`) y, ante un **409 `stale_write`**, `conflictFromResponse` distingue ese 409 del 409 por SKU duplicado: en vez de un error de campo rojo, se abre un **panel de conflicto** ámbar con `role="alert"` (texto estable para el lector de pantalla) y dos salidas explícitas —**Recargar y descartar lo mío** (`window.location.reload()`) o **Guardar lo mío**—. Un conflicto abierto **no se puede esquivar**: `requestSave()` corta cualquier guardado mientras `staleWrite` siga vivo y el botón de envío queda deshabilitado con un `title` que lo explica. Al guardar se recuerda la base nueva (`rememberBaseline`), así que un segundo choque se compara contra lo que de verdad se guardó y no contra la fila original | ✅ |
| B26 | Productos ronda 12 — **el conflicto se explica campo por campo**. Decidir sin información obligaba a elegir entre perder el trabajo propio o perder el del otro. `src/lib/product-write-diff.ts` (puro, `src/lib/product-write-diff.test.ts`, 20 pruebas) hace el diff a tres bandas: `summarizeWriteConflict({ loaded, payload, current })` compara lo cargado, lo que este formulario va a enviar y la fila actual, y parte el resultado en `changes` (ambos lo tocaron → choque real) y `untouched` (solo lo tocó el otro → se conserva sin preguntar); `adoptTheirs` recompone el payload dejando que los campos que este formulario **no** editó tomen el valor del otro, que es exactamente lo que hace "Guardar lo mío"; `describeWriteConflict` redacta el encabezado y el detalle (`hace N min` vía `timeAgo`). El panel se **recalcula en cada render**, así que se actualiza mientras el admin sigue escribiendo. La igualdad es tolerante (`100` = `"100"`, `null` = `undefined`, timestamps por fecha, listas por contenido) y los campos que el servidor no devuelve en `conflict.current` (`description`, `unit`, `publish_at`, `images`…) se omiten en vez de reportarse como choque. El dinero usa el formateador **es-MX** del catálogo (`formatMoney`), no el es-CO de la auditoría | ✅ |
| B27 | Productos — **reparación de las migraciones de la ronda 10 (`42P01`)**. Al aplicar `00118` en producción falló con `relation "admin_audit_log" does not exist` y la causa no era el archivo: **dos migraciones compartían la versión `00078`** (`00078_admin_audit_log.sql` y `00078_foodos_modifiers_dinein.sql`) y el CLI de Supabase identifica cada migración por su versión, así que solo aplicó una y la bitácora **nunca se creó** — `logAdminAudit()` fallaba en silencio (es best-effort), el historial de un producto devolvía 500 y `00118` abortaba entero en su `CREATE INDEX`, incluida la RPC de conteos v2 que iba detrás. Se renumeró el archivo que el CLI **no** tenía registrado (`00078_admin_audit_log.sql` → **`00072_admin_audit_log.sql`**; la misma colisión existía en `00065` y `00065_refund_dispute_cashback_reversal.sql` → **`00135_…`**; renumerar el registrado hace que el CLI lo reejecute y falle por objeto duplicado), ambas migraciones quedaron idempotentes (`CREATE TABLE/INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` antes de la política) y el índice de `00118` va dentro de un `DO $$ … to_regclass … $$` para que una sola sentencia de índice no pueda tumbar la RPC. `src/lib/migrations.test.ts` falla si vuelve a haber dos archivos con la misma versión. Aplicado y verificado en la base: `admin_audit_log` (8 columnas, RLS, política, `idx_admin_audit_log_entity`), `admin_product_filter_counts` devolviendo las **17** claves (antes 4: seguía siendo la v1 de `00115`) y `push_subscriptions` (00134), que tampoco había llegado a aplicarse | ✅ |
| B28 | Productos ronda 13 — **las ventas de la fila dejan de poder mentir**. La columna "Ventas" del listado sumaba `order_items` en el route con un `select` **sin `.limit()`**: con pocos pedidos nadie lo nota, pero el `max-rows` de PostgREST (1000) corta la respuesta en silencio, así que el panel mostraría una cifra **menor** que la real sin ningún aviso, y el orden `sort=sales` usaría esa misma cifra truncada. Ahora se lee la **vista** `products_with_sales` (00116, `p.*` + `sales_units`/`sales_revenue`, con `idx_order_items_product` de apoyo): una fila por producto, el agregado lo hace Postgres y no hay ventana que recortar. `sales_units`/`sales_revenue` llegan como `numeric` (cadena en algunos caminos) y `NULL` cuando el producto no vendió, así que se normalizan con un `toNumber` tolerante. La composición del payload es pura y vive en `src/lib/admin-product-row-meta.ts` (`parseRowMetaPayload`), probada sin mocks en `src/lib/admin-product-row-meta.test.ts`; verificado contra la base: producto 391 → **9** unidades / `$612.00` | ✅ |
| B29 | Productos ronda 13 — **degradación por fuente en `row-meta`**. El route pedía cola de WhatsApp, última edición y ventas en un solo `Promise.all`: si **una** de las tres tablas fallaba (o la migración 00116 no estaba aplicada), el `catch` global devolvía 500 y el panel perdía las tres columnas —incluidas las dos que sí funcionaban— por culpa de una lectura **decorativa**. Ahora cada fuente devuelve `{ ok, rows }`, la composición pura agrupa las que fallaron en `degraded: ("queue"\|"audit"\|"sales")[]` y el route responde **200** siempre que la petición sea válida; el panel declara las fuentes caídas en una franja ámbar (`metaDegraded`, `role="status"`, con `META_SOURCE_LABELS` nombrando "las ventas", "la última edición"…) en vez de mostrar celdas vacías sin explicación. Un fallo de la petición entera declara las tres. `MAX_META_IDS` (200, igual al tamaño de página máximo) ya no recorta en silencio: al excederlo emite `logger.warn("products.row-meta.truncated")` | ✅ |
| B30 | Productos ronda 13 — **un body roto es 400, no 500**. Las 13 rutas de escritura de `/api/admin/products/*` (14 puntos) hacían `await request.json()` **dentro** del `try` cuyo `catch` devolvía 500, así que un cliente con un body ausente, vacío o malformado (`-d '{'`) parecía un fallo del servidor: 500 en el panel, una entrada falsa en `/admin/bitacoras?tab=errores` y ruido en `error_logs`. Ahora el body se lee con `readJsonBody` (`src/lib/api-body.ts`, `src/lib/api-body.test.ts`), que distingue **400** (`MALFORMED_BODY` si no parsea, `INVALID_BODY` si parsea pero no es un objeto plano — rechaza `null`, arrays y primitivos) y deja el 500 a fallos reales. La lectura va justo después de `requireAdmin()`, así que un no-admin sigue viendo **403** y no filtra si su body era válido. En `bulk-seo` el body se parsea **antes** del `isKieAiConfigured()`: sin la clave de IA un body malformado seguía siendo culpa del cliente. Un test transversal (`src/app/api/admin/products/body-contract.test.ts`) importa los 14 handlers y exige 400 malformado / 400 no-objeto / 403-primero en todos, y una prueba preexistente que fijaba el 500 quedó actualizada | ✅ |
| B31 | Productos ronda 13 — **la bitácora degrada, no tumba**. `GET /api/admin/products/audit` devolvía 500 tanto si PostgREST rechazaba la consulta como si `admin_audit_log` no existía (PGRST205/42P01) — el caso real que dejó el historial de un producto roto cuando las migraciones duplicadas de `00078` impidieron crear la tabla. La bitácora es una lectura **decorativa** (el timeline del modal y el drawer de actividad), así que ahora ambos caminos responden **200** con `{ entries: [], degraded: true }` y registran `logger.warn("products.audit.degraded", { scope })`; el 500 queda solo para el fallo de auth o de creación del cliente. El panel aprende la diferencia: con `degraded: true` muestra "Historial no disponible en este momento." en ámbar, mientras que una lista vacía sin degradación sigue diciendo "Sin actividad registrada." / "Sin cambios registrados." — antes ambos casos eran indistinguibles y un fallo se leía como "no pasó nada" | ✅ |
| B32 | Productos ronda 13 — **el contrato de los conteos deja de ser verbal**. Los chips del listado se calculan en dos sitios (RPC v2 de `00118` y el fallback en JS que sigue vivo cuando la migración no está aplicada) y **nada ataba ambos lados**: renombrar `tagCounts` en el SQL o añadir un contador y olvidar leerlo pintaba un **0 silencioso** — el peor bug posible aquí, porque "0 productos sin precio" parece un dato. `src/lib/admin-product-counts.contract.test.ts` lee el SQL de `00118`, extrae las claves del `jsonb_build_object` final y exige que sean exactamente las **17** que el lector consume, que la fixture las cubra todas, que no se emita `unpublished` (se deriva de `catalogTotal - published`) y que el pre-límite de etiquetas del RPC no recorte antes que el tope del panel. Al escribirlo apareció un agujero real: la discriminación v1/v2 comprobaba `typeof tagCounts === "object"` y **un array cumple eso**, así que un `tagCounts: []` pasaba como v2 válida y el panel se quedaba con cero etiquetas **sin caer al camino antiguo**; se corrigió con un `isPlainObject` compartido (`brands` array + `tagCounts` objeto plano) | ✅ |
| B33 | Productos — **el último diálogo nativo del panel desaparece**. Al subir una imagen de galería, el modal preguntaba si recortar a 1:1 con `window.confirm` (`ProductFormModal.tsx`), que es el único sitio de la superficie que seguía usando un diálogo del navegador: bloquea el hilo, no se puede estilar, ignora el `lang`, no respeta `prefers-reduced-motion` ni el foco, y en iOS se ve como un alerta del sistema en medio de una tarea del panel. Ahora el modal **recibe** la función `confirm` del `useConfirmDialog()` que el listado ya montaba (`confirm: (options) => Promise<boolean>` pasa a ser prop **obligatoria** de `ProductFormModalProps`) y la usa con `await confirm({ title, message, confirmLabel: "Recortar", cancelLabel: "Usar original" })`, con el mismo texto que su gemelo `handleImageFile` del listado — así hay **una sola** redacción para la misma decisión. Se eligió **reutilizar** el diálogo del padre y no montar un segundo `useConfirmDialog()` dentro del modal: el diálogo es un hermano del modal en el árbol (el modal en `page.tsx` ~L6427, `{confirmDialog}` ~L6587; el montaje del branch `loading` es mutuamente excluyente), así que el Escape del diálogo no lo ve el manejador del `<form>` del modal y no se cierran los dos a la vez; un diálogo **anidado** dentro del formulario sí habría hecho que un solo Escape disparara `requestClose()` sobre ambos, y además habría dejado dos trampas de Tab compitiendo en el DOM. `z-[60]` > `z-50` lo pinta encima. El `File` sigue siendo válido tras el `await` (es un parámetro), y el `catch` que cae a la imagen original se conserva | ✅ |
| B34 | Productos — **el modal deja de trabajar en silencio**. `ProductFormModal.tsx` tenía **cero** regiones vivas mientras el listado ya tenía ocho: el único anuncio era el `role="alert"` del banner de error, así que un guardado o una subida en curso no existía para el lector de pantalla (y quien navega con teclado se quedaba sin saber si su acción había entrado). Se añade un `liveStatus` con `<p role="status" aria-live="polite" className="sr-only">` que anuncia "Guardando el producto…" al enviar y "Subiendo imagen…" / "Imagen agregada a la galería" en la subida, y los dos botones asíncronos llevan ahora `aria-busy` (`aria-busy={uploadingImg}` en subir imagen, `aria-busy={saving}` en guardar) igual que la tabla y la rejilla del listado. En los `catch` el texto se limpia (`setLiveStatus("")`) **a propósito**: el error ya lo anuncia el banner con `role="alert"`, y dejar ambas voces activas duplicaría el anuncio | ✅ |
| B35 | Productos — **el reabasto deja de ser mudo, sobre todo cuando falla**. `RestockPanel.tsx` (la tarjeta de sugerencias del listado) llama a `adjustProductStock` directamente y era la única pieza de la superficie con escritura asíncrona y **cero** regiones vivas: sin `role="status"`, sin `aria-busy` y con un `catch {}` que **descartaba el error entero** —el comentario decía que "queda en consola del servidor", pero nada lo registraba en ningún sitio—. El daño real estaba en la combinación: al tener éxito la fila **se elimina** de la lista (`prev.filter`), así que la única señal del camino feliz era que el producto desaparecía, y en el camino de error no ocurría **nada** visible: la fila seguía ahí sin explicación y el admin podía creer que su clic no se había registrado y volver a pulsar. Ahora un `liveStatus` (`<p role="status" aria-live="polite" className="sr-only">`) anuncia "Reponiendo {nombre}…" al empezar y "Reabastecido: {nombre}" al terminar, y el `catch` deja de tragarse el fallo: pinta un `role="alert"` con "No se pudo reabastecer {nombre}. Vuelve a intentarlo." y limpia el `liveStatus` para no solapar dos voces (misma regla que B34), con `setRestockError(null)` al reintentar para que el aviso no quede pegado. El botón gana `disabled={busy}` y `aria-busy={busy}` (no se puede encolar dos veces la misma reposición), un `aria-label` que añade el producto (`Reponer 12 · Café`) porque en una lista repetida "Reponer 12" no distingue fila, y unos puntos suspensivos reales (`…`, no `"..."`) en la etiqueta de trabajo. `src/lib/admin-restock-a11y.contract.test.ts` fija el contrato: el `catch` no puede volver a quedarse vacío | ✅ |
| B36 | Productos — **la deuda de contraste del panel era sistémica, no un caso suelto**. C14 dio por cerrada la deuda AA con `e2e/a11y.spec.ts` en 20/20, pero ese gate **solo cubre rutas públicas**: `/admin/productos` exige sesión de admin, así que axe nunca lo miró y una clase entera de defectos sobrevivió al ✅. Medida con un calculador propio (oklch → sRGB con las matrices de Ottosson y composición alfa redondeada, como el navegador), la superficie tenía **cuatro familias** del mismo error: (1) **relleno demasiado claro con texto blanco** — `bg-amber-600` 3.20:1, `bg-green-600` 3.22:1 y `bg-amber-500` 2.13:1 en botones primarios, barras de éxito y chips activos; (2) **texto `-600` sobre fondo `-50`** — `amber-600`/`amber-50` 3.09:1, `green-600`/`green-50` 3.08:1, `gray-500`/`gray-100` 4.39:1, `red-500`/`red-50` 3.48:1; (3) **alfa sobre texto pequeño** — el chip de conteo del botón activo usaba `bg-white/20 text-white`, que sobre el `-600` se quedaba en 3.51:1 (aclarar el fondo de un texto blanco lo empeora); (4) **`gray-300` como color de texto** en placeholders y el indicador de orden, 1.47:1. Se aplicaron **22 reglas / 44 sustituciones en 4 archivos** con un script de parcheo **guardado por aserciones** (cada regla declara su conteo esperado y el script aborta antes de escribir si alguno no cuadra — así se cazaron dos conteos mal calculados que habrían dejado el parche a medias). Las tres reglas que quedan escritas: **sube el tono** (`-600` → `-700`, y `-800` cuando el fondo es `-200`: `amber-700`/`amber-50` 4.85:1, `green-700`/`green-50` 4.72:1, `red-700`/`red-50` 5.87:1, `gray-600`/`gray-100` 6.87:1, blanco/`amber-700` 5.03:1, blanco/`green-700` 4.95:1); **nunca aclares con alfa** — el chip pasa a `bg-black/20`, que oscurece en vez de aclarar y alcanza 7.03:1 sobre el `amber-700` (la sustitución **depende** de haber subido el tono primero); y **un scrim que lleva texto se oscurece**. `src/lib/admin-productos-contrast.contract.test.ts` (12 pruebas) es el **único gate automatizado posible** para esta superficie mientras no haya credenciales de admin en CI, y su prueba central no cuenta ocurrencias: enumera **todo** `text-white(/N)` del perímetro, camina hacia atrás 90 caracteres hasta el `bg-*` más cercano y exige que esté en una lista blanca de rellenos con ratio ≥4.5:1 — se autoextiende según crece el código, y ya destapó un **decimotercer** sitio que un `grep 'bg-.*text-white'` no ve, porque el `text-white/90` del chip "Todos" y el `bg-brand-500` que lo respalda se construyen en **dos funciones auxiliares distintas** (`chipCountClass` y `chipClass`). Se dejaron **deliberadamente** sin tocar `bg-brand-600 text-white` (6.12:1, escala propia de `globals.css` que ya documenta su contraste), `bg-red-600 text-white` (4.77:1), `text-gray-400`/`text-gray-300` decorativos (`aria-hidden`, `—` de dato ausente, iconos de estado vacío: el número real está en el DOM) y los puntos de estado `bg-green-500`/`bg-amber-400` (no son texto, superan el 3:1 de 1.4.11 y son redundantes con la etiqueta y el `title` contiguos) | ✅ |
| B37 | Productos — **los controles de la miniatura eran ilegibles sobre una foto clara**. El hallazgo salió del barrido global de B36, no de una revisión visual: en el editor de galería de `ProductFormModal.tsx` la tira de controles de cada miniatura (estrella de "imagen principal" y botón de quitar) se pintaba sobre `bg-black/40`, y como debajo hay una **foto arbitraria** —puede ser blanca— el fondo compuesto se quedaba en `#999999`. Ahí `text-white/70` daba **2.16:1**, la estrella `text-yellow-300` **2.15:1** y el hover destructivo `text-red-300` **1.48:1**: los tres por debajo del 3:1 que 1.4.11 exige a los glifos, así que el botón de borrar era invisible justo sobre las fotos de producto típicas (fondo blanco). El 40% es el **único** caso del perímetro con texto encima: los otros 19 `bg-black/40` son fondos de modal (`fixed inset-0 … flex items-center justify-center`), donde el texto vive en el panel opaco, no en el scrim. Se sube a `bg-black/70` (`#4d4d4d`) y los tres pasan a **5.16 / 6.37 / 4.40**. Se eligió 70% y no 60% porque al 60% el hover rojo se queda en 2.99:1, por debajo del umbral por un margen que ningún redondeo salva; y **no** se "aclaró" el rojo del hover a `-400`, que mide 2.93:1 y es **peor** que `-300`. Queda cubierto por el mismo contrato de B36 | ✅ |

### Paridad FluxSales (programa de 10 fases)

Roadmap completo en `docs/foodos-paridad-fluxsales.md`. Criterio del programa:
**sin billing** — las capacidades premium se desbloquean con el nivel de lealtad
que el restaurante ya gana comprando, no con una suscripción.

| # | Fase | Estado |
|---|---|---|
| PF1 | **Entitlements por nivel** (fases 0–1). `src/lib/foodos-entitlements.ts` es la fuente única: `marketing_ia` (Plata), `flotilla`/`pos_mostrador`/`comandero` (Oro), `mesero_ia`/`wallet_passes`/`app_marca`/`sitio_ia`/`catering` (Diamante) y `pos_integraciones` en **Verde** —sin candado, porque no hay adaptador que cobrar (ver `RD1`). El nivel se **computa en vivo** desde las semanas calificadas (`computeWeekProgress`, `America/Mexico_City`, ≥ $2,500 MXN) y solo se persisten los overrides de admin (`foodos_entitlement_overrides`, migración `00120`). Contrato de gates: **una escritura lanza** (`requireFoodosFeature()`, primera línea), **una lectura degrada** (`canUseX()` → `[]`/`null`). El gate por rol sigue aplicando **además** | ✅ |
| PF2 | **Capa de IA compartida** (fase 1). `src/lib/ai/llm.ts` + `src/lib/ai/budget.ts` con adaptadores (OmniRoute → OpenAI/gateway compatible → Kie.ai) y una regla de oro: **`generateText` nunca lanza** — sin credenciales, sin presupuesto o con el proveedor caído devuelve plantilla determinista, así que el producto entero funciona sin ninguna variable de IA. `foodos_ai_usage` (migración `00121`) lleva el contador diario por restaurante | ✅ |
| PF3 | **Mesero IA y Marketing IA** (fases 2–3). Mesero IA: máquina de estados de WhatsApp (`state-machine.ts`) + `src/lib/foodos-order-create.ts` como **productor único de pedidos** (lo comparten el storefront y el mesero). Marketing IA: segmentación RFM (`foodos-rfm.ts`), copy por capacidad y `src/lib/messaging/{channel,sms,send}.ts`. La IA solo reescribe el tono: **nunca fija precios ni publica sola** | ✅ |
| PF4 | **Flotilla, Wallet, sitio IA/PWA, POS y catering** (fases 4–7). Flotilla con asignación por turno/cupo/carga y adaptador de reparto externo (`src/lib/flotilla/provider.ts`); tarjeta de lealtad Apple/Google; sitio IA con páginas que nacen en `draft` y el dueño aprueba (`approved_at`); PWA de marca por restaurante (`/r/[slug]/manifest.webmanifest`); POS con registro de adaptadores y reconciliación; catering por volumen con el total decidido en el servidor. Cada capacidad lleva su propia migración (`00122`–`00130`) | ✅ |
| PF5 | **Landing B2B y diagnóstico** (fase 8). `/restaurantes` (`force-static`): calculadora de comisión perdida y calificador de leads como islas cliente. El **diagnóstico lo deriva el servidor**, nunca el navegador. La migración `00131` amplía el `CHECK` de `leads.source` con `restaurantes_landing` — sin ella el endpoint era **fail-open** y habría tirado cada lead en silencio | ✅ |
| PF6 | **Transversal: medición, observabilidad, e2e y docs** (fase 9). KPIs de adopción por capacidad en `/admin/restaurantes` (`src/lib/foodos-adoption.ts`, ventana de 7 días contra los 7 anteriores, tope de 5,000 filas por fuente; `app_marca` no tiene telemetría y se declara como no medida en vez de contarse como cero). **Dedupe cruzado** entre los dos motores de mensajería (`src/lib/messaging/dedupe.ts`): un cliente no recibe dos veces el mismo tipo de mensaje el mismo día, en cualquiera de los dos sentidos, sin fusionar los motores. `e2e/foodos.spec.ts` cubre la landing, los guards de nivel y el micrositio — y verifica que las rutas premium no rendericen el error boundary, porque el boundary de Next responde **200**. Trazas durables de IA y de reparto a `error_logs` (`src/lib/error-log.ts`) | ✅ |

### Paridad Maspedidos (programa de 8 fases)

Roadmap completo en `docs/foodos-paridad-maspedidos.md`; playbook del dominio en
`docs/agents/pos-mesas.md`. Maspedidos es un **POS de restaurante**, no un
marketplace: el programa le dio a FoodOS la paridad operativa (mostrador,
comandero, caja, tickets) y de paso volvió **transaccional** el marketplace
HoyQueComemos. Sin billing: `pos_mostrador` y `comandero` son Diamante.

| # | Fase | Estado |
|---|---|---|
| PM1 | **Fundaciones** (fase 0). `pos_mostrador` + `comandero` en `FOODOS_FEATURES` (ambos Diamante) y migración `00136`: 6 tablas (`foodos_pos_shifts`, `foodos_pos_shift_movements`, `foodos_table_zones`, `foodos_tables`, `foodos_table_tickets`, `foodos_order_folios`), 5 columnas en `foodos_orders` (`folio`, `cashier_user_id`, `pos_shift_id`, `table_ticket_id`, `payment_breakdown`), `foodos_next_folio` y 4 índices únicos parciales. Agregar dos capacidades rompió por exhaustividad tres mapas `Record<FoodosFeature, …>` (`ADOPTION_SOURCES`, `FEATURE_LABEL`, `FEATURE_COPY`) — y el test de adopción de `/admin/restaurantes`, que contaba 8 y pasó a derivar el total de `featuresForTier("Diamante").length` | ✅ |
| PM2 | **POS de mostrador** (fase 1). `src/lib/foodos-payments.ts` (métodos canónicos, cobro combinado —`mixed` es un pseudo-método derivado: `isPaymentMethod("mixed")` es `false`—, `derivePaymentStatus`, aritmética en centavos enteros) + `mostrador-actions.ts` + `mostrador/page.tsx`. **Toda venta pasa por `createFoodosOrder`**: el tercer parámetro `options` es el único canal para folio, turno, cajero, desglose y `sendToKitchen`, porque el body lo controla el cliente. Una venta de mostrador nace pagada (`settled: true`) y **ninguna cotización crea un pedido** (se eliminó un `quoteMostradorSale` que insertaba una fila para previsualizar un total) | ✅ |
| PM3 | **Comandero de mesas** (fase 2). `src/lib/foodos-tables.ts` (puro, 56 pruebas) + `mesas-actions.ts` + `mesas/page.tsx` con mapa visual por zonas, editor de posiciones, traspaso y unión de mesas. Modelo de filas: **una comanda por envío a cocina** (`pending`, sin folio, nunca se cobra) y **una fila al cerrar** (`paid`, con folio) — los ingresos se cuentan por `payment_status`, nunca por número de filas. Dos hallazgos de los tests: `accountLineKey` incluye el **precio unitario** (un cambio de menú a mitad de la comida no puede hacer que la cuenta discrepe de lo cobrado) y `clampPosition` recorta **antes** de comprobar finitud (±Infinity cae en el borde correcto; solo `NaN` usa el default). Un pedido de mesa no escribe `customer_phone` — el trigger `trg_foodos_order_customer` (00023) haría upsert de un cliente inexistente. `00137` añade `billing_requested_at` | ✅ |
| PM4 | **Corte de caja y arqueo** (fase 3). `src/lib/foodos-cash.ts` (puro, 32 pruebas): arqueo por **denominación** (`MXN_DENOMINATIONS`/`sumDenominations`, no un número tecleado), `computeExpectedCash`, `arqueoStatus` (`ok`/`short`/`over`), `cashPartOfSale` (el desglose manda; sin desglose solo `payment_method === "cash"` es efectivo) y `cashSalesFromOrders`, que filtra `paid` **primero**. `src/lib/foodos-shift.ts` aporta `requireOpenShift` (`NoOpenShiftError`) y el alcance de sucursal es siempre `branchId ? eq(...) : is(null)` — **`eq(..., null)` no compara con `NULL` en Postgres** y el fallo habría sido silencioso. `caja/page.tsx` con apertura, movimientos, arqueo y cierre; `arqueo` es `null` mientras el turno está abierto | ✅ |
| PM5 | **Impresión de tickets y comandas** (fase 4). `src/lib/foodos-printing/` (`buildTicketLines`, `resolveFolio`, `printers.ts`, 37 pruebas). **No recalcula precios**: imprime lo que el pedido ya tiene o el ticket no cuadraría con el cobro. Se abandonó el agrupamiento por estación porque el campo `station` **no existe** en el modelo. `resolveFolio` cae al `id` corto si el folio viene vacío. La hora del ticket usa `America/Mexico_City`, igual que el folio: un ticket de las 23:50 con la hora del runtime mostraría el día siguiente. Impresión por navegador (80 mm + `auto=1`), adaptador Bluetooth/USB detrás de la misma interfaz | ✅ |
| PM6 | **Marketplace transaccional** (fase 5). `src/hooks/use-foodos-cart.ts` (carrito por restaurante compartido por el micrositio y el directorio) + `/comer/[slug]` (`revalidate = 300`, `generateStaticParams`, canónica a `/r/[slug]` para que la misma carta en dos rutas no compita consigo misma) + `?platillo=` que resalta y hace scroll al plato buscado. `resolveOrderChannel({ origin, paymentMethod, tableNumber })`: **marketplace gana**, porque lo que se mide es de dónde vino el comensal, no por dónde se cerró | ✅ |
| PM7 | **Reportes, roles y multi-sucursal** (fase 6). `src/lib/foodos-reportes.ts` (puro, 43 pruebas) + `tablero/actions.ts` (`getFoodosReportData`: ventana de fechas, sucursal, tope de 5,000 filas con bandera `truncated`). El tablero leía las últimas **200** filas sin importar el rango, así que un reporte de 90 días era una mentira con formato de tabla; además contaba `pending`/`processing` como ingreso y dividía el ingreso pagado entre **todas** las filas — dos bugs de dinero corregidos. Rol `cajero` (`00138`) y una segunda capa de permisos, `FOODOS_SURFACE_ACCESS`, porque `/panel/foodos/*` colapsa a **una** clave de herramienta; `canAccessPanelHref` es el único predicado de navegación y es **fail-closed** (superficie desconocida no se abre; rol desconocido → `mesero`, no `gerente`). La fuga real estaba en `PanelMobileNav`, que filtraba por área y no por rol. `channelLabel` se centralizó en `src/lib/foodos.ts`: la lista de pedidos imprimía el slug crudo, así que una venta de mostrador decía "MOSTRADOR" | ✅ |
| PM8 | **Verificación y documentación** (fase 7). `e2e/foodos-pos.spec.ts` (`@ci`) cubre las cinco superficies nuevas más el marketplace; las rutas se suman al calentamiento de `e2e/global-setup.ts`. **El e2e no autentica** (no hay seed ni credenciales), así que verifica lo verificable: que ningún anónimo reciba datos del POS, que `/comer` renderice sin backend y que un slug inexistente dé **404 real** — la aritmética de los flujos (folio, arqueo, totales, payload de impresión, gating) se fija en unitarios. Documentación: `docs/foodos-paridad-maspedidos.md`, `docs/agents/pos-mesas.md`, este plan y `docs/agents/README.md` | ✅ |

### Ronda de mejoras (FoodOS + backlog)

Cierra los pendientes que dejó el programa de 10 fases y tres ítems del backlog,
con una regla nueva: **la caducidad de créditos es real**, no solo informativa.

| # | Fase | Estado |
|---|---|---|
| M1 | **Nadie leía `foodos_ai_usage`**: la tabla acumulaba tokens desde `00121` y el tope diario (`AI_DAILY_TOKEN_CAP`) existía como freno, no como información. `src/lib/ai/usage.ts` (`summarizeAiUsage` puro + `loadAiUsage`, 14 pruebas) agrega el día en curso, los 7 previos y la media, y marca `nearCap` al 80 % (`NEAR_CAP_RATIO`); `loadAiUsage` lee la tabla **directamente** —RLS ya deja al dueño, y `foodos_ai_reserve`/`foodos_ai_settle` están revocadas para `authenticated`— y **degrada a `null`**: nunca lanza. La tarjeta `AiUsageCard` del tablero solo **avisa**, no corta: el corte lo sigue decidiendo `reserveAiBudget`. Cierra el pendiente de Observabilidad de PF6 | ✅ |
| M2 | **El micrositio deja de responder 200 en un 404**: `/r/<slug-inexistente>` devolvía **200** con el cuerpo del not-found. Medición de control (guard apagado, env válida, caché limpia): slug inexistente y su `/carta` → **200**; con el guard → **404**, y `/r/mr-fresh` sigue **200** con su esqueleto (`aria-busy`, `role="status"`). Eran **dos** fronteras independientes: `src/app/r/[slug]/loading.tsx` —resuelta poniendo el guard en el `layout.tsx` del mismo segmento, porque `loading.js` se anida *dentro* de `layout.js`— y `src/app/loading.tsx` (raíz), que envolvía también al layout del segmento y por eso hubo que **borrarla** (restaurarla regresa 404→200). El 404 con identidad del micrositio se movió de `[slug]/not-found.tsx` —donde era **inerte**, porque un `not-found` se renderiza dentro del layout que lanza el `notFound()`— a `src/app/r/not-found.tsx`. `e2e/foodos.spec.ts` y `smoke.spec.ts` ahora afirman el **status** además del contenido, y el status es independiente de los datos, así que detecta la regresión incluso con la env de CI. Consecuencia aceptada: el sitio pierde el esqueleto **global** de carga (si vuelve, va por segmento o en un route group, nunca en la raíz) | ✅ |
| M3 | **Los dos módulos puros que faltaban, con pruebas**: `src/lib/pos/reconcile.test.ts` (64) y `src/lib/messaging/send.test.ts` (41) — 105 pruebas sobre `planOrderReconcile`/`planMenuSync` y sobre la cadena de envío con adaptadores falsos. Los tests destaparon **5 hallazgos**; se corrigieron los dos que eran bugs reales: `attemptSms` no blindaba el envío con `try/catch` (un adaptador que lanza rompía el contrato "nunca lanza" y tumbaba `foodos-campaigns.ts`) y la degradación al WhatsApp global de la plataforma era **silenciosa** (`catch {}` sin log, así que los envíos salían del número equivocado sin dejar rastro) — ahora `logger.warn("messaging.wa-config", …)`. Quedan documentados tres hallazgos menores, hoy inocuos | ✅ |
| M4 | **El arranque en frío deja de flaquear en e2e**: `e2e/global-setup.ts` (17 rutas, 3 reintentos, 60 s, `AbortController`) calienta las rutas antes de la suite y **nunca lanza** — un calentamiento fallido solo emite un `console.warn`. La compilación en frío era la causa #1 de flakes (medido: 212/1/21 → 213/0/21 al calentar a mano); ahora es automático y no depende de que alguien recuerde el `curl` | ✅ |

### Ronda 3 — el día local tiene una sola autoridad

El backlog declarado estaba cerrado (176 ✅, cero 🔜), así que esta ronda sale de
**deuda medida con herramientas**, no de un inventario. La medición encontró un
bug vivo en el checkout y su causa raíz: **la app tenía dos autoridades del día**
y la que usaba el checkout leía UTC.

| # | Fase | Estado |
|---|---|---|
| D1 | **Red de seguridad del helper canónico**: `src/lib/local-date.ts` era la autoridad de todos los "días" de la app y **no tenía ni un test**. `src/lib/local-date.test.ts` (20 pruebas) se escribe **antes** de convertirlo en autoridad única: anclas fijas (`2026-09-18T01:00:00Z` = 19:00 del 17 en CDMX, el cruce de medianoche que fallaba), el quirk `hour: 24` de `hour12: false`, timezone inválida → fallback UTC, `null`/`""` → `DEFAULT_TIMEZONE`, padding, extremos de `minutesOfDay` y el turno que cruza medianoche | ✅ |
| D2 | **El bug del checkout, arreglado**: `getNextDays()` construía la fecha con setters **locales** y la serializaba con `toISOString()` (**UTC**), mientras `api/orders` la lee como día **local** (`` `${date}T${time}:00-06:00` ``). De **18:00 a 24:00 locales —toda la cena—** las 7 opciones iban un día adelante: el botón "Hoy — jueves 17" enviaba `2026-09-18`, y era además la **fecha por defecto** del checkout. Dormido al medirlo (07:58 locales) y sin una sola aserción e2e sobre la fecha. Extraído a `src/lib/delivery-days.ts` (puro, `now`/`timezone` inyectables) que ancla en `dayKeyOf` y avanza sobre el **mediodía UTC**; `checkout-shared.tsx` pasa a **reexportar**, así que sus 4 consumidores (`[slug]/checkout`, `CheckoutDrawer`, `ScheduleStep`, `ReviewStep`) no cambian. `delivery-days.test.ts` (7 pruebas) lo bloquea, incluido el caso que hoy sí funcionaba (07:00 locales). **Prueba de mutación: reintroducir el bug → 4 de 7 en rojo** | ✅ |
| D3 | **Sitios con semántica de día local migrados a `dayKeyOf`**: la clave de dedupe diario del catálogo por WhatsApp (`admin/actions.ts`, **invariante 16** — el "una vez al día" se corría de ventana), `isoDay()` y el rango 7d/30d de `panel/analitica`, `sale_price_start_date` del catálogo de Meta (la oferta arrancaba un día tarde) y el `<lastmod>` del sitemap (fecha de modificación en el futuro). **`reportTo` del reporte de ventas se deja en UTC a propósito**: el servidor filtra con `lte created_at "…T23:59:59Z"` —aserción literal en `sales-report/route.test.ts`— así que pedir "hoy local" recortaría la venta de la tarde; se documenta en el código en vez de introducir un bug peor | ✅ |
| D4 | **Nombres de archivo con el día correcto**: 14 sitios que nombran un CSV o una carpeta de Storage (`panel/page.tsx`, `admin/pedidos`, `bitacoras/errores-tab`, `admin/comisiones`, `recompensas/facturas-tab`, `admin/usuarios`, `PeriodComparison`, `admin/proveedores`, `admin/productos`, `api/panel/backup`, `api/admin/products/upload-image`, `comercializacion/prospectos-page`, `comercializacion/dashboard-page`, `recompensas/ActivityFeed`). Un reporte descargado a las 19:00 se llamaba con la fecha de **mañana**. **Excluido a propósito** `panel/foodos/caja/page.tsx`: archivo de otra sesión en vuelo en este mismo checkout | ✅ |
| D5 | **Una sola autoridad**: `foodos-ai-wa/orchestrator.ts` definía `localDay()` con `Intl.DateTimeFormat("en-CA", …)`, un **duplicado exacto** de `dayKeyOf`. Eliminado (26 líneas) y migrado su único consumidor; la única diferencia de comportamiento —el `catch` caía a CDMX y `dayKeyOf` cae a UTC— solo aplica con una zona malformada en la BD | ✅ |
| D6 | **Contrato anti-regresión + los sitios que el barrido encontró**: `src/lib/local-date.contract.test.ts` recorre `src/` y **falla si aparece** un `toISOString().slice(0,10)`/`.split("T")[0]` fuera de una **allowlist con motivo explícito** (validación round-trip de `order-filters`, clave ISO de semana de `price-index`, `reportTo`, y `caja` en vuelo), o un `toLocaleDateString("en-CA")`/`Intl.DateTimeFormat("en-CA")` sin `timeZone`. El barrido destapó **4 sitios más de la familia "zona del runtime"**: el `min` del `<input type="date">` de `checkout-view.tsx` (con la zona del navegador, un cliente fuera de CDMX podía elegir **ayer**), el "hoy" y el nombre del cierre diario de `panel/foodos/tablero`, y el mes de `whatsapp-automations-engine` (cambiaba a las 18:00 del último día). Y `toDatetimeLocalValue` arregla `prospect-form`: el form mostraba la hora UTC y **re-guardar sin editar derivaba 6 horas**. **Prueba de mutación con archivo sonda: las 3 reglas disparan; `toISOString()` sin recorte no se marca** | ✅ |

**Verificación de la ronda** (todo lo tocado en verde): `npx tsc --noEmit` → 0 ·
`npm run lint` → 0 · `npm run build` → 0 con `/r/[slug]` y `/r/[slug]/carta`
siguen **● SSG** · `npm test` → **4080 passed / 1 failed**, y el único rojo es
`admin/restaurantes.test.ts` (`averageUnlocked` espera 8 y recibe 10) de **otra
sesión**, que añadió `pos_mostrador` y `comandero` a `FEATURE_TIER` sin
actualizar su test: está en HEAD, sin cambios locales, y se reporta, no se
arregla · `npm run test:e2e` → **165 passed / 0 failed / 23 skipped**, con los
specs de checkout (`checkout`, `checkout-drawer`, `money-flows`) en verde ·
inventario final de recortes UTC en `src/` (no test): **4 sitios, los 4
justificados**. La regla queda como **regla común 8** de `docs/agents/README.md`
y como invariante del playbook de checkout.

### Ronda 4 — la capa móvil recupera su red de seguridad

El backlog declarado volvió a estar cerrado (186 ✅, cero 🔜), así que la ronda
sale otra vez de **deuda medida con herramientas**. La medición encontró algo
peor que deuda: `npm run test:e2e` es `playwright test --grep @ci`, y **cuatro
specs completos no tenían ni una sola etiqueta `@ci`** — **84 tests** que
existían en el repo y que **nadie ejecutaba jamás** (`mobile.spec.ts` 68,
`keyboard` 7, `auth` 6, `redeem` 3). La suite decía "todo verde" mientras un
tercio de la evidencia móvil estaba apagada. Al encenderlos: **16 en rojo**, y
detrás había **dos bugs reales de producto**.

| # | Fase | Estado |
|---|---|---|
| M1 | **Triaje de los 16 rojos** (sin tocar código). Corrida real contra el dev server vivo (`E2E_PORT=3100`): **30 ✅ · 16 ❌ · 28 skip en 2.1 min**. Tres causas raíz, ninguna "flake": (a) **ancla muerta** — `mobile.spec.ts` buscaba `getByRole("navigation", { name: "Accesos rápidos del panel" })`, un label que **existe solo en el test** (`grep -rn "Accesos rápidos" src/` → 0 coincidencias) y cuyo fallback pulsaba "Hamburguesas y Hot Dogs", texto que solo aparece **como comentario** en `src/lib/recipes.ts` → `tap()` agotaba los **30 s** y reventaba el `beforeEach` entero; el FAB real (`aria-label="Abrir herramientas"`) ya se usaba en Fase 17, así que la migración estaba **a medias**; (b) **regresión real de UI** — el footer de `/cdmx` en móvil medía **618.875 px** contra un presupuesto de 560; (c) **contención** bajo `fullyParallel`. Entregable: tabla de triaje | ✅ |
| M2 | **El arnés de colección del panel**: un solo helper (`seedPanelCollection`), ancla real (`Abrir herramientas`), diálogo correcto, rótulos reales del sheet, `toBeHidden()` donde el FAB es `lg:hidden`, y **timeouts acotados** para que un fallo sea rápido y claro. La secuencia de corridas cuenta la historia: **16 → 4 → 15 → 1**. El pico a 15 lo **introduje yo**: un bucle de 3 iteraciones con `close.tap()` sin timeout durante la animación de salida de `AnimatePresence`; acotarlo (2 iteraciones, `timeout: 2000` y `state: "detached"`) devolvió el verde. Lección repetida: **el arnés nuevo también puede ser la regresión** | ✅ |
| M3 | **La regresión real del footer**: medida en vivo con Playwright a 412 px antes de tocar nada — **618.875 px** = `padding-top` 32 + grid 473.875 (marca 134 + fila 2 141 + fila 3 158.875 + dos gaps de 20) + bloque inferior 57 (texto a **2 líneas**). El exceso era **ritmo vertical**, no un link de más (los 2 links SEO de `258072f7` se conservan). 5 ediciones **solo móviles** en `footer.tsx` → **545 px < 560** con las 4 columnas igualadas (139 px) y sin encoger ningún target táctil. Spec móvil: **45 passed · 29 skipped · 0 failed en 31.1 s** | ✅ |
| M4 | **Los 16 verdes**: cada rojo cerrado según su triaje — test reparado si el ancla estaba muerta, UI reparada si la aserción seguía siendo válida | ✅ |
| M5 | **Los huérfanos, encendidos** — y el alcance cambió por completo al medir. Los 84 no eran "CI-safe pendientes de cablear": **cuatro specs obsoletos y rotos**, y dos de ellos no probaban nada. `redeem.spec.ts` creía mockearse con `page.route`, pero su petición salía por `page.request.post()`, **que no pasa por ese interceptor** → el spec nunca ejerció su propio mock. `auth.spec.ts`: 3 de 6 rompían por `getByLabel(/contraseña/i)` (**strict mode violation**: el botón `aria-label="Mostrar contraseña"` también matchea) y otros 2 asertaban un "enlace mágico" y un "¿olvidaste tu contraseña?" **que no existen**. `keyboard.spec.ts`: 2 falsos positivos por usar `className` como identidad de nodo (dos nodos distintos comparten clases Tailwind) → sustituido por un `WeakMap` de ids. Para separar "spec roto" de "falta de datos" monté un **repo CI-equivalente** (Supabase dummy, webpack) y corrí los mismos specs contra él y contra el server real: **resultado idéntico** → no era cuestión de datos. Reescritos `auth` (5 tests) y `redeem`, reparados `keyboard` y `mobile`, y **etiquetados**: `mobile.spec.ts` **26/26 describes** y `mobile-chrome.spec.ts` sus **2** — lo que recuperó **11 tests que no tenían ninguna etiqueta** porque los genera un bucle `for` sobre anchos. **Bug de producto #1**: `resetPasswordForEmail` aparece **únicamente en un comentario** (`src/app/auth/reset/page.tsx`) y `signInWithOtp` no existe → **la recuperación de contraseña es inalcanzable**: la página funciona y nada enlaza a ella | ✅ |
| M6 | **El tap que no llegaba**: el pill de la guía del panel (`guide-toggle-button.tsx`, `z-[85]`) **interceptaba el tap de "Aceptar todas"** del banner de cookies (`z-[60]`). No era una sospecha: el log de Playwright lo nombraba —`… guide-toggle-button.tsx … intercepts pointer events`— y `--workers=1` reproducía el mismo fallo, así que **no era contención**. La causa es de una línea: en el panel `body.has-panel-bottom-nav` fija `--floating-bottom-offset: calc(4.5rem + var(--inset-bottom))` — el **mismo offset exacto** que el pill escribe a mano — así que ambos ocupan la misma franja y la guía gana por z-index. El mecanismo de resolución **ya existía** (`body.cookie-consent-visible` ocultaba `.whatsapp-floating`, `.sticky-catalog-button`, `.city-detector`): al pill le faltaba **solo su clase semántica**. Añadida `guide-toggle-floating` + una línea de CSS → **Fase 16: 4 passed · 4 skipped · 0 failed**. El **barrido** del resto de la franja (26 `fixed` con `z >= 60` en `src/`, de los que **solo 5 están anclados al rail**) cerró el asunto con una medición, no con una sospecha: los 2 pills del dashboard (`z-[60]`) **empatan** con el banner pero **no interceptan** (el banner se renderiza después en `layout.tsx` y gana el empate por orden de DOM), el `PanelFab` (`z-40`) es el **ancla** de la que deriva el offset —no un bug— y el `toast` (`z-[100]`) es efímero. **El pill escribía su offset a mano a propósito**: leer `var(--floating-bottom-offset)` lo haría arrancar 3.5rem abajo en el primer frame, porque `has-panel-bottom-nav` la añade un efecto que espera a que la colección cargue (documentado en el CSS para que nadie lo "arregle") | ✅ |
| M7 | **Los dos contratos anti-regresión** (modelo `local-date.contract.test.ts`). `src/lib/e2e-specs.contract.test.ts`: todo `e2e/*.spec.ts` tiene algún `@ci`, todo `describe`/`test` de nivel superior lleva la etiqueta en **su propio** header, y `test:e2e` sigue filtrando por ella. Ya en su primera corrida **encontró 2 bloques reales sin etiqueta** (los dos describes de `mobile-chrome.spec.ts`). `src/lib/floats.contract.test.ts`: barre `src/**/*.tsx`, encuentra los flotantes del rail con `z >= 60` y exige que **cada uno tenga decisión** — oculto (y entonces su clase tiene que estar de verdad en el CSS) o exento **con motivo escrito**. Los dos verificados por **prueba de mutación**: quitar la clase del CSS o romper el prefijo la detecta; reintroducir un bloque sin `@ci` la detecta | ✅ |
| M8 | **Documentación**: esta sección, las **reglas comunes 9 y 10** de `docs/agents/README.md` (*"todo spec e2e corre en CI, o no existe"* y *"todo flotante inferior declara su colisión"*), y la corrección del párrafo de § Verificación que daba el bug del FAB por **ajeno al plan** | ✅ |
| M9 | **Verificación de la ronda** | ✅ |

**Verificación de la ronda** (todo lo tocado en verde): los dos contratos →
**8 passed / 0 failed** · spec móvil completo contra el server real →
**45 passed · 29 skipped · 0 failed** · suite `@ci` completa contra el server
real y **con `--retries=2`**, como corre CI → **348 passed · 113 skipped ·
27 flaky · 2 failed** (490 tests, ambos projects), frente a la línea base de
antes de la ronda (**307 passed · 10 failed · 25 flaky**). Los **2 rojos son el
mismo test** (`compartir.spec.ts:39`) y **no son una regresión**: su propia
cabecera declara que asume el entorno CI (Supabase dummy) porque necesita que el
catálogo **no** matchee "tomate" y "lechuga", y contra el server real sí
matchean. Verificado verde en ambos projects contra el repo CI-equivalente.

**Tres lecciones que la ronda dejó escritas, porque las tres me mordieron:**

1. **El agujero de calentamiento tenía dos capas, no una.** `global-setup.ts`
   calentaba páginas, pero **una API route que la página llama desde el cliente
   también paga compilación en frío** y no aparece en ningún spec. Medido:
   `/api/reviews` **13.2 s**, `/api/addresses/guest` **10.9 s**,
   `/api/cart/bumps` **3.6 s**. El síntoma que lo delata es preciso: **el test
   falla en el primer project y pasa en el segundo, contra el mismo server y con
   `--workers=1`**. Añadido el array `API_ROUTES` (18 rutas; **un `GET` basta
   para compilar el módulo, y un `405` también**) → **64 rutas** calentadas.
   Verificado **en frío de verdad** (`.next` borrado): `compartir + calificar +
   redeem + money-flows` → **64 passed**, `money-flows` → **20 passed**.
2. **El test del 404 nunca midió el 404: medía la carga del server.** Mi primer
   diagnóstico fue que la aserción era **inalcanzable** porque `page.goto()`
   caía en `not-found.tsx` y conservaba el título del root layout. **Era falso, y
   lo desmintió una sonda en navegador real**: tras hidratar, el `h1` es "404" y
   el título **sí** pasa a ser el del segmento (`"Ciudad no encontrada —
   Resurte.me"`, de `src/app/[slug]/page.tsx`). Lo que pasa es que la cáscara
   inicial (`<html id="__next_error__">`) trae el título del root layout y solo
   se reemplaza al hidratar el payload de flight; con el timeout por defecto de
   5 s el test medía el arranque en frío. Arreglado con **`timeout: 15000`** en
   los 4 tests del 404 — **sin tocar una sola aserción**, porque las aserciones
   eran correctas.
   **Se volvió a medir esto y el `timeout: 15000` resultó insuficiente**:
   el `h1 "404"` tarda **~2.1 s en caliente pero >30 s con 5 workers en
   paralelo** — y ahí no se arregla subiéndole el número, porque un aserto de
   visibilidad mide la **hidratación del servidor de desarrollo**, que no tiene
   cota, no una propiedad del producto. En `e2e/foodos.spec.ts` los dos tests del
   micrositio pasan a afirmar **el cuerpo de la respuesta** (`status()` 404 +
   `"El restaurante que buscas no existe"`), que llega en la cáscara y es estable
   en milisegundos. Detalle de por qué ese copy discrimina: aparece **1 vez** en
   `/r/**` y **0 veces** en el boundary raíz, así que prueba que respondió **este**
   boundary y no el genérico — y, al ser ramas mutuamente excluyentes, implica
   que la vista del restaurante no se renderizó.
3. **El CI no sirvió como línea base.** Llevaba **6 corridas consecutivas en
   rojo en `main`** por estados intermedios rotos de otras sesiones (un `TS2300`
   por identificador duplicado, Knip), así que la comparación válida es
   **local y con `--retries=2`**.

**Dos hallazgos de producto, declarados aquí y hoy resueltos:**

1. **La recuperación de contraseña no tenía entrada** (rastreada como **U14**,
   **cerrada** — ver la fila U14 de la sección 6). La **mitad receptora funcionaba**
   (`/auth/reset` cambia la contraseña con `updateUser`, y `/auth/callback`
   intercambia el código por la sesión temporal); faltaba la **mitad
   iniciadora**: `resetPasswordForEmail` aparecía **únicamente en un comentario**
   y **nada enlazaba a esa ruta**. Dos agravantes que encontré al comprobar la
   propiedad del hallazgo: (a) el aviso de enlace caducado de la propia página es
   **copy visible** y le dice al usuario que lo solicite «desde iniciar sesión con
   ¿Olvidaste tu contraseña?» — **un control que no existía**, así que el callejón
   sin salida era doble; (b) `docs/OPS.md` § 8.1 **daba por implementados** este
   flujo y el enlace mágico (`signInWithOtp`, que **no existe en `src/`**) y
   avisaba de que ambos consumen el SMTP. **Corregido ahí** en la ronda 4: hoy
   `docs/OPS.md` § 8.1 vuelve a listar la recuperación como flujo vivo y deja el
   enlace mágico como no construido.
2. **El pill de la guía tapaba "Aceptar todas"** (bug #2, ya arreglado arriba en
   M6).

**Estado de los tres gates al cerrar** — `npm test`, `npx tsc --noEmit` y
`npm run lint` quedaron **en rojo por trabajo en vuelo de otra sesión** (la
**ronda 5**, Leads CRM: `src/app/admin/leads/page.tsx`, `src/app/admin/actions.ts`
y `e2e/admin-leads.spec.ts`, los tres **`M` o recién commiteados**, ninguno
tocado por esta ronda). El detalle que importa: **el contrato de la ronda 3 hizo
su trabajo** — `local-date.contract.test.ts` cazó un recorte UTC real en el
código nuevo (`leads/page.tsx`: el nombre del CSV se construye con
`new Date().toISOString().slice(0, 10)`, que **desplaza la fecha un día** después
de las 18:00 en CDMX). Es exactamente la clase de bug que la ronda 3 eliminó, y
la guardia lo detectó en cuanto apareció.

### Ronda 5 — Leads CRM: el lead deja de morir en su bandeja

`/admin/leads` era la única superficie del panel con **dos listas que no se
hablaban**: arriba los leads capturados por el checkout y la landing, abajo el
pipeline de `crm_prospects`, y nada unía un lead con un prospecto. La edición
era `window.prompt`, no había filtros, ni detalle, ni export, ni asignación.
Peor: existía un CRM de vendedores **más rico** en `src/lib/comercializacion/**`
que el panel nunca reutilizaba, así que la misma entidad se leía de dos maneras
distintas según quién mirara.

La ronda cierra el ciclo **lead → prospecto** y lo hace reutilizando el motor
existente en vez de duplicarlo. La decisión de esquema que lo habilita:
`crm_prospects.seller_id` deja de ser `NOT NULL` (un lead web no tiene vendedor)
y el prospecto entra al pipeline **sin asignar**; la RLS que ya existía
(`USING seller_id = auth.uid()`) hace que esa cartera sea **invisible para los
vendedores** sin tocar ninguna política, y el admin la reparte desde el panel.

| # | Fase | Estado |
|---|---|---|
| L1 | **Migración `00139`**: `crm_prospects.seller_id` nullable (+ `COMMENT`), `lead_id BIGINT → leads(id) ON DELETE SET NULL` con índice **único parcial** `WHERE lead_id IS NOT NULL`, `leads.converted_prospect_id` / `converted_at` / `status TEXT NOT NULL DEFAULT 'nuevo'` con `CHECK ('nuevo','convertido','descartado')`, y cuatro índices alineados al patrón real de consulta (no sueltos): `(status, next_follow_up_at)`, `(created_at DESC) WHERE seller_id IS NULL`, `(status, created_at DESC)` y un parcial para el contador de pendientes. **RLS sin cambios, a propósito** | ✅ |
| L2 | **Motor puro** (`src/lib/crm-pipeline.ts`): embudo de `crm_prospects` (`CRM_BOARD_COLUMNS`, `groupIntoBoard`), bandeja de leads (`LEAD_STATUSES`, `isLeadPending`), urgencia (`prospectUrgency`, `compareByUrgency`, `isFollowUpDue`), conversión (`leadToProspectDraft`, `prospectNameFromLead`, `leadDiagnosisNotes`) y búsqueda/dedupe (`normalizeForSearch`, `phoneKey`, `matchesSearch`, `findMatchingProspect`). 33 pruebas | ✅ |
| L3 | **Server actions** (Fase 13 de `src/app/admin/actions.ts`): `getAdminLeads` devuelve `AdminLeadPage { rows, total }` y pagina **después** de filtrar (el filtro usa campos derivados; un `LIMIT` en SQL antes de filtrar daría páginas vacías), `getAdminCrmBoard`, `getAdminSellers`, `getAdminProspectDetail`, `convertLeadToProspect` (idempotente), `discardLead` / `restoreLead`, `patchCrmProspect` y `assignCrmProspect(id, sellerId \| null)`. Ocho acciones de auditoría nuevas en `@/lib/audit-log` | ✅ |
| L4 | **Tres pestañas** en `/admin/leads` (*Leads* / *Pipeline* / *Embudo*) con `role="tablist"` y navegación por flechas con `tabIndex` móvil | ✅ |
| L5 | **Bandeja de leads**: bandejas *Pendientes* / *Convertidos* / *Descartados* / *Todos* con conteos, búsqueda, filtro por origen y por segmento, acciones por fila (convertir, descartar, restaurar) con confirmación real y toasts | ✅ |
| L6 | **Drawer de detalle** (`LeadDetailDrawer.tsx`): `role="dialog"` + `aria-modal`, trampa de foco, Escape, bloqueo del scroll del body, línea de tiempo de actividad, cambio de estado, notas, fecha de seguimiento y asignación de vendedor. Objetivos táctiles de 44 px | ✅ |
| L7 | **Filtros con una sola fuente de verdad** (`src/lib/crm-filters.ts`): allowlist de `tab`/`box`/`status`/`page`, `parseCrmSearchParams` → `buildCrmQuery` → `crmHref`, escritos de vuelta a la URL con `router.replace`. Las alertas y el widget del dashboard **dejan de escribir rutas a mano** | ✅ |
| L8 | **Export CSV** de la vista filtrada reutilizando `@/lib/csv` (`toCsv` + `downloadCsv`), con el nombre de archivo construido sobre el día **local** | ✅ |
| L9 | **Embudo medido, no inventado** (`src/lib/crm-funnel.ts`): pasos con tasa, desglose por origen y por segmento, y antigüedad de pendientes (`hoy`/`3d`/`7d`/`30d`/`old`). Regla central: **una tasa sin denominador es `null` y se pinta "No medido", nunca `0%`** — un 0% se lee como un dato. 28 pruebas | ✅ |
| L10 | **Móvil y a11y**: kanban del pipeline con scroll `snap-x`, objetivos de 44 px, regiones vivas en las acciones asíncronas, contraste verificado con el contrato del panel | ✅ |
| L11 | **Alerta y widget**: nueva alerta `follow_ups_due` (prospectos con `next_follow_up_at` vencido) con deep-link al pipeline filtrado, y el widget `LeadsCrmWidget` pasa de 3 a 4 tarjetas mostrando *Sin asignar*; **cada número enlaza** a la vista que lo contiene, así que deja de ser un dato muerto | ✅ |
| L12 | **Contratos y documentación**: `src/lib/crm-pipeline.contract.test.ts` (16 pruebas) ata el esquema de `00139`/`00052` al motor puro — `LEAD_STATUSES` ↔ `CHECK` de `leads.status`, índice único **parcial** de `lead_id`, `seller_id` nullable y la RLS **no** relajada; `e2e/admin-leads.spec.ts` cubre guards de anónimo y descarte de parámetros inválidos | ✅ |

**Verificación de la ronda**: `npx tsc --noEmit` → 0 · `npm run lint` → 0 ·
`npm test` → 4250 passed / 0 failed · `npm run build` → 0.

**La migración `00139` no se pudo aplicar en este entorno** (no hay Docker ni
`psql`): queda escrita y lista para `supabase db push`. El código está escrito
para degradar avisando (`logger.warn`) en vez de romper cuando la migración no
está aplicada, así que el orden de despliegue no es un riesgo de caída.

### Ronda 6 — Leads CRM: bandeja, reparto y nutrición

El CRM de leads sabía **captar y repartir**, pero no **conversar**. El webhook de
WhatsApp ya persistía cada mensaje entrante en `whatsapp_messages` y **nadie los
leía**: no existía ninguna vista de conversación en todo el panel. Tampoco había
forma de responder desde el CRM, ni de saber a quién le tocaba, ni de nutrir un
lead frío sin escribirle uno por uno.

La ronda toma los cuatro pilares que le faltaban al panel respecto a una
herramienta de chat empresarial —**bandeja de conversaciones, reparto con SLA,
etiquetas y nutrición por secuencias, y asistente de respuesta**— y los
implementa **proyectando lo que ya existe** en vez de crear un segundo almacén
de conversaciones. La bandeja es una **cuarta pestaña** de `/admin/leads`, y la
conversación del lead vive dentro de su drawer: el mismo lugar donde ya se
trabajaba el prospecto.

| # | Fase | Estado |
|---|---|---|
| C1 | **Migración `00140`**: `crm_prospects.tags TEXT[] NOT NULL DEFAULT '{}'` + índice GIN; columna generada `whatsapp_messages.from_digits` (`NULLIF(right(regexp_replace(from_number,'\D','','g'),10),'')`) + índice `(from_digits, created_at DESC)` — el primer índice que hace consultable el teléfono sin depender de formato; `crm_quick_replies` (título único + índice parcial de activas); `crm_sequences` / `crm_sequence_steps` / `crm_sequence_enrollments` con `CHECK` de payload, `UNIQUE(sequence_id, step_order)` y `UNIQUE(sequence_id, prospect_id)`. RLS **habilitada con cero políticas** en las cuatro tablas nuevas; **ninguna** política existente relajada | ✅ |
| C2 | **Motor puro de bandeja** (`src/lib/crm-inbox.ts`): ventana de 24 h (`whatsappWindowState`, `canSendFreeForm`, `requiresTemplate`), hilos (`mergeTimeline`, `buildThread`), buckets (`INBOX_BUCKETS`), tiempo de primera respuesta, plantillas de respuesta rápida (`renderQuickReply` deja **literal** la variable desconocida) y programación de pasos (`nextSequenceRun`). Corrección clave de supuesto: `from_number` es **el cliente** en ambas direcciones. 64 pruebas | ✅ |
| C3 | **Reparto y SLA** (`src/lib/crm-assignment.ts`): `buildSellerLoad`, `distributeProspects` con desempate por `sellerId` ascendente (reparto **determinista**, no aleatorio), `buildSlaBoard`, `firstResponseStats` + `percentile`. `formatMinutes` devuelve `"—"` para `null`/`undefined`/`NaN`, porque un tiempo de respuesta no medido **no es cero**. 48 pruebas | ✅ |
| C4 | **Server actions** (`src/app/admin/actions.ts`): `getAdminLeadConversation`, `sendLeadMessage` (**revalida la ventana de 24 h en el servidor**), `saveQuickReply`, `setCrmProspectTags`, `bulkTagProspects`, `phoneLookupVariants` para tolerar la lada (`52`/`521`). Nueve acciones de auditoría; el `detail` de un envío guarda `{template, characters}` y **nunca el cuerpo** | ✅ |
| C5 | **Pestaña *Bandeja*** (`LeadConversations.tsx`): lista de hilos ordenada por urgencia, contadores por bucket, y panel de conversación reutilizable **dentro del drawer del lead**. El compositor se bloquea fuera de ventana y ofrece plantilla | ✅ |
| C6 | **SLA en el embudo**: sección nueva con tablero por bucket, tiempos de primera respuesta (mediana/p90) y carga por vendedor. Todo indicador sin datos se declara *no medido* | ✅ |
| C7 | **Etiquetas** (`src/lib/crm-tags.ts`): normalización (`MAX_TAG_LENGTH` 24, `MAX_TAGS_PER_PROSPECT` 12), `parseTagInput` que parte por coma, punto y coma y salto de línea, y filtro `?tag=` integrado en la allowlist de la URL. Columna nueva en el CSV. 30 pruebas | ✅ |
| C8 | **Secuencias de nutrición** (`src/lib/crm-sequences-engine.ts`): motor que corre en el cron diario como job `crm-sequences`, con tope por pasada (`MAX_SEQUENCE_SENDS_PER_RUN` 50), dedupe por `dedupe_key` (el `23505` cuenta como `skipped`), y **`is_active` por defecto `false`** — activar es un acto explícito del admin y no hay forma de hacerlo por URL. 25 pruebas | ✅ |
| C9 | **Asistente de respuesta** (`src/lib/crm-ai.ts`): arma el contexto del hilo redactando PII (`maskPhone`, `maskEmail`, `redactFreeText`) y **propone** un borrador; `suggestLeadReply` cae a `buildFallbackReply` (plantilla) cuando el proveedor no responde. **Nunca auto-envía** y nunca pone un teléfono o correo completo en el prompt. 29 pruebas | ✅ |
| C10 | **Contratos y e2e**: `src/lib/crm-inbox.contract.test.ts` (43 pruebas) ata `00140`/`00097` al motor puro — columna generada equivalente a `phoneKey()`, `is_active` en `false`, `CHECK` de `status` ↔ `SequenceAdvance`, RLS sin políticas, y la **ausencia** de columnas desnormalizadas de último mensaje; cinco bloques `@ci` nuevos en `e2e/admin-leads.spec.ts` (guard de la pestaña, allowlist de `?view=`, `?tag=`, combinación completa de filtros y "las secuencias no se activan por URL") | ✅ |
| C11 | **Documentación**: invariantes de la ronda en `docs/agents/admin.md` y esta sección | ✅ |
| C12 | **Cerrada en la Ronda 11**: las cinco escrituras tienen interfaz. Al medirla se descubrió que la fila era falsa por partida doble —decía "cubiertas por pruebas" y ninguna tenía consumidor **ni** prueba de comportamiento— y que escondía tres defectos: `cancelSequenceEnrollment` no tenía lector que le diera un id (`listCrmSequences` solo cuenta inscripciones), `enrollProspectsInSequence` ignoraba el estado y hacía **irrecuperable** una inscripción cancelada (`UNIQUE (sequence_id, prospect_id)` bloquea el re-insert), y `is_active` de las respuestas rápidas era un campo muerto (`ConversationPanel.tsx` cortaba a 8 sin filtrar). Detalle y evidencia en la Ronda 11 | ✅ |

**Verificación de la ronda**: `npx tsc --noEmit` → 0 · `npm run lint` → 0 ·
`npm test` → 4506 passed / 0 failed (271 archivos) · `npm run build` → 0.

**Ni `00139` ni `00140` se pudieron aplicar en este entorno** (no hay Docker ni
`psql`): ambas quedan escritas y listas para `supabase db push`. El código está
escrito para degradar avisando (`logger.warn`) en vez de romper cuando la
migración no está aplicada — en particular la bandeja empareja por
`from_number` y **no** por la columna generada, así que funciona con 00140 sin
aplicar.

### Ronda 7 — El quinto gate de CI: `knip`

`.github/workflows/ci.yml` declara **cinco** verificaciones y la quinta nunca se
había medido. `npx knip --production` llevaba rojo permanente con **479
hallazgos**: no era un gate, era un paso que se había aprendido a ignorar. La
causa raíz no estaba en el código sino en **la configuración**. `--production`
oculta todo lo que solo consumen los tests; `ignoreExportsUsedInFile` no estaba
activado, y sin él knip reporta cada símbolo usado únicamente dentro de su
propio módulo y cada colisión de nombre entre módulos; y `package.json`
arrastraba un `knip.ignoreIssues` de **65 entradas** que enumeraban justo ese
ruido. Medido con y sin ellas, el recuento no se movía: **la lista era inerte**,
nadie la había comprobado nunca.

La ronda pone el gate en verde arreglando **primero la medición y después el
código**, y cierra las dos formas de volver a apagarlo: un contrato que ata la
configuración —y su justificación— y otro que ata los punteros de este propio
documento.

| # | Fase | Estado |
|---|---|---|
| K1 | **La medición se arregla antes que el código**: script `"knip": "knip"` sin flags —para que CI y local midan lo mismo—, `ignoreExportsUsedInFile: true` y las **65 entradas inertes** de `ignoreIssues` borradas (212 líneas). `knip` pasa de **479 → 62**. Se midió que `--config` **reemplaza** la clave `ignoreIssues` en vez de fusionarla, así que un config parcial mide otra cosa: la medición se hace sobre `package.json` | ✅ |
| K2 | **El barrel de impresión deja de ofrecer lo que no tiene** (`src/lib/foodos-printing/index.ts`): de 26 re-exports a los **5** que producción importa. El resto era el catálogo ESC/POS declarado "para que la UI pueda mostrarlo como próximamente" — una capacidad que no existe, exportada como si existiera. El docstring prohíbe reexportar "por comodidad" → **40** | ✅ |
| K3 | **Cinco recortes de re-export** sin consumidor: `crm-pipeline` (11 símbolos y el `export type` reducido a `{ CrmStatus, ProspectFilters }`; su docstring decía "se reexporta para no romper a los consumidores" y la migración a `crm-core` ya había terminado), `crm-sequences-engine` (`isSequenceStepDue`), `foodos-reportes` (`channelLabel`), `storage/index` (`StorageSchema`) y `checkout-shared` (`DeliveryDay`) → **24** | ✅ |
| K4 | **`courierLink` se cablea en vez de duplicarse**: `panel/foodos/actions.ts` armaba el enlace del repartidor **inline** teniendo el helper al lado. Ahora lo llama. La duplicación era la razón de que knip lo viera muerto, y el arreglo no era borrarlo sino usarlo → **21** | ✅ |
| K5 | **Triaje símbolo por símbolo, verificando antes de borrar**: `ScoredCustomer` (`foodos-rfm.ts`) no tenía una sola referencia —ni dentro de su módulo— y se borró. El resto va a **allowlist con motivo escrito**, no a borrado: los cinco server actions de escritura del CRM (K9), `pollTaskUntilComplete` (API de piloto declarada en su propio docstring), `readCartSyncEntry` e `INBOX_VIEW_LABEL` (fuentes únicas escritas y no adoptadas), `integration-status.ts` (archivo sin trackear de otra sesión) y los 8 interfaces de `types/foodos.ts`/`types/index.ts`, que **espejan tablas que sí existen** en migraciones. Más `sharp`, `supabase` y `vercel` como `ignoreDependencies`: los dos últimos son los **CLI de los runbooks** de `docs/OPS.md` (12 invocaciones de `npx supabase` y las de `vercel`), y `sharp` lo importan scripts que knip no analiza porque `scripts/**` está en `ignore`. De 21 quedaba **1**: un archivo sin trackear de otra sesión | ✅ |
| K6 | **El gate entra en CI y se ata**: `ci.yml` pasa de `npx knip --production` a **`npm run knip`** —medir con un flag que nadie usa es medir otra cosa—, y `src/lib/knip-config.contract.test.ts` (8 pruebas) hace de **ratchet**: fija la allowlist y sus motivos por igualdad exacta, exige que cada entrada tenga justificación escrita, que no queden justificaciones huérfanas, que solo se supriman `exports`/`types` (nunca `files`, que escondería un archivo entero) y que CI no vuelva al flag. Probado por mutación: añadir una entrada sin motivo hace fallar tres pruebas | ✅ |
| K7 | **Los punteros de este plan dejan de mentir** (`src/lib/docs-pointers.contract.test.ts`): había tres referencias a una *ronda 9* que **no existía** —las actas se interrumpían después de la ronda 6, y las de las rondas 8 y 9 llegaron más tarde— y dos punteros vagos del tipo *ver esa sección* sin destino. Los punteros se sanean (el contenido de esa ronda vive en la fila **U14** y en § Verificación, y ahora ahí apuntan) y el contrato falla ante un puntero a una sección o a una fila inexistente, ante un puntero vago y ante dos actas con el mismo número. Incluye el discriminador que hacía falta: en este documento **"Productos ronda N"** (filas A18–A37 y B1–B32) es el nombre de una tanda del panel de productos, **no** un acta. Nota para quien escriba aquí: las frases exactas que el contrato prohíbe no se pueden citar literalmente ni para explicarlas —el contrato no distingue prosa de puntero—, así que van en cursiva o con el número en negrita | ✅ |
| K8 | **Invariante 11** en `docs/agents/README.md`: *todo gate de CI está verificado y verde, o no está en CI*. Un paso en rojo permanente no protege: entrena a ignorar el resultado | ✅ |
| K9 | **Los cinco server actions de la ronda 6 se investigan, no se borran**: `saveQuickReply`, `deleteQuickReply`, `distributeCrmProspects`, `getAdminSellerLoads` y `cancelSequenceEnrollment` no tienen consumidor, pero la mitad **lectora** sí está cableada (`LeadConversations.tsx` llama `getAdminQuickReplies`; `LeadSequences.tsx` muestra `activeEnrollments`). No es código abandonado: es una función a medio construir, y queda declarada como backlog en la fila **C12** de la ronda 6 | ✅ |

**Lección — `knip` mide el working tree, no `HEAD`.** Su código de salida no es
estable en un checkout compartido: un archivo nuevo sin trackear de otra sesión
aparece como *unused file* y devuelve el gate a rojo sin que nada de esta ronda
haya cambiado. El contrato de K6 fija **la configuración**, que es lo único que
esta ronda puede controlar; el recuento depende del estado del árbol en el
instante de medirlo. Corolario: antes de atribuirse un hallazgo, comprobar la
propiedad del archivo (`git status --porcelain <archivo>` +
`git cat-file -e HEAD:<archivo>`).

### Ronda 8 — Conversión: el embudo deja de mentir

El panel de conversiones abría con **"Error al cargar el funnel"**. La causa no
estaba en la UI: `/api/admin/funnel` filtraba `email_logs` por `created_at`, una
columna que esa tabla **nunca tuvo** (solo tiene `sent_at`). Postgres devolvía
`42703`, la ruta un 500, y el cliente pintaba un mensaje genérico que no
distinguía "la consulta está mal escrita" de "no hay datos". Un embudo que se
cae entero porque una de sus cinco consultas nombra mal una columna.

Arreglar eso dejó a la vista lo de fondo: la superficie **no se podía
cuestionar**. No decía contra qué se comparaba el periodo, no decía cuándo un
número estaba recortado, y no decía qué parte del embudo se medía y qué parte
solo se contaba. La ronda arregla el error y después hace que el panel sea
honesto sobre lo que mide.

| # | Fase | Estado |
|---|---|---|
| CV1 | **La columna que no existía**: `email_logs` se filtra por `sent_at` en `/api/admin/funnel` y en `reorder-reminders.ts` (mismo error, misma tabla). El `42703` tenía una segunda causa latente: la ruta pedía `utm_source` en la lectura de detalle y reintentaba sin él si la columna no estaba — el reintento ahora está probado, igual que la regresión de `sent_at` | ✅ |
| CV2 | **Contra qué se compara**: `buildFunnelComparison` / `buildMethodComparison` / `buildUtmComparison` en `@/lib/conversion-funnel` comparan contra la **ventana anterior de la misma duración** (`periodBounds`), no contra el día previo, y las tarjetas muestran el delta con su dirección. La regla que no se rompe: `compareMetric` devuelve `deltaPct: null` cuando la base es **0** — nunca `100` ni `-100`, porque un "▲ 100%" sobre cero es un dato inventado — y la UI lo pinta como *no medido* | ✅ |
| CV3 | **Un recorte se declara**: las tres lecturas tienen tope (`DETAIL_LIMIT` 2000, `RECOVERY_LOG_LIMIT` 2000, `TAKE_RATE_ID_LIMIT` 1000) y la respuesta ahora lo dice (`detailTruncated`, `recoveryTruncated`, `takeRateTruncated`) y nombra en `degraded[]` qué quedó a medias; el encabezado muestra un aviso en vez de presentar cifras parciales como completas. En la misma ronda, la recuperación se atribuye **con desenlace** (`recoveredOrders` / `recoveredRevenue`, no solo el envío) y la tasa por origen UTM gana su denominador | ✅ |
| CV4 | **Las dos implementaciones se atan** (`src/lib/conversion-funnel.contract.test.ts`): la regla vive **dos veces** —la RPC `admin_conversion_funnel_window` (migración `00141`) agrega en Postgres sin tope de filas, y `classifyOrder`/`buildFunnel` es la referencia a la que la ruta degrada— y nada garantizaba que dijeran lo mismo. El contrato lee la migración como **texto** y exige que coincidan el orden de los `WHEN`, la tabla `VALUES` de orden, los centinelas, el tope de UTM, el índice y los permisos; y además evalúa el `CASE` del SQL contra `classifyOrder` sobre las **60** combinaciones de estado, pago y método. Probado por mutación en tres rondas, con el SQL restaurado byte a byte | ✅ |
| CV5 | **La tendencia diaria, sin una segunda verdad**: la serie se calcula en JS con el detalle que la ruta **ya** leyó (coste cero) y **se apaga** cuando esa lectura se recortó o falló (`trendUnavailable` → `trend: null`), porque un corte sobre una lectura ordenada por fecha descendente deja completos los días recientes y vacíos los primeros: dibujarla publicaría un crecimiento que no ocurrió. Se descartó una RPC de tendencia: duplicaría la regla que CV4 existe para atar, y un `RETURNS TABLE` con tope de filas reintroduciría el fallo silencioso que `00141` vino a cerrar. El contrato encontró un **bug real** al escribirla: agrupar por día local sin cortar por instante colaba el pedido que cae justo en `until`, que el SQL excluye. La ventana es semiabierta `[since, until)`, el día es local (`DEFAULT_TIMEZONE`), y como 30 días son 30×24 h la serie toca **31** días locales: los del borde se marcan `partial` y la gráfica lo advierte, porque un día a medias se lee igual que una caída | ✅ |
| CV6 | **La gráfica no es la única salida**: `role="img"` con el resumen textual de la serie (`describeTrend`) y, plegada bajo *Ver los datos por día*, la misma serie como tabla. El SVG solo no es accesible; la tabla deja el dato a quien no ve la curva. La superficie queda documentada como invariantes en `docs/agents/admin.md` | ✅ |
| CV7 | **La paridad se probó contra datos reales, no solo contra fixtures**: se capturó la respuesta de `admin_conversion_funnel_window` sobre las 23 órdenes de la base viva y se pasaron las **mismas filas** por el motor JS; las dos salidas son iguales campo por campo. Es la única prueba que no puede pasar por construcción, porque no comparte el fixture con ninguna de las dos implementaciones | ✅ |

**Lección — un `CASE` en SQL y un `if` en TypeScript son la misma regla escrita
dos veces, y la segunda copia no avisa cuando la primera cambia.** El embudo
tenía un camino rápido (agregar en Postgres) y un camino de respaldo (degradar a
JS), y los dos tenían que decir lo mismo. Ninguna prueba lo comprobaba porque
ninguna prueba puede llamar a Postgres: el contrato lee la migración como
**texto** y compara el orden de los `WHEN` contra la función pura. La lección
general es la de K6 y K7 en otro sitio: **lo que no se mide se desvía**, y en
código duplicado se desvía en silencio.

### Ronda 9 — El pipeline que sí protege

`.github/workflows/ci.yml` declaraba cinco verificaciones y **ninguna
protegía**: el pipeline medía con un comando que el desarrollador no usaba, se
**pisaba a sí mismo** y escondía su gate más caro. Medido sobre 100 corridas
antes de tocar nada: **66 failure · 32 success · 2 in_progress**. Por job, el
reparto no era el que parecía —`verify` iba **38 rojas de 40**, mientras `e2e`
pasaba **25 de 40**—, así que la mitad "rota" del pipeline estaba en realidad
**cancelada**, y el paso que rompía `verify` era casi siempre `Knip` (10) o
`Lint` (8), no los tests (2) ni los tipos (2). Y `Build` salía **`-`** en todos
los listados de pasos: no fallaba, **nunca llegaba a ejecutarse**, porque `Knip`
iba delante.

La ronda no arregla tests: arregla el **instrumento**. Pone el candado de
concurrencia, unifica el comando entre CI y local, ordena los gates, y añade un
ejecutor local que avisa sin castigar — más un contrato que impide que cualquiera
de las cuatro cosas se pierda otra vez.

| # | Fase | Estado |
|---|---|---|
| CI1 | **La línea base se mide antes de tocar el YAML**: cinco consultas `gh` sobre las últimas 100 corridas (`run list`, jobs por corrida, pasos fallidos por job, duración real, gap entre corridas). Sin esto "el CI está roto" es una impresión, no un dato: el desglose por job y por paso es lo que descartó que el problema fueran los tests. Todo en `files/r8-baseline.md` | ✅ |
| CI2 | **El candado que faltaba**: bloque `concurrency` a nivel de workflow con `group: ${{ github.workflow }}-${{ github.ref }}` y `cancel-in-progress: true`. La evidencia: **33 de 99** corridas arrancaron a **menos de 180 s** de la anterior mientras `e2e` tarda **155–244 s**; la cancelación llega a los **~91 s**, muy por debajo del `timeout-minutes: 25` del job, y GitHub la reporta **igual que un fallo**. La coincidencia **32,5 % canceladas ≈ 33 % solapadas** es la que identifica la causa: el grupo incluye `github.ref`, así que un push a `main` no cancela el PR de otra rama | ✅ |
| CI3 | **El comando deja de ser dos comandos**: `package.json` gana `"typecheck": "tsc --noEmit"` y `"verify": "npm run typecheck && npm run lint && npm test && npm run knip"`, y `ci.yml` pasa de `npx tsc --noEmit` a **`npm run typecheck`**. Es el corolario de la invariante 11 aplicado a la propia invariante 5: mientras la lista de verificación nombraba un binario suelto que nadie tecleaba, medía otra cosa | ✅ |
| CI4 | **El orden de los gates**: `Install` → `Typecheck` → `Lint` → `Unit tests` → **`Build`** → `Knip`. `Knip` **sigue bloqueando** (no se le pone `continue-on-error`); lo único que cambia es que deja de esconder al gate más caro del repo, que llevaba sin medir nada mientras el pipeline parecía tenerlo | ✅ |
| CI5 | **El ejecutor local que avisa y no bloquea** (`.githooks/pre-push`): corre `npm run typecheck` y `npm run lint` con la salida silenciada, imprime un aviso si algo sale rojo y **termina siempre en `exit 0`**. La decisión es explícita: este checkout lo comparten varias sesiones a la vez, así que un hook que aborte el push castigaría a quien no hizo el cambio — el CI decide. Degrada en silencio si falta `node_modules` o `npm`. Se probó en cuatro escenarios (sin `node_modules`, con `npm` falso que falla, sin `npm` en el `PATH` y contra el repo real: **exit 0** en los cuatro, 26 s en el real) | ✅ |
| CI6 | **El contrato que lo ata todo** (`src/lib/ci-config.contract.test.ts`, 10 pruebas): existen los siete scripts que el pipeline necesita; todo `npm run X` del workflow apunta a un script real; `concurrency` existe, cancela y agrupa por `github.ref`; ninguna línea `run:` vuelve a invocar `npx tsc` ni `knip --production`; `Build` corre después de los tests y antes de `Knip`; **toda variable `env:` del workflow está documentada en `.env.local.example`**; `test:e2e` conserva `--grep @ci`; el hook existe, es ejecutable y no puede bloquear; y no se reintroduce un gestor de hooks que bloquee. Probado por **mutación en sandbox**: 17 mutaciones, 17 detectadas (ver la lección) | ✅ |
| CI7 | **Documentación y un defecto de nombre**: **invariante 12** en `docs/agents/README.md` (*todo pipeline declara su concurrencia y su orden de gates, o mide otra cosa*), la **invariante 5** reescrita con `npm run verify` y el motivo de por qué antes no tenía ejecutor, la sección **`docs/OPS.md` §12** (comandos, activación del hook con `git config core.hooksPath .githooks`, y el aviso de que no bloquea) y la corrección de la tabla de §3: la variable se llamaba `SERVICE_ROLE_KEY` y se llama **`SUPABASE_SERVICE_ROLE_KEY`** — el nombre equivocado en el runbook de una variable que `createServiceClient()` exige para no lanzar | ✅ |
| CI8 | **La hipótesis que se descarta, escrita**: que al job `e2e` le faltara `SUPABASE_SERVICE_ROLE_KEY` era el candidato obvio, y **es falso**: el job pasa 25 de 40 con ese mismo `env`. Añadir una clave *placeholder* sería **estrictamente peor**, porque `createServiceClient()` lanza en sincrónico y sus llamadores lo capturan (fail-open), así que con una clave falsa `createClient` tendría éxito y convertiría un `throw` inmediato en llamadas de red contra un host inexistente dentro de las 64 rutas de `e2e/global-setup.ts`. Queda declarado en § Verificación, sin fila de backlog: no hay trabajo pendiente, hay una decisión | ✅ |

**Lección — un pipeline sin candado no falla: cancela, y una cancelación se lee
como fallo.** La lectura ingenua del panel de Actions era "los tests están
roto" (38 de 40 corridas de `verify` en rojo); el desglose por job y por paso
dijo lo contrario —los tests rompían 2 veces, los tipos 2, y el job `e2e` pasaba
la mayoría de las veces—. Un workflow sin `concurrency` convierte cada push
rápido en la **muerte del anterior**, y como GitHub reporta la cancelación con
el mismo color que el fallo, el síntoma se confunde con el de un test roto y se
"arregla" mirando el código equivocado. Corolario, el mismo de la invariante 11
en otro plano: **antes de arreglar un gate hay que comprobar que el gate mida lo
que su nombre dice** —`Build` aparecía en el YAML y nunca corría—, y antes de
atribuirse un rojo hay que leer **qué paso** lo produjo, no solo que el job esté
rojo.

**Lección — la mutación se hace en un sandbox, no en el repo.** En este checkout
conviven varias sesiones que commitean con `git add -A`, así que mutar
`package.json` o `ci.yml` en el sitio correcto deja una ventana en la que el
árbol está roto a propósito y otra sesión puede capturarlo en un commit. La
prueba por mutación se hizo sobre una **copia** del árbol en el directorio de
sesión (`package.json`, `ci.yml`, `.env.local.example`, `.githooks/pre-push` y el
propio contrato, con `node_modules` enlazado), y el contrato se escribió para
leer siempre desde `process.cwd()`: 17 mutaciones —quitar un script, invertir
`Build` y `Knip`, borrar `concurrency`, poner `cancel-in-progress: false`,
reintroducir `npx tsc --noEmit` y `knip --production`, declarar una variable
`env` sin documentar, perder `--grep @ci`, declarar `husky`, añadir `prepare`,
quitar el bit de ejecución del hook, meterle `exit 1` y meterle `set -e`— y
**las 17 pusieron el contrato en rojo**. Una aserción que no se puede romper a
propósito no es un contrato, es un comentario.


### Ronda 10 — Fusión Comercialización × Leads: un núcleo, dos superficies

`crm_prospects` es una sola tabla y la leían **tres pilas independientes**:
`/admin/leads` (rondas 5 y 6), el CRM del vendedor
(`src/lib/comercializacion/**`) y el módulo del agente (`src/lib/agente/**`).
Cada una tenía su **tipo de fila**, su **mapeo** y —en dos de los tres casos— su
propia **ficha de detalle**, así que la misma entidad se veía distinta según
quién mirara. La fusión **no** unifica las superficies (los dos roles ven cosas
distintas y siguen teniendo su ruta), unifica el **núcleo**: un tipo, un lector,
un mapeo, una ficha y un panel de conversación, con el **alcance inyectado**.

El estado de partida, medido antes de tocar nada:

| Preocupación | Admin | Vendedor | Agente |
|---|---|---|---|
| Lector de listas | `getAdminCrmBoard()` | `getProspects()` | `getDailyQueue()` |
| Tipo de fila | `CrmProspect` | `Prospect` | `ProspectRow` |
| Ficha | `LeadDetailDrawer.tsx` | `prospecto-detail.tsx` (528 líneas) | — |
| Búsqueda | `filterProspects()` en memoria, insensible a acentos | `escapeOrTerm()` + `ilike`, sensible a acentos | — |

**El vocabulario de estados ya era idéntico** en las tres
(`nuevo, contactado, en_seguimiento, cliente_activo, inactivo, perdido`), así que
**la ronda no necesitó ninguna migración** — dato que solo se sabe leyendo las
tres implementaciones, no los planes.

**Alcance acordado** (tres decisiones explícitas, no supuestos):
*Núcleo único compartido + dos superficies por rol* (se conservan **las dos**
rutas: `/admin/leads` ve todo, incluido el pozo sin asignar; `/comercializacion`
solo ve la cartera propia); **`src/lib/agente/**` entra** en la fusión como
consumidor del lector y los tipos, **sin cambios de UI ni de features**;
**paridad selectiva** para el vendedor, que gana **etiquetas** y la **bandeja de
conversación de sus propios prospectos** (misma ventana de 24 h) pero **no** SLA
ni secuencias de goteo.

| # | Fase | Estado |
|---|---|---|
| F1 | **Núcleo puro `src/lib/crm-core.ts`**: vocabulario de estados, `CrmProspectRow`, `mapCrmProspect`, `readTags`, la **escalera de columnas** (`00052` → `00059` → `00139` → `00140`) y el **alcance** (`CrmScope`, `ADMIN_SCOPE`, `sellerScope`, `scopeForRole`, `isProspectInScope`, `assertProspectInScope`, `crmScopeFilter`, `applyCrmScope`). Re-apuntados `crm-pipeline`, `crm-tags`, `comercializacion/types`, `actions/helpers`, `crm-assignment`, `crm-inbox`, `crm-sequences-engine` y `admin/actions` a la **fuente única**. Fixture compartida `crm-fixtures.ts` + `crm-core.contract.test.ts` | ✅ |
| F2 | **Lector único `src/lib/crm-prospects.ts`** (`readCrmProspects`): recibe `scope` + `filters`, devuelve `CrmProspectRow`. Re-apuntados `getProspects`, `getAdminCrmBoard` y `loadAssignableProspects` (usando los parámetros `ids`/`sellerPresence` que existían sin consumidor). `PAGE_SIZE` duplicado como `50` literal en `prospectos-page.tsx` pasa a importar `CRM_PAGE_SIZE` | ✅ |
| F3 | **Ficha única `src/components/crm/ProspectDetailDrawer.tsx`**: la del vendedor era **superior** (línea de tiempo de actividades) y es la que se generalizó. `LeadDetailDrawer.tsx` queda como **adaptador delgado** en la misma ruta y con la misma API exportada; `prospecto-detail.tsx` (528 líneas) **borrado** | ✅ |
| F4 | **Etiquetas para el vendedor** (`actions/etiquetas.ts`: `setProspectTags`, `bulkTagProspects`, con `.eq("seller_id", userId)` y degradación si `00140` no está aplicada). UI: `<Select>` de etiqueta en los filtros, selección múltiple, barra de acciones masivas, chips por fila (clicables para filtrar) y chips de solo lectura en el kanban. El filtro `?tag=` sobrevive al refresco | ✅ |
| F5 | **Bandeja de conversación compartida**: el lector privado sale de `admin/actions.ts` a `src/lib/crm-conversation.ts` (un solo lector, no dos); `ConversationPanel.tsx` se mueve a `components/crm/` y pasa a recibir `actions: ConversationPanelActions` (**lo que no se inyecta no se renderiza**). El admin inyecta `load`+`send`+`suggest`+`quickReplies`+`templates`; el vendedor **solo `load`** | ✅ |
| F6 | **El agente entra al núcleo**: `getDailyQueue`, `generateAgentMessage`, `registerAgentTouch`, `getAgentKpis` y `getDailyBriefing` migrados a `scopeForRole` + `applyCrmScope` + `readCrmProspects`; el `interface ProspectRow` local **borrado**. Para no ensanchar el contrato con columnas que el CRM nunca pinta, `readCrmProspects` acepta `extraColumns` y las cuelga en un `extra` **opcional** | ✅ |
| F7 | **Contratos, guardas y e2e**: `crm-reader.contract.test.ts` mantiene la **lista exacta** de los 13 archivos que leen `crm_prospects` y **falla tanto si aparece uno nuevo como si una entrada deja de tocarla**; `crm-prospects.test.ts` (18 pruebas de comportamiento sobre un cliente PostgREST de mentira, con la escalera de degradación); `crm-core.contract.test.ts` ampliado al filtro `statuses`; `use-server.contract.test.ts` para la regla del `"use server"`; y **`e2e/comercializacion.spec.ts`**, que cierra el hueco de que `/comercializacion` **no tenía ninguna prueba e2e** | ✅ |
| F8 | **Documentación**: playbook nuevo `docs/agents/comercializacion.md`, invariantes del núcleo compartido en `docs/agents/admin.md`, fila y aviso de núcleo compartido en `docs/agents/README.md` y esta sección | ✅ |

**Desviaciones registradas** (lo que el plan dijo y lo que resultó ser cierto):

- **F2**: el lector **no** ordena por urgencia; ordena `created_at DESC`. El
  `compareByUrgency` del admin se aplica en la superficie, no en el lector, porque
  el vendedor y el agente tienen su propio criterio de orden.
- **F5**: la prop del panel es un objeto `actions` en vez de un `loadConversation`
  suelto — con una prop por capacidad el panel se llenaba de opcionales y el
  vendedor tenía que pasar `undefined` explícito en cuatro sitios. Además el panel
  se movió a `components/crm/`: dejarlo en `components/admin/` habría hecho que el
  vendedor importara de la carpeta del admin.
- **F5 — decisión de alcance, no descuido**: el vendedor tiene la bandeja en
  **solo lectura** y **el envío queda diferido**. `sendLeadMessage` y
  `suggestLeadReply` están gateados a admin, así que inyectarlos habría puesto un
  botón que solo sabe responder *"Acceso restringido a administradores"*.
  Habilitar el envío del vendedor es una ronda propia: exige decidir el gate de rol
  del pipeline de WhatsApp y auditar la ventana de 24 h para un rol nuevo.
- **F6**: el alcance es `scopeForRole(role, userId)` y no un alcance de vendedor
  fijo — el admin también usa el módulo del agente. `trigger/route.ts` **no** se
  tocó: su lookup por `referral_code` es el webhook público de registro y no lleva
  alcance por diseño. Y la firma de `applyCrmScope` se **aflojó** de
  `T extends { eq(column: string, value: string): T }` a `applyCrmScope<T>(query:
  T, scope: CrmScope): T` porque la estricta hacía abortar a TypeScript con
  `TS2589: Type instantiation is excessively deep` al envolver el builder de
  PostgREST, que ya es genérico y filtrado.
- **F7**: `loadInboxProspects` se migró al lector único aunque el plan solo lo
  listaba como "migrable más tarde" — era el último lector paralelo del admin. Y
  el plan hablaba de conservar `null` ≠ `0` en `duration_seconds` y
  `days_since_order`, que **no son columnas de `crm_prospects`** (viven en
  `crm_activities` y en un campo calculado del dashboard del vendedor): el
  contrato lo fija sobre `tier`, `city_id` y `lead_id`.

**Hallazgos que el plan no previó y el contrato sí**: además de `admin/actions.ts`
y el módulo del agente, leían `crm_prospects` cinco archivos que el plan no había
inventariado — `comercializacion/actions/{dashboard,pedidos,commissions-admin}.ts`
y `crm-sequences-engine.ts`, más un segundo escaneo dentro de `admin/actions.ts`.
No se migraron (están fuera del alcance acordado), pero quedaron **congelados** en
la allowlist del contrato con su motivo escrito, para que el siguiente que los
toque sepa que existen.

**Trampa de plataforma medida en esta ronda**: un `export const BULK_TAG_LIMIT =
200` dentro de un módulo `"use server"` **invalida el módulo entero**. El build de
Turbopack falló con `The export setProspectTags was not found in module
…/actions.ts` y el `export *` del barrel resolvía a nada — y ni `tsc` ni ESLint lo
detectan. La constante va sin `export`, y `src/lib/use-server.contract.test.ts` lo
fija para que no vuelva. Un barrido del repo confirmó **0 infracciones previas**:
el defecto se introdujo y se cerró en la misma ronda.

**Criterio de aceptación**: `npx playwright test e2e/admin-leads.spec.ts` tenía que
pasar **sin modificar el spec**. Una fusión que obliga a reescribir la prueba de la
superficie que **no** cambia de comportamiento no es una fusión. Resultado:
**34/34 sin tocar el archivo**, más los 30 casos nuevos de
`e2e/comercializacion.spec.ts` (64 pasando entre los dos, en `chromium` y
`mobile-chromium`).

**Verificación de la ronda**: `npx tsc --noEmit` → 0 · `npm run lint` → 0 ·
`npm test` → **4830 passed / 0 failed (288 archivos)** · `npm run build` → 0 ·
`npx playwright test e2e/admin-leads.spec.ts e2e/comercializacion.spec.ts` →
**64 passed**.

### Ronda 11 — Cerrar la mitad escrita del CRM

El backlog declarado tenía tres filas: `C12`, `BL13` y `CI13`. Antes de tocar
nada se midieron las tres, y las tres estaban mal —una por vieja y dos por
incompletas—, así que la ronda no fue ejecutar el backlog: fue **corregir el
inventario y cerrar lo que decía**.

**Medición previa (lo que la prosa no contaba)**

| Fila | Lo que decía | Lo que se midió |
|---|---|---|
| `C12` | 5 escrituras sin UI, "cubiertas por pruebas" | Sin UI ✓ · **sin prueba de comportamiento ✗** · y tres defectos que la fila no mencionaba |
| `BL13` | `heading-slug.test.ts` revienta por timeout en la suite | **Falsa**: 1,33 s de archivo, 11/11 en verde, suite completa 4927/4927 |
| `CI13` | `LeadTimelineSource` huérfano en `actions.ts:1965` | **Cierta**, pero la fila pedía recortar la entrada cuando había que retirarla entera |

**Los tres defectos que la fila `C12` de la ronda 6 escondía**

1. **`cancelSequenceEnrollment` no tenía quién le diera un id.** La acción existía
   y estaba probada, pero `listCrmSequences` solo devolvía el **conteo** de
   inscripciones: no había lector que listara las filas, así que la cancelación
   era inalcanzable aunque tuviera interfaz. Fase G1: `listCrmSequenceEnrollments`.
2. **Una inscripción cancelada era irrecuperable.** `enrollProspectsInSequence`
   armaba su lista de "ya están dentro" con **cualquier** coincidencia de
   `prospect_id`, sin mirar el estado. Como `00140` tiene
   `UNIQUE (sequence_id, prospect_id)`, un `INSERT` chocaba y el `23505` contaba
   como `skipped`: cancelar una inscripción la mataba para siempre, y el admin no
   tenía forma de saberlo. Fase G2: reactivar por `UPDATE`, nunca por `INSERT`.
3. **`is_active` de las respuestas rápidas era un campo muerto.**
   `ConversationPanel.tsx` hacía `quickReplies.slice(0, 8)` sin filtrar, así que
   el interruptor de "activa" del nuevo gestor no habría hecho nada. Fase G6.

**Fases**

| # | Fase | Estado |
|---|---|---|
| G1 | **Módulo puro de inscripciones** (`src/lib/crm-enrollments.ts`, 29 pruebas): vocabulario de estado (`activa`/`pausada`/`completada`/`cancelada`), `isEnrollmentOpen`, `isReenrollable`, `buildEnrollmentList`, `enrollmentSummary`, `enrollmentStepLabel` y `planEnrollmentUpsert`/`describeEnrollmentResult`, que es la regla de G2 en forma testeable. Contrato contra el `CHECK` de `00140` y contra el `.eq("status", "activa")` del motor | ✅ |
| G2 | **Reinscripción**: `enrollProspectsInSequence` parte las coincidencias en `insert` y `reactivate` según el estado, y devuelve `reactivated` en `EnrollResult`. `enrolled` conserva su significado ("filas que van a correr" = alta + reactivación) y `reactivated` es aditivo, para no cambiar el contrato de quien ya lo leía | ✅ |
| G3 | **Lista de inscripciones en `LeadSequences.tsx`**: divulgación perezosa por secuencia, píldoras de estado, paso actual, próxima ejecución en hora local y cancelación con confirmación en dos pasos. La carga vive en el handler, no en un `useEffect` (`react-hooks/set-state-in-effect` es error bajo `--max-warnings 0`) | ✅ |
| G4 | **Reparto masivo en el pipeline** (`LeadDistribution.tsx`): carga por vendedor, estrategia como radios desde `ASSIGNMENT_STRATEGIES`/`ASSIGNMENT_STRATEGY_LABEL` (por defecto `least_loaded`), y resultado por vendedor con su `assignmentReason`. Desviación consciente: la previsualización **es** la llamada que aplica, porque `distributeCrmProspects` no tiene modo seco; la previsualización honesta es la tabla de carga, que sí se lee antes | ✅ |
| G5 | **Gestor de respuestas rápidas** (`LeadQuickReplies.tsx`) como tercera sección de la pestaña Bandeja: alta, edición, borrado en dos pasos, activar/desactivar, contadores contra los topes y el `23505` de título único mostrado **literal** (lo escribe el servidor, no el cliente). Los topes se mudaron de `actions.ts` a `crm-inbox.ts` porque un módulo `"use server"` no puede exportar valores no-asíncronos | ✅ |
| G6 | **`activeQuickReplies`**: el filtro que le faltaba al panel de conversación, con 8 pruebas nuevas | ✅ |
| G7 | **`CI13` + `BL13`**: `LeadTimelineSource` borrado; la entrada de `src/app/admin/actions.ts` retirada **entera** de `knip.ignoreIssues` tras medir `exit 0` sin ella; la justificación de `knip-config.contract.test.ts` eliminada junto con la entrada; y la medición de `BL13` escrita en el comentario del test para no volver a medirla | ✅ |
| G8 | **Guard**: `src/lib/crm-writers.contract.test.ts` (7 pruebas) — cada escritura debe tener consumidor de producción, el consumidor declarado debe ser el real, `src/app/admin/actions.ts` no puede volver a la allowlist de knip, `LeadTimelineSource` no puede reaparecer, y el conjunto de acciones que escriben en `log_admin_action` está congelado (17 nombres). Documentación en esta sección y en `docs/agents/admin.md` | ✅ |

**Decisión de diseño — una acción de servidor sin interfaz es una función sin
terminar.** La ronda 6 dejó las cinco escrituras suprimidas en knip con la
justificación "la mitad del ciclo está construida y en uso". Ese argumento era
cierto para la lectura y falso para la escritura, y la supresión por archivo
apagaba la auditoría en el archivo más grande del panel: por eso nadie notó los
tres defectos de arriba. La regla que queda es la inversa —la escritura y su
consumidor se escriben juntos— y `crm-writers.contract.test.ts` la vuelve
mecánica en vez de una convención que hay que recordar.

**Trampa medida — la prosa del backlog envejece en silencio.** `BL13` declaraba
un timeout de 25 s que hoy es de 1,4 s. No hubo ninguna regresión: hubo una
medición de la ronda 7 que dejó de ser cierta y nadie volvió a comprobarla, y una
fila 🔜 que se lee como trabajo pendiente. El encabezado de este documento
afirmaba que "no queda ninguna fila 🔜" mientras quedaban tres. Cerrar una fila
🔜 exige **medirla otra vez**, no leerla.

**Criterio de aceptación**: `e2e/admin-leads.spec.ts` tenía que pasar **sin
tocar el archivo**. La pestaña Bandeja ganó una sección y el pipeline ganó un
control en la barra masiva; si eso obliga a reescribir la prueba de la
superficie, la superficie cambió de contrato. Resultado: **34/34 sin
modificar**, con el servidor de desarrollo del usuario en el puerto 3100.

**Verificación de la ronda**: `npx tsc --noEmit` → 0 · `npm run lint` → 0 ·
`npm test` → **4927 passed / 0 failed (296 archivos)**, de los cuales **44 son
nuevos** (29 de `crm-enrollments`, 7 de `crm-writers`, 8 de respuestas rápidas) ·
`npm run knip` → **exit 0 con la entrada de `src/app/admin/actions.ts` retirada** ·
`npm run build` → 0 · `npx playwright test e2e/admin-leads.spec.ts` → **34
passed**.

**Fuera de alcance, declarado**: la deuda de **contraste** de `src/app/admin/**`
(B36/B37) sigue sin tocar. La frase que estaba aquí —"los 42 de 61 archivos de
`src/app/admin/**` que arrastran patrones de la familia B36 (contraste y foco)"—
**se midió en la Ronda 13 y era falsa en la mitad que hablaba de foco**: era un
número de contraste extrapolado al foco sin contarlo. Contados con el AST sobre
los 391 `.tsx` del perímetro, los controles que pierden el indicador de foco son
**12 en total, 11 míos**, y no 42 de 61 archivos. El contraste sí es de esa
magnitud; el foco nunca lo fue.

### Ronda 12 — El enum que la guardia no miraba

La ronda anterior cerró el backlog escrito. Esta no ejecutó backlog: encontró un
**defecto vivo en producción** que ninguna prueba del repositorio podía ver, y de
paso reparó el historial de migraciones que lo había estado escondiendo.

**El desfase.** `orders.payment_status` es un enum de Postgres. Las migraciones lo
crearon con 4 valores (`00001`) y `00135` añadió dos (`amount_mismatch`,
`disputed`). El código, en cambio, declaraba **ocho** en `src/lib/order-filters.ts`:
los seis reales más `processing` y `expired`, que **nunca existieron en la base**.
Un enum de Postgres rechaza con `22P02` cualquier comparación contra una etiqueta
inexistente, y ese rechazo no degrada: **aborta la sentencia entera**.

**Cuatro consecuencias medidas**

1. **El cron diario de reconciliación fallaba completo.** `nonTerminalFilter()`
   (`src/lib/reconcile-payments.ts:88`) además pasaba `canceled` a
   `.not("payment_status", "in", …)` — y `canceled` tampoco es del enum: es un
   estado de *PaymentIntent* de Stripe, no de `orders`. Los pares de errores de
   producción `[reconcile-payments: orders fetch error:]` +
   `[[CRON-DAILY] reconcile-payments error:]` iban del 13 al 17 de septiembre:
   durante esos días **ningún pedido se reconcilió**.
2. **`handlePaymentIntentProcessing` fallaba en silencio.** Escribía `'processing'`,
   Postgres lo rechazaba y el error no se leía.
3. **`order-tracking.tsx` tenía una rama inalcanzable**: el `case "processing"` no
   podía dispararse porque ese valor no podía estar en la base.
4. **`/admin/leads` estaba roto**: dos `select` pedían `profiles.email`, columna que
   no existe (`profiles` tiene 13 columnas y el correo vive en `auth.users`), así que
   la lista de vendedores devolvía `42703`.

**Por qué la guardia no lo vio.** `order-filters.test.ts` comparaba
`ORDER_PAYMENT_STATUS_VALUES` con `Object.keys(PAYMENT_STATUS_LABEL)`. Las dos son
constantes de TypeScript del mismo módulo: **se mueven juntas**. La prueba no podía
fallar mientras alguien editara ambas, y no miraba la base en absoluto.

**Fases**

| # | Fase | Estado |
|---|---|---|
| A1 | **Migración `00153`**: `ALTER TYPE payment_status ADD VALUE IF NOT EXISTS` para `processing` y `expired`. Aditiva, idempotente, y **no** añade `canceled` — el webhook ya mapea el `canceled` de Stripe a `failed` (`stripe-webhook-handlers.ts:303-327`), que es la prueba de que ese valor no pertenece al dominio de `orders` | ✅ |
| A2 | **`reconcile-payments.ts`**: `canceled` fuera de `TERMINAL_STATUSES`, con el comentario que lo explica. Las líneas 137/227 (`case "canceled":`) **no** se tocan: ahí el vocabulario sí es el de Stripe | ✅ |
| A3 | **`stripe-webhook-handlers.ts`**: `handlePaymentIntentProcessing` lee y registra `ordersError` y `foodosError`. No relanza a propósito — el cron reintenta los `pending` | ✅ |
| A4 | **`admin/actions.ts`**: los dos `select` de `profiles.email` (`getAdminSellers`, `loadSellerRefs`) leen el correo de `auth.admin.listUsers`, siguiendo el patrón que ya usaban `admin/usuarios/actions.ts:41` y `lib/order-emails.ts:85` | ✅ |
| A5 | **`src/lib/order-enum.contract.test.ts`**: la guardia que faltaba. Reconstruye el enum **desde `supabase/migrations/*.sql`** (el `CREATE TYPE` de `00001` más cada `ALTER TYPE … ADD VALUE`) y lo compara con `ORDER_PAYMENT_STATUS_VALUES`; además exige que `TERMINAL_STATUSES` sea subconjunto del enum | ✅ |
| B1 | **Reparación del ledger**: 12 filas con versión-timestamp renumeradas a `00141`–`00152`, mapeadas por nombre, posición y md5 insensible a espacios | ✅ |
| B2 | **La fila 13** (`20260917180922_admin_role_trigger_hardening`) eliminada: su cuerpo entero era un `REVOKE` que ya estaba byte a byte en `00145:90`, con su efecto vivo en la base | ✅ |
| B3 | **Verificación**: `db push --dry-run` → `upToDate: true`; `migration list --linked` → `local == remote`; enum vivo → **8 valores** | ✅ |
| B4 | **Convención anti-desfase** en `docs/OPS.md`: las migraciones numeradas se aplican por CLI, nunca por `apply_migration` del MCP, que registra una versión-timestamp | ✅ |

**La prueba negativa, dos veces.** Una guardia nueva no vale nada hasta que se la ve
fallar. Se hizo dos veces, restaurando el archivo byte a byte después (md5
verificado):

- Se comentó el `ALTER TYPE … 'expired'` de `00153` → el contrato **falló 2 de 4**,
  con el diff `+["expired"]`.
- Se reinyectó `"canceled"` en `TERMINAL_STATUSES` → el contrato **falló 1 de 4**,
  con el diff `+["canceled"]`: exactamente el defecto de producción.

**El techo declarado de la guardia.** Es un barrido de texto, no un parser de SQL, y
solo ve los archivos que están en el repositorio. Una migración aplicada fuera de
banda —por MCP `apply_migration`— seguiría siendo invisible. Esa limitación está
escrita en el encabezado del propio contrato y es la razón de ser de B4: el contrato
y la convención se necesitan mutuamente.

**Colisión de rondas, declarada.** Mientras esta ronda se planificaba, el agente que
trabaja en CRM escribió **su propia Ronda 11** y cerró las tres filas que esta ronda
pensaba atender (`C12`, `BL13`, `CI13`). No se duplicó el trabajo: `BL13` se
reverificó por medición independiente —`heading-slug.test.ts` en **1,69 s** aislado,
11/11 en verde— y coincide con su conclusión. Esta ronda renumera a **12** y su
Front C queda subsumido.

**Verificación de la ronda**: `npx vitest run` → **4966 passed / 0 failed (299
archivos)** · `npm run lint` → 0 · contrato + `order-filters` → **29/29** ·
`npx supabase db push --dry-run` → `{"upToDate":true}` · `migration list --linked` →
**153 filas, `local == remote` en todas, cero versiones sin cinco dígitos** ·
`pg_enum` de `payment_status` → **8 valores**.

**Nota sobre `tsc` y el build.** La ronda deja `npx tsc --noEmit` y `npm run build`
en rojo por **3 errores, todos en `src/lib/redemption-actions.test.ts`**, un archivo
**sin seguimiento y ajeno** que existe solo en el árbol de trabajo del agente
concurrente (el patrón `mock.calls[0][1]` que `strict` marca como posiblemente
indefinido). Los archivos de esta ronda pasan limpios y el contrato nuevo no
introduce errores de tipo; se declara aquí para que el rojo no se atribuya a esta
ronda.

**Lección.** Una guardia que compara el código consigo mismo no es una guardia: hay
que enfrentarla a la **fuente de verdad externa**. Y un esquema aplicado por una vía
que no deja rastro en el repositorio no lo ve ninguna prueba, por muy bien escrita
que esté.

## 9. Blog

| # | Fase | Estado |
|---|---|---|
| BL1-BL10 | Escape, scroll al paginar, aria-live, `<time>`, RSS, limpiar filtros | ✅ |
| BL11 | **Barra de progreso de lectura** en artículos (`reading-progress.tsx`, `role="progressbar"` con `aria-valuenow` actualizado por rAF) | ✅ |
| BL12 | **Índice del artículo con scroll-spy**: `article-toc.tsx` reutiliza `extractHeadings` (los ids ya coinciden con los anclajes de `rehypeHeadingAnchors`), se muestra a partir de 3 H2 y marca la sección activa con `aria-current="location"`; la barra de progreso respeta `prefers-reduced-motion`. Automatizado en `e2e/smoke.spec.ts` (verifica que cada enlace apunte a un encabezado real y que el activo siga al scroll) | ✅ |

| BL13 | ✅ **Cerrada por medición, no por arreglo** (Ronda 11). La fila se declaró con una medición de la ronda 7 —25 s aislado, >30 s en la suite— que hoy **ya no reproduce**: `src/lib/heading-slug.test.ts:114` mide **1,33 s** de archivo y **1,41 s** aislado, 11/11 en verde, y la suite completa pasa 4927/4927 con este test dentro. El `timeout: 30_000` se queda: el runner de CI tiene 2 núcleos y supera el default de 5 s, así que es defensivo, no una necesidad viva. El comentario del test ahora lleva la medición de esta ronda para que la próxima vez no haya que volver a medirla | ✅ |

## 10. Navegación global

| # | Fase | Estado |
|---|---|---|
| N1-N10 | Escape, role=menu, aria-expanded, footer directo, 404 con salidas | ✅ |
| N11 | **Mega-menú de categorías en desktop**: `/api/categories` sirve las categorías con el conteo de productos visibles (cacheado 1 h / CDN 1 día, sin `cookies()` para no romper el prerender); `category-mega-menu.tsx` carga el catálogo solo al abrir por primera vez, cierra con Escape (devolviendo el foco al disparador), con clic fuera y al cambiar de ruta, y el header se mantiene visible mientras está abierto. El panel se ancla a la fila del header (no al disparador) para no desbordar la ventana a 640px, verificado por e2e | ✅ |

---

## Verificación

El pipeline `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` y
`npm run knip` corre en CI (`.github/workflows/ci.yml`) y en el build de Vercel
al hacer merge. Revisión estática completa del diff sin errores evidentes (los
puntos de riesgo — imports, tipos estrictos, componentes nuevos — fueron
verificados uno a uno).

**Sobre el comando, la concurrencia y el orden** (ronda 9): los cinco pasos son
**scripts de `package.json`**, no binarios sueltos, porque CI y local tienen que
medir lo mismo (invariante 11). `npm run verify` encadena los cuatro rápidos
—`typecheck` → `lint` → `test` → `knip`— y `.githooks/pre-push` los avisa **sin
bloquear el push**; el detalle está en `docs/OPS.md` §12 y en el acta de la ronda
9. El workflow declara `concurrency` con `cancel-in-progress`, porque sin ella
una corrida **cancelada se reporta igual que un fallo**, y ordena `Build`
**antes** de `Knip`: con `Knip` delante, `Build` nunca llegaba a ejecutarse y
aparecía como `-` en todos los listados de pasos.

**El `env` del job `e2e` no incluye `SUPABASE_SERVICE_ROLE_KEY`, y se midió que
eso no es un defecto.** El job pasa **25 de 40** corridas con exactamente ese
`env`, así que la ausencia de la clave no puede romperlo; añadir una clave
*placeholder* sería **peor**, porque `createServiceClient()` lanza en sincrónico
y sus llamadores lo capturan (fail-open), de modo que con una clave falsa
`createClient` tendría éxito y convertiría un `throw` inmediato en llamadas de
red contra un host inexistente dentro de las **64 rutas** que calienta
`e2e/global-setup.ts`. La consecuencia aceptada es que el smoke de CI ejercita
solo el camino de degradación del cliente de servicio; el camino con credenciales
reales no se prueba en CI.

**Sobre el quinto gate:** hasta la **ronda 7** `knip` no se había medido nunca y
llevaba rojo permanente (479 hallazgos), así que en la práctica eran cuatro
gates y un paso decorativo. Se arregló la configuración, se recortó el código
muerto que la configuración tapaba y el paso de CI ahora corre `npm run knip`
(sin `--production`, que era el origen de la mayoría del ruido). Ojo con la
expectativa: `knip` analiza el **working tree**, no `HEAD`, así que su resultado
depende de lo que haya sin commitear — un archivo nuevo de otra sesión lo
devuelve a rojo. Lo que fija `src/lib/knip-config.contract.test.ts` es la
configuración, que es la parte controlable.

**Estado de `test:e2e`:** `e2e/a11y.spec.ts` está **20/20 verde** en
`chromium` y `mobile-chromium`. Ojo con leer eso como "no hay deuda de
contraste": ese gate recorre **solo rutas públicas**, así que las superficies
que exigen sesión (el panel de admin) **no pasan por axe**. La deuda AA de las
rutas públicas quedó cerrada (fila **C14** en § 3), pero `/admin/productos`
acumuló cuatro familias del mismo defecto hasta que se midieron a mano y se
fijaron con `src/lib/admin-productos-contrast.contract.test.ts` (filas
**B36**/**B37** en § 8) — mientras no haya credenciales de admin en CI, ese
contrato es el único gate posible para esa superficie.
Queda un rojo **intermitente** que pasa aislado bajo carga paralela
(`e2e/compartir.spec.ts`) — **cerrado**. El otro,
`e2e/mobile-chrome.spec.ts:28`, resultó ser
un fallo **real de producto** —no un flake— y quedó arreglado en la **ronda 4**
(ver la sección de la ronda 4): el pill de la guía del panel
(`src/components/panel/guide/guide-toggle-button.tsx`, commit `61decf1`,
`fixed` + `z-[85]`) **interceptaba el tap del banner de cookies**, así que el
usuario móvil del panel no podía pulsar "Aceptar todas". También en la ronda 4
se comprobó que el test del **404** (`smoke.spec.ts` y 3 equivalentes) **medía
la carga del server, no el 404**: la cáscara inicial (`<html
id="__next_error__">`) trae el título del root layout y solo se reemplaza al
hidratar el payload de flight —tras hidratar, el título **sí** es el del
segmento, el de `generateMetadata` de `src/app/[slug]/page.tsx`—, así que con el
timeout por defecto de 5 s el test no alcanzaba a verlo en frío. Arreglado con
`timeout: 15000` en los 4, **sin tocar ninguna aserción**: las aserciones eran
correctas. **Se midió que `15000` tampoco alcanza** (el `h1` tarda >30 s
con 5 workers) y resolvió el caso del micrositio afirmando el **cuerpo de la
respuesta** en vez de la hidratación — ver la lección 2 de la ronda 4.
`npx tsc --noEmit`, `npm test` y `npm run build` están en verde para el código
de las rondas 1–4. **Al cerrar la ronda 4 los tres gates quedaron en rojo por
trabajo en vuelo de otra sesión** (la ronda 5, Leads CRM: `src/app/admin/leads/page.tsx`,
`src/app/admin/actions.ts` y `e2e/admin-leads.spec.ts`), no por esta ronda; el
detalle está en el párrafo de cierre de la sección de la ronda 4.

> Nota: `playwright.config.ts` usa `E2E_PORT` (por defecto 3000) y
> `next dev` toma un lock **por directorio**, así que si otro dev server del
> repo ya está corriendo hay que apuntar al puerto vivo:
> `E2E_PORT=<puerto> npm run test:e2e`.

Smoke móvil (375px) — flujo de compra completo:
1. Agregar el mismo producto dos veces → aparece stepper − N + en la card.
2. Abrir el drawer y cerrarlo deslizando hacia abajo.
3. Checkout: rellenar con "Usar mi última dirección" (2ª compra).
4. Modo offline → navegar al catálogo cacheado (SW) y ver el banner offline.
5. /recompensas: pull-to-refresh del saldo y cambio de tabs.
6. Checkout con un producto de la receta: el primer bump es un ingrediente
   afín con nombre real del catálogo ("Limón"), y al agregarlo desaparece y
   lo reemplaza otro.
7. Recompensas: la meta muestra el avance "Esta semana"; la campana anuncia el
   cashback de un pago con tarjeta; en Actividad los filtros Cashback/Canjes
   cambian la lista y el CSV exportado; en la Tienda el servicio más cercano
   lleva la insignia "Más cerca" y su barra de avance; al canjear aparece el
   comprobante con folio y los CTAs "Ver mis créditos" / "Volver a la tienda".
8. Ficha de un producto vendido "por kilo" con hermanos de 500 g / 1 kg: la
   insignia `$/kg` y la sección "Comparar presentaciones" marcan la más barata.
9. Artículo del blog con 3+ H2: el índice abre, resalta la sección visible y
   los anclajes llevan al encabezado correcto. Automatizado: `npx playwright
   test e2e/smoke.spec.ts --grep "índice del artículo"`.
10. Compartir una lista desde WhatsApp eligiendo Resurte.me: `/compartir`
   precarga el texto, muestra el resumen "N productos · M piezas" y separa
   "Encontrados" de "Sin coincidencia". Los renglones sin coincidencia
   enlazan a `/{ciudad}/buscar?q=<sustantivo>` (sin cantidad ni unidad) y el
   CTA queda deshabilitado mientras no haya nada incluido.
   Automatizado: `npx playwright test e2e/compartir.spec.ts --grep "share target"`.

Smoke escritorio (1280px):
1. Header → "Categorías" abre el mega-menú con conteo por categoría; Escape
   cierra y devuelve el foco; el panel no se sale de la ventana a 640px.
   Automatizado: `npx playwright test e2e/keyboard.spec.ts --project=chromium
   --grep "mega-menú"`.
2. `/api/categories` responde 200 sin sesión (página prerenderizada).
3. `/admin/pedidos` con sesión admin: marcar el checkbox del encabezado deja
   la columna en estado indeterminado cuando la selección es parcial, la barra
   masiva muestra el conteo de elegibles/omitidos por acción, cancelar en lote
   pide confirmación, y "Exportar selección" descarga solo las filas marcadas.
   Automatizado (guards sin sesión): `npx playwright test
   e2e/compartir.spec.ts --grep "acciones masivas"`.
4. `/admin` con sesión admin: la alerta "N pedidos sin confirmar" abre
   `/admin/pedidos` ya filtrado por "Pendientes" (y la URL refleja el filtro);
   la alerta de cupón por expirar abre `/admin/marketing?code=<cupón>`, que
   resalta el cupón y permite quitar el foco; la alerta de leads abre
   `/admin/leads`. En "Pedidos recientes", el selector de "Repartidor" de un
   pedido no terminal asigna/desasigna sin salir del dashboard (y el toast
   confirma), mientras que un pedido entregado o cancelado muestra el nombre
   fijo en lugar del selector.
   Automatizado (guards y render sin sesión): `npx playwright test
   e2e/admin-deep-links.spec.ts`.

**Lección — una allowlist con la categoría equivocada no suprime nada, y knip no
admite supresión por símbolo.** La entrada de `knip.ignoreIssues` para
`src/app/admin/actions.ts` decía `["exports"]`, y el hallazgo que mantenía el
gate en rojo era un **tipo**: `LeadTimelineSource` (`actions.ts:1965`), la unión
del origen de un evento del hilo, que quedó huérfana al moverse el hilo a
`src/lib/crm-conversation.ts`, donde la misma unión se escribe en línea (`source`,
L55). Medido en un proyecto mínimo, no recordado: `["exports"]` → **exit 1** con
`Unused exported types`; `["exports", "types"]` → **exit 0**; `["types"]` →
**exit 0**; y `["LeadTimelineSource"]` → `ERROR: Invalid input (location:
ignoreIssues.a.ts.0)`, **exit 2**, porque la supresión es por archivo y
categoría, nunca por nombre. Es el error de la ronda 7 en otra escala: allí
fueron 65 entradas inertes por un `--config` que **reemplazaba** la lista en vez
de fusionarla; aquí, una entrada medio inerte por una categoría que no cubría el
hallazgo. El símbolo se midió muerto en el árbol **y** en `HEAD`, y el archivo lo
tiene otra sesión en vuelo (13 altas / 31 bajas), así que se suprime en vez de
borrarse —una sesión que reescribe ese archivo ahora mismo es la forma más rápida
de perder su trabajo o el mío— y la supresión queda declarada como deuda en la
fila `CI13`.

**Resolución (ronda 11)**: la deuda se cerró retirando la entrada **entera**, no
recortándola a `["exports"]` como pedía la fila. `LeadTimelineSource` se borró y
las cinco escrituras huérfanas ganaron interfaz, así que ninguna de las dos
categorías tapaba ya nada; con la entrada fuera de `package.json`, `npm run knip`
sale **exit 0 sin un solo hallazgo**. La lección se queda porque el mecanismo
—suprimir por archivo y categoría, nunca por símbolo— no cambia; lo que cambia
es que ahora `src/lib/crm-writers.contract.test.ts` impide que la entrada vuelva.

**Backlog declarado de esta sección** (ronda 9):

| # | Fase | Estado |
|---|---|---|
| CI13 | ✅ **Cerrada en la Ronda 11, y mejor de lo que pedía la fila**: la fila pedía recortar la entrada de `["exports", "types"]` a `["exports"]`. Se retiró **entera**, porque la premisa de las dos categorías ya no era cierta. `LeadTimelineSource` se borró (`actions.ts` dejó de tener el símbolo huérfano) y las cinco escrituras huérfanas ganaron interfaz, así que la `exports` tampoco tapaba nada. Medido, no supuesto: con la entrada retirada de `package.json`, `npm run knip` sale **exit 0 sin un solo hallazgo**. `src/lib/knip-config.contract.test.ts` pierde la justificación —el ratchet por igualdad exacta obliga a editar el test, que es para lo que existe— y gana una aserción nueva en `src/lib/crm-writers.contract.test.ts` que impide que `src/app/admin/actions.ts` **vuelva** a la allowlist | ✅ |

### Ronda 13 — La accesibilidad que axe no puede ver

La ronda anterior encontró un defecto que ninguna prueba podía ver. Esta buscó
**una clase entera de defectos que ningún gate miraba**, y el punto de partida fue
leer el gate que ya existía: `e2e/a11y.spec.ts` corre axe sobre **8 rutas
públicas** (`/`, `/comer`, `/busqueda`, `/ciudad`, el storefront, `/recetas`,
`/compartir`, `/rastreo`). `/admin/**` exige sesión de admin y `/panel/**` exige
sesión de comercio, así que **axe nunca los ha mirado**: 391 archivos `.tsx`
viven fuera del alcance de la única prueba de accesibilidad del repositorio. Eso
no es una opinión sobre la calidad del código, es un agujero en la cobertura, y
es exactamente el mismo agujero que B36 ya había explotado una vez.

**El backlog declarado se midió antes de tocarlo, y esta vez salió mal parado.**
La frase heredada —"los 42 de 61 archivos de `src/app/admin/**` que arrastran
patrones de la familia B36 (contraste y foco)"— mezcla dos deudas con tamaños
incomparables. Contado con el AST: **12 elementos en todo el perímetro** pierden
el indicador de foco (11 míos, 1 ajeno), no 42 archivos. La deuda de contraste sí
es sistémica; la de foco era un puñado. La fila se corrigió en § 8 y el número
queda escrito aquí para que no vuelva a extrapolarse.

**Por qué no bastaba un `grep`.** El primer barrido fue de línea y dio resultados
que no resistieron la comprobación: `focus:outline-none` aparecía en **251
instancias / 78 archivos**, pero un `<tag …>` de regex solo casaba **4** de esas
251 (las listas de atributos multilínea rompen el patrón), y el AST encontró
**12** elementos. `img` sin `alt` daba **9** por línea —casaba `<img` dentro de
comentarios y cadenas— y **0** por AST. El detector de diálogos sin nombre daba
**4** falsos positivos; el preciso, **0 de 17**. La lección se queda: para hechos
sobre atributos JSX en este repositorio, **el compilador de TypeScript o nada**.

**Los seis defectos medidos, y qué se hizo con cada uno:**

| Regla | Hallazgo medido | Acción |
|---|---|---|
| R1 foco | **12** controles con `focus:outline-none` y sin indicador sustituto (11 del perímetro) | 9 elementos con anillo propio; 2 que ya tenían anillo en el contenedor, no se tocaron |
| R2 diálogos | 17 diálogos, **0** sin nombre accesible | nada: el hallazgo previo era falso |
| R3 `img` sin `alt` | **0** | nada |
| R4 `tabIndex` positivo | **0** | nada |
| R5 reduced motion | **4** clases usadas fuera del bloque (`animate-pulse`, `animate-ping`, `animate-[fadeUp_0.15s_ease-out]`, `animate-[slideIn_0.25s_ease-out]`) + 3 clases **muertas** | 2 al bloque, 1 regla de captura, 3 borradas |
| R6 `framer-motion` | **28** archivos importan la librería; **1** declara `MotionConfig` | 8 míos envueltos; 20 ajenos declarados |

**El detalle de R1 que casi produce un arreglo peor que el defecto.** Dos de los
11 sitios eran las cajas de búsqueda, cuyo **contenedor** ya pinta
`focus-within:ring-2`: el indicador existe y es visible, solo que lo pinta el
padre. Añadir un anillo al input habría dibujado **dos** anillos en la misma
píldora. En vez de eso se enseñó a R1 que un contenedor que reacciona a
`focus-within` con una señal visible —anillo, borde, contorno— es un indicador
válido; `focus-within:outline-none` **no** cuenta, porque quita en lugar de
pintar. La regla no queda vacua: en los 391 archivos hay **3** ocurrencias de
`focus-within:`, todas envoltorios estrechos. Y la lección es la inversa de la
habitual: **el detector estaba mal, no el código**, y el que estaba mal era el
detector que yo acababa de escribir.

**El detalle de R5: el bloque existía desde antes y no cubría lo que se usaba.**
`globals.css` tiene un `@media (prefers-reduced-motion: reduce)` con una lista
escrita a mano. Nadie había comparado esa lista contra las clases realmente
usadas. Al hacerlo aparecieron cuatro huecos y tres clases que **no existen**:
`animate-in`, `fade-in` y `slide-in-from-bottom-2` en `recipe-slider.tsx:144` son
de `tailwindcss-animate`, que **no está instalado** ni registrado en Tailwind v4
—llevaban ahí sin hacer nada—. Para los valores arbitrarios no hay nombre que
listar, así que el bloque gana un `[class*="animate-["]` de captura; sin él,
`animate-[fadeUp_0.15s_ease-out]` esquiva el bloque entero y sigue animando.

**El detalle de R6: el bloque de CSS no ve JavaScript.** Las 28 importaciones de
`framer-motion` animan desde JS, así que la preferencia del sistema no las
alcanza: necesitan `<MotionConfig reducedMotion="user">`. El patrón ya existía en
el repositorio —una sola vez, en `src/app/recompensas/page.tsx:212`, de otra
sesión— y no estaba escrito en ningún sitio como convención. Se envolvieron los 8
archivos del perímetro; los 20 ajenos quedan declarados como backlog.

**Lo que sostiene la ronda es un contrato que se prueba a sí mismo primero.**
`src/lib/a11y-static.contract.test.ts` (20 pruebas: 13 de detector + 7 de
perímetro) no es axe y no lo pretende: lee el árbol de sintaxis y afirma hechos
sobre atributos. Su estructura responde a un riesgo concreto —un detector roto
que no encuentra nada también devuelve cero hallazgos, es decir **un ✅ mentiroso**
— así que los 13 primeros casos corren sobre fixtures sintéticos y solo después
se mira el perímetro. No es ceremonia: **los autotests encontraron dos defectos
reales en el propio contrato**. El primero, `textos()` no manejaba
`ts.isNumericLiteral`, así que `tabIndex={2}` no producía texto y R4 informaba
"nada" en silencio; el mismo defecto en R1 habría escondido hallazgos reales
mientras el gate decía verde. El segundo, la aserción de perímetro usaba
`includes("panel/foodos")` para excluir un directorio ajeno, y eso es cierto para
`src/components/panel/foodos/*`, que **sí** pertenece al perímetro: el `includes`
fallaba con el recorrido correcto. Se cambió a `startsWith`, que es la misma
lógica que usa la exclusión.

**La jerarquía que decide si esto son defectos de verdad.** `globals.css:598`
declara un `:focus-visible { outline: 2px solid #0E7A0E }` global. Si esa regla
ganara, los 11 hallazgos de R1 no serían nada: el anillo global ya estaría ahí.
Gana la utilidad, no la regla: el selector global pesa `(0,1,0)` y
`focus:outline-none` compila a `.focus\:outline-none:focus`, que pesa `(0,2,0)`.
**La utilidad suprime el anillo global**, y por eso los 11 son incumplimientos
reales de 2.4.7 (AA). La regla global se conserva —es la que hace visible el foco
en todo lo que no la desactiva—; lo que se corrigió fue cada sitio que la anulaba
sin reponer nada.

**Verificación de la ronda**: `npx tsc --noEmit` → 0 en los archivos de la ronda ·
`npx vitest run src/lib/a11y-static.contract.test.ts` → **20/20 verde**, y se
comprobó que **falla** rompiendo un archivo a propósito (nombra el archivo y la
línea) · `npm run knip` → exit 0 · `npm run verify` → ver la nota de la ronda 12
sobre las sesiones en vuelo · `E2E_PORT=3100 npx playwright test e2e/a11y.spec.ts
e2e/keyboard.spec.ts` → verde. El contrato recorre 391 archivos en ~1,1 s.

**Backlog declarado de esta ronda** (nada de esto se tocó, y se declara medido):

| # | Deuda | Estado |
|---|---|---|
| A14 | **`framer-motion` sin `MotionConfig`**: remedido por AST en la Ronda 23. Son **19 archivos** (no 20) y **todos** viven en `src/app/recompensas/_components/**`; las otras dos carpetas que citaba la fila (`src/app/panel/foodos/**`, `src/components/auth/**`) tienen **cero**. Y **no eran deuda**: `src/app/recompensas/page.tsx` monta `MotionConfig reducedMotion="user"` envolviendo todos sus usos, así que los 19 lo heredan. Lo que sí faltaba era que esa cobertura estuviera **verificada**: `AJENOS` excluye `recompensas` del perímetro, de modo que borrar ese `MotionConfig` no habría roto ningún test. Ahora es contrato — `COBERTURA_MOTION` + `R6b`/`R6c` en `src/lib/a11y-static.contract.test.ts`, con 6 pruebas nuevas que incluyen el fixture de un hijo sin cobertura propia ni ancestro declarado | ✅ |
| A15 | **Un sitio con foco con indicador insuficiente, ajeno**: `src/app/recompensas/_components/InvoiceScannerScreen.tsx:466`. La regla de foco lo detectaba y lo excluía por ser archivo ajeno. **Medido en la Ronda 23: sí era real, pero la redacción "sin indicador" era inexacta** — el indicador vivía en el contenedor (`focus-within:border-brand-500/50`), que compuesto sobre blanco da **2.19:1**, por debajo del 3:1 de WCAG 1.4.11, y solo cambiaba **1.59:1** respecto al borde sin foco (`cream-300`). Arreglado con el patrón que el propio repo ya usaba (`src/components/search/search-bar.tsx:82`): borde a opacidad completa + anillo → **5.2:1**. Barrido el repo entero: es el único indicador de foco con alfa baja | ✅ |
| A16 | **Contraste de `/admin/**`**: axe sigue sin mirarlos y B36/B37 cubrían solo `/admin/productos`. **Cerrado para `/admin/**` en la ronda 15** con un contrato estático por AST sobre los 50 archivos restantes (`src/lib/admin-contrast.contract.test.ts`, 12 pruebas). Queda fuera `/panel/**`, que se declara abajo como CX1 | ✅ |
| A17 | **`iconOnlyButton` (113) e `inputNoName` (135)** medidos por AST y **deliberadamente fuera del contrato**: «su tasa de falsos positivos es alta (iconos con `title`, inputs con `htmlFor`+`id` o dentro de un `<label>`)». **Remedido en la Ronda 23 (`a7`), y la fila estaba mal en las dos cifras y en las dos razones.** *Controles*: no son 113, son **25**, y los 25 son **verdaderos positivos** (inspeccionados uno a uno). Los falsos que la fila atribuía a «iconos con `title`» venían de tres formas que un detector que lee el AST —y no la cadena de texto— sí distingue: `aria-label={t("…")}` (una **expresión** no es un nombre ausente), texto pintado por expresión (`{copiado ? "copiado" : "copiar"}`, `{t("common.save")}`) y props por spread. Corregidas las tres, los 25 se arreglaron con `aria-label` (23 literales + 2 `t("common.*")`) y **`R7` los congela en cero** con tolerancia cero, más 7 pruebas de detector. *Campos*: no son 135, son **193**. Aquí la fila acierta en el fondo —el nombre puede venir de un `<label htmlFor>` en otro nodo, de lo que renderice un componente contenedor (`<Field label=…>`) o de un spread, y ninguna de las tres se resuelve sin salir del archivo— pero no sirve para congelar: de los 193, **79** son ruido por esas vías y **114** quedan limpios, y al triar los 79 aparecieron **defectos reales mezclados** (un `<label>` **hermano** sin `htmlFor` no asocia nada y el heurístico lo daba por nombrado). Congelar consagraría el ruido en las dos direcciones: un defecto nuevo disfrazado de ruido no subiría el total, y los 79 se absolverían sin mirarlos. Queda **medido, con las vías de falso positivo enumeradas y sin contrato**, y la razón escrita en la cabecera de `src/lib/a11y-static.contract.test.ts` | 🟡 |

### Ronda 14 — La máquina de estados y quien la pinta

**Esta ronda empieza con una tesis equivocada y termina con una guardia que
faltaba.** El error se declara porque es la parte útil.

**La tesis original, y por qué no servía.** El reconocimiento midió deuda en
`src/lib/panel-sync.ts`: una advertencia de conflicto escrita entera —estado
`"conflict"`, `ConflictKind`, `clearConflicts()` exportada y sin llamadores,
cuatro cadenas traducidas en los dos idiomas y sin un solo consumidor— que `knip`
reportaba como export muerto. La conclusión parecía evidente: el aviso estaba
escrito y nadie lo había enchufado.

**La medición que la desmintió.** Antes de escribir nada, `git status --porcelain`
dejó de estar limpio: **la sesión concurrente había implementado esa tesis minutos
antes**, en 7 archivos y +489/−42 líneas. `git diff` lo prueba sin ambigüedad: en
el HEAD confirmado `PanelSyncState` **no tenía `"conflict"`**, `ConflictKind` no
existía, `clearConflicts()` no existía y las cinco claves `syncConflict*` eran
**adiciones**. El reconocimiento había estado leyendo trabajo en vuelo como si
fuera deuda consolidada. Duplicarlo o reclamarlo habría sido el error; el trabajo
ajeno se dejó intacto.

**La mitad que ya estaba en HEAD.** `src/app/api/panel/entries/route.ts` **no está
en ese diff**: ya implementaba el protocolo completo de concurrencia
(`base_updated_at?` → `{ saved: true, updated_at }` | `409 { conflict: true, value,
updated_at }`), con la nota deliberada de que `base_updated_at` es opcional para
que un despliegue no rompa las pestañas con bundle viejo. Faltaba solo el cliente.

**El residuo real, medido.** De las 14 pruebas nuevas de la sesión concurrente,
**las 14 son del store**: ninguna toca el componente. `grep -rn "SyncStatusBadge"
src` devuelve **dos líneas** —el `import` y el render en `panel-layout-client.tsx`
— y **ninguna prueba**. La máquina de estados y su único consumidor no estaban
atados por nada comprobable a máquina.

**El modo de fallo que eso deja abierto, y que ya ocurrió.** El bug original del
badge no fue un estado mal pintado: fue que `conflict` **caía en la rama del
`error`** y se veía idéntico a un fallo de guardado, con un botón que reenviaba el
valor local y consumaba la sobrescritura silenciosa que el protocolo
`base_updated_at` existe para impedir. Un estado declarado sin rama propia es una
promesa que la UI no cumple, y el store, comparado consigo mismo, no puede verlo.

**Lo entregado: `src/lib/panel-sync-ui.contract.test.ts`** (11 pruebas). Lee las
dos uniones **del AST** y las compara con lo que el badge compara de verdad:

| # | Fase | Estado |
|---|---|---|
| 1 | `PanelSyncState` ↔ ramas del badge: a lo sumo **un** estado puede quedar en la rama final | ✅ |
| 2 | El badge ramifica por `ConflictKind` y no por una constante | ✅ |
| 3 | Ninguna clave `panel.sync*` sin uso fuera del diccionario | ✅ |
| 4 | `es` y `en` declaran el mismo juego de claves `panel.sync*` | ✅ |
| 5 | Detectores probados contra fixtures sintéticas **antes** del perímetro | ✅ |

**Discriminador crítico.** `sync*` no es un namespace, es un prefijo compartido:
`panel.syncSaving` es del badge, pero `foodos.pos.syncMenu`, `syncing`,
`syncResult` y `syncSkipped` (`es.ts:1638-1666`, bajo `foodos: {` en `es.ts:482` →
`pos: {` en `es.ts:1601`) son de otra superficie. Las claves se leen como
**propiedades directas del objeto `panel`** (`es.ts:1756`), no por texto: un `grep`
de `sync` casaría las cuatro de foodos y afirmaría que están en uso cuando el badge
no las toca.

**Por qué AST y no expresiones regulares.** Un `grep` de `"conflict"` encuentra la
palabra en el comentario que explica el estado y en un `type`; lo que decide es si
el *badge* compara contra ese valor. Es la lección de la ronda 13 aplicada al mismo
perímetro: para un hecho sobre lo que el código compara, el compilador o nada.

**Pruebas negativas (tres, cada una restaurada byte-idéntica por md5).** La guardia
no se declara verde: se rompe a propósito y se comprueba que **falla nombrando
archivo y línea**.

| # | Mutación | Resultado |
|---|---|---|
| NP1 | Se elimina la rama `if (status === "conflict")` del badge — **el bug histórico exacto** | **3 fallos**: `panel-sync.ts:24` + badge *«Sin rama propia quedan 2: "conflict", "error"»*; `panel-sync.ts:34` (ConflictKind sin ramificar); `es.ts:1769` (clave huérfana) |
| NP2 | Se colapsan los dos mensajes de conflicto en uno (`kept-local` → `syncConflictMerged`) | **1 fallo**: `es.ts:1771` *«declara `panel.syncConflictKept` y no lo cita nadie en `src`»* |
| NP3 | Se añade a la unión un estado que **aún no existe** (`"queued"`) | **1 fallo**: *«Sin rama propia quedan 2: "queued", "error"»* — caza un estado futuro, no solo el histórico |

**Verificación de la ronda**: `npx vitest run` → **327 archivos / 5589 pruebas
verde** (base 326/5564; +25 = las 11 de esta ronda y las 14 de la sesión
concurrente) · `npx tsc --noEmit` → 0 · `npm run lint` → 0 · `npm run build` →
exit 0 · **`npm run knip` → exit 0**, con lo que `npm run verify` queda verde. La
deuda de la ronda 12 sobre knip se salda aquí: `clearConflicts()` ya tiene
consumidor y el export muerto desapareció.

**Lección.** Una máquina de estados cuyos ramos nunca se contrastan con quien los
pinta es una guardia que miente — y `locale.test.ts` comprueba paridad de
traducción, nunca uso, así que una cadena traducida no es evidencia de que alguien
la renderice.

### Ronda 15 — El contrato que medía la mitad de cada plantilla

**Punto de partida medido.** Árbol en la migración 00167, `npm test` → 326
archivos / 5564 pruebas, 0 en rojo. Antes de tocar nada se midió la deuda
declarada, y la medición desmintió a la declaración en tres de sus cuatro
entradas: A14 estaba obsoleta, A15 seguía siendo real pero **se había movido**
(`InvoiceScannerScreen.tsx:468` → `:474`), y A16 no era deuda latente sino
**fallo vivo** — `admin-productos-contrast.contract.test.ts` (B36) ya medía estas
mismas clases como fallos, con un `PERIMETRO` de 6 archivos escrito a mano.

**F1 — inventario formal por AST.** 130 sitios / 32 archivos en `/admin/**`.
Comprobado antes de escribir una línea: ningún token prohibido aparece dentro de
un comentario, así que la sustitución de tokens es segura (un token dentro de un
comentario se sustituiría y no pintaría nada).

**F2 — el barrido de texto.** 124 reemplazos en 27 archivos.
`text-{red,amber,green,emerald,orange}-{500,600}` → `-700`; rellenos
`bg-{amber-400/500/600,green-500/600,emerald-500}` → `-700`; hex
`bg-[#25D366]` → `bg-[#0F7A3D]` y `hover:bg-[#1fb857]` → `hover:bg-[#0F6B3A]`.
Un verificador de sitios exactos confirmó que solo quedaban los 12 sitios de
exención ajena declarados.

**La paleta se derivó, no se recordó.** Se dejó de escribir la tabla de colores a
mano y se extrajo de `node_modules/tailwindcss/theme.css` (286 tokens en OKLCH) y
de `globals.css` (la paleta propia, en hex). Se validó la conversión OKLab→sRGB:
**10 de 13 conversiones coincidieron exactamente** con los hex publicados de
Tailwind v4, y las auto-pruebas de luminancia WCAG reproducen `#000/#fff` 21.00,
`#767676/#fff` 4.54 y `#949494/#fff` 3.03. Una tabla de contraste escrita a mano
es una tabla que miente en cuanto alguien toca el tema.

**F3 — el riesgo del fondo oscuro, eliminado por eliminación.** 308 sitios con
`text-gray-400`: 228 resolvieron a fondo claro y **0 a fondo oscuro**. Los 80
restantes se cerraron con `layout.tsx:34` (`bg-gray-50`), que es la superficie
real del panel. Los 77 candidatos marcados con ancestro "oscuro" eran **falsos
positivos**: el único negro era el *backdrop* `bg-black/40` de un modal, no una
superficie de texto. Y el único caso genuino de superficie oscura,
`LeadConversations.tsx:129`, resultó **seguro por ramas**: `bg-gray-900` es la
rama activa y el `text-gray-400` vive en la rama inactiva sobre `bg-white`. Con
eso: **cero exenciones necesarias**.

**Se refutaron dos arreglos propios antes de aplicarlos.** `CityPerformance.tsx:47`
(`bg-blue-500` sobre `bg-gray-100`) da **3.42 ≥ 3.0**: pasa. Y `:353`/`:378`/`:393`
son iconos **`aria-hidden` decorativos**, exentos. Un barrido que no sabe
detenerse inventa trabajo. El `bg-gray-300` del toggle tampoco se tocó: tiene
etiqueta adyacente y `aria-label`, así que 1.4.11 no le aplica.

**Fallos gráficos reales:** `bg-green-500` ×3 (2.22:1) y `bg-amber-400` ×1
(1.72:1) → `-700`. Además 10 hover inertes; 7 se corrigieron **de vuelta** a 700
después de encontrar un bug en mi propio script (los dos `if` de hover no eran
mutuamente excluyentes y subían `hover:text-gray-600` dos veces a 800). En el
mismo barrido apareció el único par inerte duplicado del perímetro,
`marketing/page.tsx:579` con `hover:text-red-700 == text-red-700`, preexistente y
en archivo propio → `hover:text-red-800`.

**El contrato.** `src/lib/admin-contrast.contract.test.ts`, 12 pruebas sobre 50
archivos (61 `.tsx` en `/admin` − 6 de B36 − 5 ajenos). La primera corrida dio
**10/11 y la cazó mi propia guardia**: `whatsapp/page.tsx:1816 text-white/70` era
inmedible, y el arreglo fue enseñarle a `rgbDeToken` a devolver `alfa` para
colores neutros.

**Los dos defectos del contrato — el hallazgo importante de la ronda.**

1. **`ts.forEachChild` trata un retorno *truthy* como "detente".**
   `ts.forEachChild(n, (c) => literales(c, out))` devolvía el acumulador, así que
   de cualquier subárbol **solo se recogía el primer literal**: cada
   `` className={`… ${…}`} `` se medía únicamente por su TemplateHead y **todas
   las ramas de un ternario eran invisibles**. Se comprobó la maquinaria
   heredada: `a11y-static.contract.test.ts:182` y
   `panel-sync-ui.contract.test.ts:98/184` usan un `visitar` con cuerpo de bloque
   que devuelve `void` — **sin el defecto**. Era exclusivo de mi contrato.
2. **La unión de ramas inventa pares imposibles.** Las alternativas de un ternario
   son mutuamente excluyentes; aplanarlas produjo pares como `text-white` (una
   rama) × `bg-white` (otra) = **1.00:1**, que no existe en pantalla. El modelo
   correcto es enumerar **alternativas** y medir cada una por separado.

Con el modelo reparado, la lista de fallos cayó de **52 a 4**. Los 48 que
desaparecieron eran artefactos del propio contrato, no defectos del producto.

**Los 4 fallos genuinos** eran todos la misma clase invisible hasta entonces:
`text-gray-500` sobre `bg-gray-100` = **4.39:1**.
`AdminNotificationCenter.tsx:124`, `leads/page.tsx:1251`,
`recompensas/servicios-tab.tsx:266`, `repartidores/page.tsx:164` → `text-gray-600`.
Y se **refutaron con prueba** los dos falsos positivos que el resolver acusaba:
`bitacoras/errores-tab.tsx:109` usa la **misma condición** que el ternario de su
botón padre, así que `text-gray-500` siempre coocurre con `bg-white` (4.84 ✓); y
`comisiones/page.tsx:469` (`text-gray-500 hover:bg-red-50 hover:text-red-700`)
cruza base con base y hover con hover, nunca la base con el fondo del hover.

**Canarias y mutación.** 50 archivos / **377 pares** / 1891 con texto / 2514
literales `className` (antes 50 / 178 / 1992 / 2280). Los umbrales se subieron a
45 / 340 / 1700 / 2260 y se documentó **la dirección de cada delta**, con el
aviso de que un movimiento **a la baja** en cualquiera de ellos delata un
recorrido roto. La batería de mutación M1–M5 (texto prohibido, afordancia muerta,
relleno prohibido, `text-brand-400`, y el `gray-500` sobre `gray-100` que era
invisible) → **5 de 5 detectadas**, archivo restaurado byte-idéntico.

**B36 también era mío y lo rompió mi propio barrido.** El barrido cambió
`text-gray-400` → `text-gray-600` dentro de 4 de los 6 archivos de B36 sin
actualizar las aserciones literales de B36, dejando el árbol compartido con 1
prueba en rojo. Las dos aserciones obsoletas describían la **rama hermana** de un
ternario cuyo *otro* ramo (`text-amber-700`) es lo que el nombre de la prueba
declara, así que se actualizaron a `gray-600` **sin relajar el trinquete**, y se
añadió una prueba nueva que prohíbe `text-gray-400` y `text-brand-400` en los 6
archivos. Un barrido que invalida su propia guardia es un barrido incompleto.

**Lo que sobrevive, medido.** 27 `text-gray-400` quedan en `/admin/**` y **los 27
están en los 5 archivos ajenos** (11 + 3 + 5 + 6 + 2); el perímetro propio queda
en **0**. `/admin/**` conserva 281 `text-gray-500`, gobernados por la prueba de
par y **no** por prohibición: `gray-500` pasa sobre blanco (4.84) y sobre
`gray-50` (4.63), que es la superficie del panel; prohibirlo forzaría a oscurecer
texto secundario legítimo. La decisión #6 del contrato lo deja escrito.

**Deuda declarada, no arreglada** — con el prefijo `CX`, que estaba libre:

| # | Deuda | Estado |
|---|---|---|
| CX1 | **`/panel/**` sin cobertura de contraste**: es el resto de A16. El perímetro del contrato era `/admin/**`; el panel de negocio usaba la misma paleta y no tenía contrato propio. **Cerrado en la Ronda 23 (`a1`)**: existe `src/lib/panel-contrast.contract.test.ts` con perímetro propio sobre `src/app/panel` (recursivo, incluye `foodos/**`) y 13 pruebas. La matemática no se copió —se extrajo a `src/lib/contrast.ts`, de donde ahora beben los dos contratos, porque dos copias de la misma matemática divergen y la segunda es la que nadie revisa—. Medición de partida: **475 pares en 48 archivos, 60 por debajo de 4.5:1**, más dos afordancias muertas que resultaron ser falsos positivos (declarados en `VARIANTES_DE_INHIBICION`); **51 arreglos aplicados**. Tres decisiones quedaron escritas para que no se re-litiguen: `text-emerald-600` (3.65 sobre blanco) **no** se prohíbe en bloque sino que se caza donde falla, los neutros **no** se prohíben aquí (su deuda es del repositorio y la posee `a4`) pero sí se les pone un **trinquete** de una sola dirección, y los rellenos **sí** se prohíben sin exenciones —las barras de gráfico que los usaban se oscurecieron a `-700` en vez de exentarse, para que la prohibición no necesite ninguna excepción copiable mal—. Los rellenos de gráfico, que `medirPares` no ve porque no forman par texto/fondo, se miden aparte contra WCAG 1.4.11 (3:1) sobre las dos superficies reales de `/panel`: la tarjeta y el carril | ✅ |
| CX2 | **A14 obsoleta**: los 28 imports / 9 `MotionConfig` que declaraba ya no coinciden con el árbol. O se remide o se retira la fila. **Remedida en la Ronda 23**: 28 imports reales por AST en total y **19 sin `MotionConfig` propio**, todos en `src/app/recompensas/_components/**` y cubiertos por el `MotionConfig` del padre. Ni eran deuda ni eran 20 archivos en tres carpetas: fila corregida en §8 y la cobertura heredada convertida en contrato (`R6b`/`R6c`) | ✅ |
| CX3 | **A15 sigue real y se movió**: `src/app/recompensas/_components/InvoiceScannerScreen.tsx:474`. Arreglo de una línea, archivo ajeno. **Resuelto en la Ronda 23**: el indicador existía pero medía 2.19:1 (bajo el 3:1 de 1.4.11); ahora usa el patrón de `src/components/search/search-bar.tsx:82` y mide 5.2:1 | ✅ |
| CX4 | **Integridad del propio documento**: el contrato leía las filas como **una lista global** y el documento acota los IDs **por sección**. Medido en la Ronda 17: los «26 IDs duplicados» eran en realidad **46 IDs reutilizados entre secciones a propósito** con **cero colisiones dentro de una misma** —el defecto era el diagnóstico, no el documento—; lo que sí era real son las **17 filas de rango** (`A1-A8`, `BL1-BL10`…) que expanden a **82 filas** invisibles al contrato. Cerrado: el contrato expande rangos, resuelve por sección, exige calificar el ID ambiguo y vigila duplicados intra-sección y solapes rango/fila | ✅ |
| CX5 | **R1 con un hueco**: `ring-0` y `border-transparent` no cuentan como indicador de foco para el contrato estático. **Cerrado en la Ronda 23** (`a2`): `VALOR_SIN_PINTURA` (`src/lib/a11y-static.contract.test.ts:229-230`) ya cubre `ring-0`, `ring-[0px]`, `ring-transparent`, `border-0`, `border-[0px]`, `border-transparent`, `bg-transparent`, `shadow-none`, `outline-none`, `outline-transparent`…, y el detector se reescribió con `ultimaVariante()`/`VARIANTE_PROPIA`/`pintaFoco()`. Medido: **0 apariciones de `focus-within:bg-*`** y una sola de `focus-within:ring-0`, que resultó falso positivo (el `focus:ring-2` sí pinta) | ✅ |
| CX6 | **Fallo latente en la paleta propia**: `warm-400` (`#8F939B`) da **3.08** sobre blanco y **2.95** sobre `gray-50`; `cream-600` (`#999893`) da **2.89** y **2.77**. Ninguno se usa hoy como texto en `/admin`, así que no hay fallo vivo — pero el día que se use, falla. **Remedido y cerrado en la Ronda 23** (`a3`): no era solo latente, había **4 usos vivos** — `text-warm-400` como `placeholder:` sobre `bg-white` en `src/app/recompensas/_components/CheckoutFlowScreen.tsx:350,374,393,412` (**3.08:1**) → sustituidos por `warm-500` (**4.56**). `cream-600` sigue en 0 usos. La matemática vive ahora en `src/lib/contrast.ts` (`SUPERFICIES_CLARAS`, `PALETA_LATENTE`) y la guarda en `src/lib/latent-palette.contract.test.ts`, que barre los **489 archivos `.tsx` de `src/**`** con `contarToken` (6 pruebas; probado revirtiendo un uso: reporta `CheckoutFlowScreen.tsx: 1`) | ✅ |
| CX7 | **El verde de WhatsApp**: `#25D366` da **1.98:1** con texto blanco. Es el color de marca del canal y por eso se declaró en vez de prohibirse; el barrido lo movió a `#0F7A3D` (**5.42**) donde se usa como relleno con texto. **Verificado en la Ronda 23**: quedan **13 apariciones de `25D366`** y ninguna es relleno con texto — `hover:border-[#25D366]` (`contact/page.tsx:168`), `border-[#25D366]/20 bg-[#F2FBF5]` y `hover:border-[#25D366]/40` (`admin/whatsapp/page.tsx:1500,1535,1784`), tintes `bg-[#25D366]/15` (`dashboard-page.tsx:92`, `whatsapp-templates.tsx:85`) y `hover:bg-[#25D366]/10`; el único relleno con texto ya usa `#0F7A3D` (`product-detail-client.tsx:370`). El resto son las listas de prohibición de los dos contratos | ✅ |
| CX8 | **654 `text-gray-400` fuera del perímetro** en todo `src/**` (0 en `/admin` propio, 27 en los 5 archivos ajenos). Fuera de política, sin contrato que lo mida. **Barrido y cerrado en la Ronda 23 (`a4`)**: 191 fallos crudos en todo `src/**`, **162 falsos positivos**, **29 exentos** y **`aArreglar=0`** — los 654 se habían contado sin medir el par, y medido no queda ninguno vivo. El trabajo real estaba en las **110 + 11 ediciones** (111 archivos) que hicieron falta para llegar a ese cero, y sobre todo en las **4 reglas de exención** que particionan los 29 últimos sin solape ni resto (`control-inactivo-por-variante` 3, `control-inactivo-por-rama` 4, `relleno-translucido` 20, `color-de-ejecucion` 2). Contrato: `src/lib/neutral-contrast.contract.test.ts`, 8 pruebas, con presupuestos exactos por regla y tres aserciones complementarias (ningún vivo, suma exacta, ninguna regla muerta) | ✅ |
| CX9 | **775 `text-gray-500` en todo `src/**`** (281 en `/admin`). El contrato los mide por par donde tiene perímetro; fuera de él, nadie. **Cerrado con CX8 en la Ronda 23 (`a4`)**: la medición por par cubre ahora `src/**` entero (`pares=2459`, `sinHex=0`) y el barrido destapó **dos defectos estructurales del propio medidor**, los dos silenciosos. (1) `RE_VARIANTE` no incluía `placeholder:`, de modo que todo `placeholder:text-*` era **invisible**: había **15 pares, 10 en fallo** (cuatro `placeholder:text-gray-400` → `gray-500`, un `gray-300`, cinco hex). (2) La familia `neutral` **no estaba en `PALETA`** porque Tailwind v4 escribe los acromáticos como `oklch(70.8% 0 none)` —hue literal `none`— y el patrón exigía `[\d.]+`: **13 pares descartados en silencio**, uno de ellos **vivo** (`wallet-card-view.tsx:209`, `text-neutral-500` sobre `bg-neutral-100` = **4.35**, corregido a `neutral-600` = 6.16). Un medidor que se salta en silencio lo que no entiende no es un medidor: ahora `numeroOklch()` acepta `none` y `medirPlaceholders()` cierra el hueco de `placeholder:` | ✅ |

**Verificación final medida.** `npx tsc --noEmit` → **0** ·
**`npm test` → 367 archivos / 6408 pruebas, 0 en rojo** · `npm run build` → exit 0
· los cuatro contratos de esta superficie (`admin-contrast` 12, `admin-productos-contrast`
13, `a11y-static` 37 y `docs-pointers` 9) → **71 pruebas, 0 en rojo**.

**Dos gates en rojo, y los dos son de otro.** `npm run knip` dio exit 1 a mitad de
ronda con 3 exports sin consumidor en `src/lib/foodos-moderation.ts:92/148/153`;
al cerrar la ronda **ya da exit 0**: era exactamente el refactor que la otra
sesión tenía en vuelo. `npm run lint` cierra en **exit 1 con 2 warnings, ambos
ajenos y también en vuelo**: `src/app/admin/foodos/restaurantes/page.tsx:85`
(`react-hooks/set-state-in-effect`, sobre un efecto que el propio autor anota en
un comentario **citando la regla por su nombre**, con marca de tiempo 20:21:45,
posterior a mi barrido) y `src/lib/foodos-moderation.contract.test.ts:2`
(`relative` importado sin usar, en un archivo cuyo módulo se escribió a las
20:24:46, **después** de mi última edición). Un barrido que solo sustituye tokens
`className` no puede producir ni un warning de hooks ni un import sin usar. Lint
estaba en 0 al empezar esta ronda y volverá a 0 cuando la otra sesión cierre. La
lección operativa: **un gate rojo no siempre es tuyo** — `git log` no atribuye en
este árbol, así que la atribución se hace por marca de tiempo y por contenido del
warning.

**Lección.** Un contrato de accesibilidad es un instrumento de medida, y esta
ronda descubrió que el mío medía **la mitad de cada plantilla** y fabricaba pares
de color que no existen. Los 48 fallos que desaparecieron al reparar el modelo no
eran producto defectuoso: eran el contrato hablando de sí mismo. La deuda
declarada, en cambio, mintió en tres de cuatro entradas — incluida una que
apuntaba al archivo equivocado por seis líneas. **Antes de arreglar el backlog,
mídelo; y antes de creerte tu propia medición, mutílala.**

### Ronda 16 — El calentamiento que no cabía

**Punto de partida medido.** El job `e2e` acumulaba **28 rojos en 100 corridas**,
y su paso `E2E smoke tests` moría con `##[error]The operation was canceled.` a los
**67,3 s** sin imprimir una sola línea. La serie cronológica de 40 corridas tiene
una frontera nítida: `797238aa` (14:52:56Z) es el **último verde** y `f9d83339`
(15:02:21Z) el **primer rojo**, seguido de **16 rojas consecutivas**. El diff entre
ambos es **un solo commit y tres archivos**: `docs/foodos-paridad-maspedidos.md`,
`e2e/redeem.spec.ts` (−102/+51) y `src/components/layout/footer.tsx`. **El cuarto
archivo que mi primera versión de esta acta señalaba como causa raíz no está en el
diff.**

**La cronología se midió por SHA, y desmintió mi propia narración.** Contar rutas
con `git show <sha>:e2e/global-setup.ts | grep -oE '"/[^"]*"' | sort -u | wc -l`
da: `797238aa` → **21** · `f9d83339` → **21** · `c6e31c48` (15:49:02Z) → **46** ·
`eb48e688` (16:08:30Z) → **64**. **El calentamiento era idéntico en el último verde
y en el primer rojo**: creció *después*, y por tanto **no originó la regresión**,
solo la agravó. Leer el `--stat` entre los extremos y atribuirle causalidad fue un
error de esta acta, corregido aquí: un diff acotado **no prueba causalidad**, hay
que medir el archivo **en cada commit**.

**Y el primer rojo tampoco fue un cancel.** El log del job `e2e` de `f9d83339`
(4m19s, 1 040 líneas) dice: `[e2e] Calentamiento de 21 rutas en 17s` a los 70 s
—el calentamiento **funcionó**—, luego un **test real en rojo**
(`checkout-drawer.spec.ts:166`, "No se pudo abrir el cart drawer"), y **solo al
final**, a los **4m17s**, el `##[error]The runner has received a shutdown signal`.
El primer rojo tiene **dos** causas encadenadas —un test que falla y una muerte
externa— y **ninguna de las dos es el calentamiento**.

**El rojo *prolongado* sí era aritmética, y no cabía.** El calentamiento usaba
`ATTEMPTS = 3` y `ROUTE_TIMEOUT_MS = 60_000` por ruta: **64 × 3 × 60 s = 3,2 h**,
**ocho veces** los **1 500 s** (`timeout-minutes: 25`) que el job concede a *todo*
el pipeline. Ninguna corrida podía terminar. Y la evidencia se perdía porque el
reporter `github` (`playwright.config.ts:16`) **bufferiza**: un job muerto por
cancelación nunca vuelca su propio log. **Cómo agravó, medido**: a 46 rutas el
calentamiento tardó **33 s** (`Calentamiento de 46 rutas en 33s`, 15:50:32Z) y el
shutdown llegó **57 s después**, siendo el **primer `##[error]` del log** —no hubo
ningún test rojo antes—; a **64 rutas el calentamiento no llegó a imprimir**, y la
duración del job colapsó de 4m19s a 2m26s y a **1m32s**. El calentamiento se comía
el presupuesto antes de que los tests empezaran. **El presupuesto del paso, medido
desde su propio `##[group]Run npm run test:e2e`**:

| SHA | rutas | el paso arranca | calentamiento listo | shutdown | presupuesto del paso |
|---|---|---|---|---|---|
| `f9d83339` | 21 | 15:03:10 | 15:03:34 (+24 s) | 15:06:41 | **3m31s** |
| `c6e31c48` | 46 | 15:49:51 | 15:50:32 (+41 s) | 15:51:29 | **1m38s** |
| `eb48e688` | 64 | 16:09:09 | **nunca** | 16:10:03 | **54 s** |

El presupuesto del paso **se encoge a medida que el calentamiento crece**, y a 64
rutas quedó por debajo de lo que el calentamiento necesita (≈50 s en frío, más
reintentos por ruta): **la ausencia de la línea `Calentamiento` deja de ser un
misterio y pasa a ser lo esperado**. Con una advertencia medida: los logs de Actions
**se vacían con retraso** —el propio banner de npm (`> playwright test --grep @ci`)
aparece con la marca del cancel, **54 s después** de que el paso arrancara—, así que
**la ausencia de una línea es evidencia débil**.

**E1 — un presupuesto declarado, no un timeout heredado.** `WARM_BUDGET_MS =
120_000` acota el peor caso del calentamiento a una fracción explícita del job;
`ROUTE_TIMEOUT_MS` bajó de 60 s a **15 s** y `ATTEMPTS` sigue en 3, así que el
peor caso por ruta (45 s) **cabe dentro del presupuesto** en vez de desbordarlo.
El deadline se comprueba **antes de cada intento**, no después.

**La medición desmintió a mi propia hipótesis.** Había supuesto que el
secuencialismo era el problema y que la concurrencia era la cura. Medido sobre el
dev server real, con 66 rutas y dos corridas por nivel: **1 → 2 892 ms · 2 → 2 640
· 4 → 2 450 · 8 → 2 341 · 16 → 2 572**. La concurrencia **apenas aporta** y
**empeora a 16**; los 12,0 s del primer sondeo eran *"primer toque tras reposo"*,
no el precio de ir en serie. **La cura es el deadline, no el paralelismo**, y
`CONCURRENCY = 4` se quedó por ser el mínimo del valle, no por ser el remedio.

**E2 — el presupuesto se degrada, no aborta.** El setup corre por lotes y, al
agotarse el deadline, imprime `Presupuesto de Xs agotado: N rutas sin calentar`
con la lista completa y **deja correr los tests**. No hay `process.exit` ni
`throw`: un calentamiento incompleto es peor que uno lento, pero mucho mejor que
un pipeline que no corre. Se verificó **mutando el presupuesto a 1,5 s**: paró en
24 de 66, nombró las 42 pendientes y los 16 tests corrieron igual. Además imprime
progreso cada 8 rutas — que es también **la sonda de la incógnita**: si el cancel
lo provoca el silencio de stdout, esa línea lo delatará en la próxima corrida.

**Lo que NO está determinado, y no lo finjo.** *Qué* mata el paso a los ~67 s
sigue sin saberse. Descartados con evidencia: **`concurrency`** —el bloque
`cancel-in-progress` **no existía** en ninguna de las cuatro corridas medidas:
entró en `feaddd7f` a las 18:22:49Z, horas *después* de los hechos, y además
**ninguna** de ellas tiene una corrida más nueva solapada (`f9d83339` murió a las
15:06:43Z y la siguiente corrida nace a las 15:16:44Z)—, minutos de Actions (el
repo es **público** ⇒ ilimitados), OOM y disco (el log no tiene ni una marca de
sistema), `timeout-minutes` (el job duró 92–257 s), y un test que falle (en
`c6e31c48` y `eb48e688` el shutdown es el **primer `##[error]`** del log, sin
ningún rojo de test antes). La hipótesis viva es **muerte por inactividad de
stdout**. El diseño **no depende** de resolverlo: un peor caso ocho veces mayor que
el presupuesto está roto por construcción, y el presupuesto ya no puede
desbordarlo. **Nota de coherencia**: tras `feaddd7f` la primera corrida
(`35258472216`, +5 s) quedó **`cancelled`**, no `failure` — la firma de que el
bloque hace lo que dice, y de que las muertes de esta serie son **otra cosa**.

**El deadline no se ajustó al cancel.** La tentación era poner 45 s, la medida del
silencio observado. Se descartó: en frío 64 rutas tardan ≈50 s (17 s × 64/21), así
que **45 s habría truncado el calentamiento en todas las corridas**. Se fijó en
120 s por ser una fracción declarada del presupuesto del job, no por imitar el
síntoma.

**E3 — la cobertura se mide contra el filesystem, no contra una lista.** El
calentamiento enumeraba rutas a mano, así que cualquier ruta nueva nacía fría. La
auditoría construye los **patrones reales** recorriendo `src/app/**/page.tsx` y
`route.ts` (ignorando grupos `(...)`, rutas paralelas `@x` y privadas `_x`, y
añadiendo `manifest`/`robots`/`sitemap`), resuelve cada ruta visitada por los
specs `@ci` a su patrón y compara: **238 patrones**, **55 visitados**, **6 sin
calentar**.

**Dos instrumentos míos mintieron, y el tercero los corrigió.** El primer sondeo
agrupaba por "prefijos de dos segmentos" y **sobre-reportaba** — trataba
`/chihuahua` y `/cdmx` como rutas distintas cuando ambas resuelven al mismo patrón
`/[ciudad]`. El segundo resolvía la ruta eligiendo el patrón **lexicográficamente
menor**, y como `[` ordena antes que `c`, `/comercializacion` se resolvía contra
`/[ciudad]`: **ocultaba un hueco**. El contrato nuevo desempata por **número de
segmentos dinámicos** —prefiere el más estático, que es lo correcto— y fue **él**
quien cazó `/comercializacion`, no mi sonda. Los seis huecos reales:
`/api/admin/products/audit`, `/auth/callback`, `/comercializacion`,
`/comercializacion/agente`, `/comercializacion/pedidos`,
`/comercializacion/prospectos/[id]`. **`/chihuahua/*` no era hueco**, y declararlo
como tal habría sido trabajo inventado. `ROUTES` pasó de 46 a 54; el total con
`API_ROUTES`, de 64 a **72**.

**E4 — el contrato.** `src/lib/e2e-warmup.contract.test.ts`, 8 pruebas: canario de
que el archivo se lee; presupuesto ≤ 1/5 del job (leído de `ci.yml`, no copiado);
`ROUTE_TIMEOUT_MS × ATTEMPTS < WARM_BUDGET_MS`; deadline comprobado antes de cada
intento; que degrade **sin** `process.exit` ni `throw`; que imprima progreso;
rutas absolutas y únicas con lotes acotados; y la cobertura con
`EXCEPTED_PATTERNS` vacío. La batería de mutación dio **20 de 20 detectadas** con
baseline limpio. Su primera corrida fue **7/8**: falló la prueba de cobertura
porque el contrato resolvía `/comercializacion` correctamente y mi sonda no. Un
defecto de construcción propio —una `const` usada dentro del `describe` y
declarada al final del archivo, TDZ— se corrigió antes de dar la prueba por buena.

**E5 — la atribución de los 22 fallos.** La corrida completa dio **395 passed ·
115 skipped · 22 failed (13.7m)** con `Calentamiento de 72 rutas en 7s`. Los 22 se
reparten exactamente así:

| Spec:línea | N | Veredicto medido |
|---|---|---|
| `keyboard.spec.ts:12`, `:34` | 8 | **Flake de contención.** Aislados: 28 passed · 2 skipped · exit 0 |
| `auth.spec.ts:25` | 1 | **Flake de contención.** Misma corrida aislada, exit 0 |
| `mobile.spec.ts:241`, `:250`, `:1061`, `:1111`, `:1269`, `:1574`, `:1947` | 7 | **Flake de contención.** En serie (`--workers=1`): 7 passed |
| `admin-productos.spec.ts:132` | 1 | **Flake de contención.** En serie: passed |
| `checkout-drawer.spec.ts:750` | 1 | **Flake de contención.** En serie: passed |
| `checkout.spec.ts:39` | 1 | **Flake de contención.** En serie: passed |
| `mobile-chrome.spec.ts:28` | 1 | **Determinista y ajeno.** Ver abajo |
| `redeem.spec.ts:35` | 2 | **Determinista — era mío de ronda, y arreglado.** Ver abajo |

**19 de 22 son flakes por contención, y eso no es una excusa: es una medición.**
El proyecto corre `fullyParallel: true` contra **un solo dev server compartido**,
así que un spec que espera 5 s compite con otros diez que compilan rutas en frío.
La prueba es la repetición en serie: los mismos tests que fallan en paralelo pasan
con `--workers=1`. En CI los absorbe `retries: CI ? 2 : 0`; en local **enmascaran
regresiones reales**, que es exactamente lo que estuvo a punto de pasarme con
`redeem.spec.ts`.

**El determinista ajeno — un `ASIDE` que se come el tap.** `mobile-chrome.spec.ts:28`
falla con `locator.tap: Test timeout of 30000ms exceeded` **aunque el locator
resuelve** al botón "Aceptar todas". Sondeado en navegador real con viewport Pixel
7: el botón está en `rect {x:210, y:728, w:165, h:44}`, con `pointerEvents: auto`,
`opacity: 1` y `visibility: visible`, pero `document.elementFromPoint(210,728)`
devuelve un `DIV`, no el botón. La cadena de contención es
`DIV.flex-1.overflow-y-auto` → `ASIDE.fixed.top-0.right-0` → … y ese `ASIDE` es el
panel de la Guía (`src/components/panel/guide/tool-guide.tsx:88`, `z-[90]`). Una
sonda temporal de tres instantes lo cerró: a **t=1 000 ms** el `ASIDE` tiene
`transform: matrix(1,0,0,1,364,0)` — **desplazado fuera de pantalla** — y a
**t=3 000 ms** ya tiene `transform: none`, encima del banner de cookies (`z-[60]`).
El guard del propio spec (`closeGuide.isVisible({ timeout: 3000 })`) **compite con
esa animación**: mira demasiado pronto, no ve la guía, no la cierra, y su `tap()`
nunca aterriza. **No es mío**: esta ronda solo tocó `e2e/global-setup.ts`, que no
puede cambiar el DOM ni la animación de un `ASIDE`.

**El determinista que sí era del perímetro — y la decisión que tomé.**
`redeem.spec.ts:35` ("service_id desconocido → 404") fallaba en **ambos proyectos
y también en serie**, con `Expected: 404, Received: 400`. La cadena causal está
medida: `src/app/api/redeem/route.ts` valida el *brief* (400) **antes** de buscar
en el catálogo (404), y ese orden es **deliberado y está comentado en el código**
—*"rechazarlo después de cobrar dejaría al cliente sin créditos y sin servicio"*—;
el spec envía solo `{ service_id }`, así que se detiene en el 400 y **nunca
alcanza la rama que su nombre promete**. `route.ts` **no** figura en el diff de la
frontera: el bloque de test es nuevo. Comprobado con `curl`: con
`brief: { restaurant_name }` la ruta devuelve **404 "Servicio no encontrado"**.

Había dos arreglos defendibles —completar el payload del spec, o invertir el orden
de la ruta para que un `service_id` desconocido sea 404 aunque el body esté mal— y
**elegí el primero**: el orden actual es una garantía de negocio documentada
(validar antes de debitar), y cambiarlo alteraría el contrato de la API y saltaría
la validación de entrada para un recurso inexistente. El arreglo es de una línea,
**no cambia el comportamiento de la aplicación**, y de paso **aumenta** la
cobertura real: antes ese test no ejercitaba el 404 en absoluto. Añadí además la
**cara complementaria** —`brief` inválido con `service_id` desconocido → 400— para
que el orden quede **fijado por una prueba** y no solo por un comentario: si
alguien lo invierte para "arreglar" el 404, ahora se entera. El archivo pasó de 4
a 5 pruebas y `e2e/redeem.spec.ts` corre **8 de 8 en verde** (ambos proyectos).

**Verificación final medida.** `npm run typecheck` → **0** · `npx eslint
--max-warnings 0` sobre `e2e/global-setup.ts`, `e2e/redeem.spec.ts` y
`src/lib/e2e-warmup.contract.test.ts` → **0** · `npm run knip` → **exit 0** ·
`npm run build` → **exit 0** · **`npm run verify` → exit 0** con **333 archivos /
5 688 pruebas, 0 en rojo** · los cuatro contratos de la superficie →
**28 pruebas, 0 en rojo** · mutación del calentamiento → **20 de 20** ·
`e2e` completo → **395 passed · 115 skipped · 22 failed**, los 22 atribuidos.

**Confirmación final, ya con E5/E6 aplicado.** Corrida completa de cierre
(`--grep @ci`, mismo dev server): **`Calentamiento de 72 rutas en 4s`** ·
**393 passed · 114 skipped · 27 failed (13.5m)**. **Ninguno de los 27 es un fallo
real**: `e2e/redeem.spec.ts` aparece **8 veces** (4 pruebas × 2 proyectos) y **0 en
la lista de fallos** —los dos tests nuevos, `:35` y `:56`, verdes en ambos
proyectos—, así que **los 2 deterministas que abrí están cerrados**. Los 27 son
**26 flakes de contención + el determinista ajeno `mobile-chrome.spec.ts:28`**;
el recuento sube de 22 a 27 porque la contención sobre el dev server compartido
creció en esa ventana, no porque apareciera un defecto nuevo. Reparto:
**6 en `chromium` · 21 en `mobile-chromium`**; por spec: `mobile` 9, `keyboard` 8,
`checkout` 3, `admin-productos` 3, `checkout-drawer` 2, `auth` 1, `mobile-chrome` 1.

**Lección.** El rojo no era un misterio ni un flake, pero tampoco **una** causa:
eran **dos encadenadas** —un test real que falla y un job que muere por fuera—
sobre las que se montó **aritmética que no cabía en el presupuesto**, escondida
detrás de un reporter **cuyas líneas se vuelcan con retraso** (el banner de npm del
paso apareció con la marca del cancel, 54 s después de arrancar). El camino obligó a refutar **cuatro** cosas
propias: que la concurrencia fuera la cura (medido: aporta 2 % y empeora a 16), que
el deadline debiera imitar el síntoma (45 s lo habría truncado siempre), que mi
propia sonda de cobertura fuera fiable (el contrato que escribí la corrigió y cazó
un hueco que ella no veía), y —la más incómoda— que el archivo del diff que yo
señalaba como causa raíz **ni siquiera cambiara** entre el verde y el rojo. **Un
instrumento que no se audita a sí mismo mide la mitad de lo que cree**, y un diff
acotado **no prueba causalidad**: hay que medir el archivo en cada commit. La
atribución de los 22 fallos dejó la misma enseñanza en otra forma: 19 eran ruido
del entorno compartido y **1 era un bug real del perímetro**, indistinguibles hasta
que se corrieron en serie.

**Deuda declarada, no arreglada** — con el prefijo `E`, que estaba libre:

| # | Deuda | Estado |
|---|---|---|
| E7 | **El panel de la Guía tapaba el banner de cookies en `/panel` móvil.** `tool-guide.tsx` (`z-[90]`) terminaba su animación de entrada a los ~3 s y quedaba encima del banner (`z-[60]`): el tap nunca aterrizaba. Era la causa del fallo determinista de `mobile-chrome.spec.ts:28` | ✅ **Ronda 23** — la guía ya no se auto-abre mientras no haya decisión de cookies, así que su drawer (`z-[90]`) y su backdrop (`z-[85]`) no pueden ganarle el primer tap al banner. El orden de capas quedó documentado en `tool-guide.tsx:32-33` |
| E8 | **El guard de `mobile-chrome.spec.ts:28` era una carrera.** `isVisible({ timeout: 3000 })` competía con la autoapertura de la guía | ✅ **Ronda 23** — el guard ahora espera a que el banner esté: `await expect(acceptCookies).toBeVisible({ timeout: 8000 })`, más `toHaveCount(0)` sobre el botón de cerrar la guía y `not.toBeVisible()` tras el tap. Es insensible al tiempo de la animación en vez de competir con él |
| E9 | **Los fallos del `e2e` local eran contención**, no lógica: `fullyParallel: true` contra un único dev server. Medido dos veces — **19 de 22** en la línea base y **26 de 27** en la corrida de cierre. En CI los absorbía `retries: 2`; en local **enmascaraban regresiones reales** | ✅ **Ronda 23** — `WORKERS = 2` (`playwright.config.ts:62`) con la medición escrita al lado (`:46-61`: 1 worker verde en 1.0 min, 2 en 1.8 min, 4 rojo), `E2E_WORKERS` para ajustarlo y `reuseExistingServer: false`. Y la causa de fondo, que no era la contención sino la memoria: local ya no corre `next dev` sino `next build` + `next start` (`E2E_SERVER`, `:84`), porque el `next-server` del e2e crecía ~7 MB/s hasta agotar los 16 GB |
| E10 | **La incógnita del cancel sigue abierta.** *Qué* mata el paso `E2E smoke tests` no está determinado —muere a 92 s, 152 s, 144 s y 257 s en cuatro corridas, siempre con `The runner has received a shutdown signal`, sin marca de sistema y **sin corrida solapada**—; la hipótesis viva es muerte por inactividad de stdout, y la línea de progreso de E2 es la sonda que lo responderá en la próxima corrida de CI | 🔜 |
| E11 | **Qué originó el primer rojo, si el calentamiento no cambió.** `f9d83339` trae tres archivos y `e2e/global-setup.ts` **no** es uno de ellos: quedan `e2e/redeem.spec.ts` (−102/+51) —que ya explica su propio 404— y `src/components/layout/footer.tsx` (+/−14) como candidatos del fallo que **no** es el cancel. Falta aislar `footer.tsx` contra `checkout-drawer.spec.ts:166`, el test que falló en esa corrida | ✅ **Ronda 26** — **`footer.tsx` es inocente y el rojo era una carrera del propio test.** Medido: su diff en `f9d83339` es **solo clases Tailwind** (`pt-8→pt-6`, `gap-*` reducidos, `mb-2→mb-1`, `mt-3→mt-2 sm:mt-3`) más borrar «— Central de Abastos Digital» del copyright —cero JavaScript, cero estado, cero listeners—, y `git diff f9d83339 HEAD -- footer.tsx` sale **vacío**: el archivo está idéntico a como estaba en la corrida roja. El listener del carrito vive en `cart-drawer.tsx` y lo monta `layout.tsx` **como hermano** del footer. El test de `:166` usaba como señal de apertura el texto «🔥 Restaurantes también compran», que solo se pinta con el carrito **no vacío**, y el evento es un **toggle**: despachar a ciegas podía cerrar el drawer que el intento anterior acababa de abrir, así que el bucle oscilaba y su error final («No se pudo abrir el cart drawer») acusaba al drawer tanto si no había abierto como si el carrito aún no había hidratado de `localStorage`. Ahora la señal es el propio `role="dialog"` (el drawer se **desmonta** al cerrar, `if (!isOpen) return null`) y el reintento **solo despacha si se observa cerrado**. Verificación: el spec completo **26/26 en verde** en local, con el mismo `footer.tsx` de la corrida roja |

### Ronda 17 — El modelo plano del contrato de punteros

**La deuda de esta ronda no estaba en el documento: estaba en el contrato que lo
vigila.** `src/lib/docs-pointers.contract.test.ts` —escrito en la ronda 7—
aplanaba todas las filas del plan maestro en **una sola lista global**: un
puntero `ver la fila X` resolvía si el ID aparecía en *cualquier* parte del
documento. `docs/PLAN-MEJORAS.md` no funciona así: **acota los IDs por sección**,
y la reutilización es deliberada. `A14` es una fila de producto en
`## 8. Administración` y una fila de deuda en `### Ronda 13`; `C12` es una fila
de catálogo en `## 3. Catálogo` y una fila de trabajo en `### Ronda 6`. Medido
antes de tocar nada:

| Medición | Valor |
|---|---|
| Filas sueltas que el contrato veía (`ROW_DEF_RE`) | **283** |
| Filas de rango (`A1-A8`, `BL1-BL10`…) | **17** |
| IDs que esos rangos aportan | **82** |
| Universo real de IDs | **365** — el contrato era ciego a **82 (22 %)** |
| Secciones que acotan IDs | **28** |
| IDs reutilizados entre secciones, a propósito | **46** |
| Colisiones **dentro** de una misma sección | **0** |
| Solapes rango ↔ fila suelta dentro de una sección | **0** |

De ese aplanamiento salían tres cegueras distintas. **(1) No veía los rangos:**
ninguna fila cubierta por `A1-A8` existía para el contrato, así que un puntero a
`A5` no se vigilaba —ni podía vigilarse—. **(2) Resolvía en cualquier parte:** el
único puntero que existía entonces, `ver la fila U14`, apuntaba desde
`### Ronda 4` a una fila de `## 6. Cuenta`, y resolvía porque `U14` es
**globalmente único**, no porque el contrato entendiera la relación.
**(3) Habría dado 46 falsos positivos:** cualquier guardia de duplicados escrita
sobre el modelo plano habría denunciado como defecto las 46 reutilizaciones que
son la convención del documento.

**Lo entregado.** `src/lib/docs-pointers.contract.test.ts` reescrito —374 líneas,
**9 pruebas**—: el modelo ahora **expande los rangos** (`RANGE_ROW_RE`),
**asigna cada fila a su acta o a su sección numerada** y **resuelve cada puntero
contra su propia sección**. El vocabulario de punteros pasó de una forma a tres
—desnuda (`ver la fila U14`), con acentos graves (``fila `C14` ``) y en negrita
(`fila **CI13**`)— más un **calificador opcional** (`de la ronda N` /
`de la sección N`). La regla de resolución es la del documento, no la que yo
preferiría: **un puntero sin calificador resuelve si el ID vive en su propia
sección o si es único en todo el documento**; si el ID es ambiguo y vive fuera,
el fallo **nombra la ambigüedad y exige el calificador**. Dos guardias nuevas
—**ninguna sección repite el ID de una fila** y **ningún rango de filas se traga
una fila listada aparte**— y una **prueba-canario de convención** que exige
`≥20` IDs reutilizados, para que el día que alguien "arregle" la reutilización el
contrato lo diga en vez de callarse.

**Los dos punteros que mentían los encontró el contrato nuevo, no la lectura.**
En la primera corrida salieron **dos violaciones vivas**, ambas citando `C12` de
la ronda 6 sin decirlo: `L514` —una fila de tabla dentro de `### Ronda 7`— y
`L736` (`### Ronda 11`). Mi reconocimiento había visto solo la segunda. Se
corrigieron **cinco** sitios en el documento: los dos punteros rotos
(`de la ronda 6`), `ver la fila U14` → `ver la fila U14 de la sección 6`
(resolvía por suerte, no por contrato), la fila `CX4` y el bloque de convenciones
del encabezado, que ahora **declara** que los IDs se acotan por sección.

**La fila `CX4` estaba mal diagnosticada, y el propio contrato lo probó.** `CX4`
hablaba de *"26 IDs duplicados"*. Medido: **46** IDs reutilizados entre secciones
y **0** colisiones dentro de una misma. La reutilización **es la convención**, no
el defecto; el defecto real eran las **17 filas de rango** que dejaban **82 IDs**
fuera del alcance del contrato. `CX4` pasó de 🔜 a ✅ con el diagnóstico
corregido.

**Pruebas negativas.** Tres, cada una restaurada byte a byte (`md5` verificado
idéntico después de cada una):

| Prueba | Mutación | Resultado |
|---|---|---|
| NP1 | Se inyecta una segunda fila con el ID `A14` en `## 8. Administración` — una colisión intra-sección real | **2 fallos**: la guardia nombra `§ "8. Administración" (L122): A14 en L192, L193` |
| NP2 | Se revierte el calificador del puntero de `L736` (`de la ronda 6` fuera) | **1 fallo**: `L741 … cita C12, que es ambiguo (vive en "3. Catálogo…" y "Ronda 6 — Leads CRM…")` |
| NP3 | `RANGE_ROW_RE` pasa a exigir extremos de tres dígitos — **la regresión exacta al modelo plano** | **1 fallo**: `no se expandió ninguna fila de rango … el modelo volvió a ser ciego a 82 filas` |

Dos defectos del propio trabajo aparecieron *durante* las pruebas negativas y se
corrigieron: la prueba-canario duplicaba la aserción de la guardia —enrojecía por
el motivo equivocado— y el orden de sus aserciones hacía que un fallo del parser
se reportara como *"no se encontró ninguna fila de tabla"* teniendo 283 delante.
La aserción específica ahora gana.

**Verificación.** `npx vitest run src/lib/docs-pointers.contract.test.ts` → **9/9**;
`tsc --noEmit` limpio; `npm run lint` 0; `npm run build` correcto; `md5` del
documento y del contrato restaurados idénticos tras cada mutación.

**Lección:** *un contrato que aplana lo que el documento acota no vigila de más:
vigila otra cosa.*

| DP1 | **La tercera forma de fila sigue sin contrato.** Medido: `### Ronda 13` numera seis filas con el ID como **prefijo** de la celda (`R1 foco`, `R2 diálogos`, `R3`…), forma que `ROW_DEF_RE` no reconoce porque exige la barra inmediatamente después de los dígitos; sus **7 citas en prosa** (`L1116`–`L1163`) son, por tanto, impoliceables. Peor: como esa declaración es invisible, el contrato cree que `R1` es único —solo lo ve en el rango `R1-R4` de `## 5. Recompensas`— cuando en realidad ya es ambiguo. Se deja sin tocar porque la sección es territorio ajeno; se declara aquí | 🔜 |

### Ronda 18 — Un CRM que se puede usar de punta a punta

**Punto de partida medido, no declarado.** El CRM tenía 14 módulos en `src/lib/`
con 5 contratos `crm-*.contract.test.ts`, 7 migraciones
(`00049/00052/00131/00139/00140/00142/00180`) y **cero acciones huérfanas**: la
mitad *escrita* del CRM ya existía. Lo que faltaba no estaba en el backlog, y por
eso se midió antes de proponer. Siete hallazgos, todos con archivo y línea:

| # | Hallazgo medido | Consecuencia |
|---|---|---|
| H1 | `LeadDetailDrawer.tsx` no pasaba `slots` ni `activityActions` | El admin **no podía escribir**: leía todo y no podía tocar nada |
| H2 | El dinero ya se calculaba (`getProspectClientOrders`) y el admin no lo veía | El dato existía y no llegaba a la pantalla |
| H3 | `employees`, `instagram`, `weekly_volume_min/max`: **ninguna UI las escribía**, pero `agente/actions.ts` las declaraba en el prompt | El agente IA razonaba sobre **cuatro `null` permanentes** |
| H4 | `createProspect` fijaba `seller_id: userId` | Un prospecto dado de alta por el admin nacía **asignado a quien lo creó** |
| H5 | `perdido` era un estado **sin causa** | No se puede analizar por qué se pierde |
| H6 | `COLUMNS_00059` declaraba 2 de las 6 columnas de esa migración | El escalón estaba incompleto: cuatro columnas fuera del contrato |
| H7 | La última migración real era `00183` | Las nuevas son `00184`/`00185` |

**Tres decisiones de alcance que resolvió el usuario, no yo:** superficie →
**programa completo** (no un parche de lectura); dinero → **las dos cosas**
(previsto *y* real, mostrados como conceptos distintos); tareas → **tabla
`crm_tasks` ligada al prospecto**, con `prospect_id NOT NULL`.

**F1 — el esquema y el contrato compartido.** `00184_crm_deal_closure.sql` añade
`estimated_value NUMERIC(12,2)` (mismo tipo que `weekly_volume_min/max`, para no
introducir una segunda escala de dinero), `loss_reason` y `closed_at`. Los cuatro
`CHECK` son invariantes de **una sola fila**; el importante es
`loss_reason IS NULL OR status = 'perdido'` —un motivo de pérdida sobre un trato
abierto es dato corrupto—. **La dirección contraria no se impone**: exigir motivo
al perder habría rechazado las filas históricas en `perdido`, y un motivo no se
puede inventar. `00185_crm_tasks.sql` crea `crm_tasks` con
`prospect_id NOT NULL ON DELETE CASCADE`, `CHECK ((status = 'completada') = (completed_at IS NOT NULL))`
y **RLS encendida con 0 políticas**, siguiendo la decisión explícita de `00140`:
el acceso pasa por `createServiceClient()` y el alcance se aplica en código
(`CrmScope`), no relajando políticas.

**Promover las cuatro huérfanas a `COLUMNS_00059` fue lo que las hizo escribibles.**
El escalón declaraba solo `tier` y `zone` de las seis columnas de `00059`; sin
promoverlas, ningún formulario podía escribirlas y el agente seguía leyendo `null`.
`crm-prospects.ts` perdió `extraColumns`/`withExtras` en el mismo movimiento: al
promoverlas, el mecanismo se quedó **sin ningún llamador**, y un mecanismo muerto
es exactamente el campo muerto que este repo penaliza. `crm-core.ts` mapea lo nuevo
con coerción: **`NUMERIC` llega de PostgREST como `string`**, así que sin coercionar
el pipeline habría sumado concatenaciones.

**F2 — el dinero, y la regla que lo gobierna.** Se añadió
`estimated_value` (previsto, declarado) y `getAdminProspectClientOrders` (real,
derivado de `crm_prospects.user_id → orders.user_id`), **delegando** en
`getProspectClientOrders` en vez de reimplementar, para no crear un lector nuevo de
`crm_prospects` ni duplicar la atribución. La invariante que se fijó con prueba:
**una columna donde ningún prospecto declara valor da `null`, no `0`**. Sumar ceros
y pintar `$0` diría "esta etapa no vale nada" cuando lo cierto es "nadie ha
declarado valor" — es la regla de `crm-funnel.ts` ("una tasa sin denominador es
`null`") aplicada a una suma. `sumEstimatedValue` devuelve
`{ total: number | null, declared: number }`, pide `limit + 1` para delatar el
corte, y `formatEstimatedTotal` pinta `Sin valor declarado` o `≥ $X` si truncó.

**El "valor por etapa del embudo" del plan se cumple donde el dinero existe.** El
plan lo pedía en `crm-funnel.ts`, que opera sobre `leads` y **no tiene funciones de
dinero**; llevarlo allí habría significado escribir una segunda suma. Se cumple con
la suma por columna del tablero (`sumEstimatedValue`), que es donde el pipeline
vive. Declararlo es más honesto que forzar la simetría.

**F3 — el bug que no estaba en el plan y era el peor de la ronda.**
`crmStatusPatch` existía en `crm-core.ts` y **nunca se usaba en producción**: el
`<select>` de estado escribía `{status}` pelado, así que **reabrir un trato perdido
violaba el `CHECK` de `00184` en la cara del usuario**. Y el mismo defecto estaba en
**dos** rutas: `updateCrmProspectStatus` (admin) y `updateProspect` (formulario del
vendedor). Las dos quedaron cubiertas. El cierre pasó a ser un acto explícito:
`closeCrmProspect(id, outcome, lossReason?)` es la **única** ruta que escribe
`loss_reason`, con selector de motivo **obligatorio al perder** y el botón
deshabilitado mientras falte.

**F4 — las tareas.** `crm-tasks.ts` (puro, sin Supabase: `isTaskOverdue`,
`taskUrgency`, `sortTasks`, `taskAgeDays`, `formatTaskDue`) sigue la disciplina de
`crm-inbox.ts`: **una fecha ausente no es "hoy"** — sin `due_at` la tarea no vence.
Cuatro desviaciones del plan, todas por medición:

1. **Una sola `getTaskAgenda()` en vez de dos.** El plan pedía `getAdminTaskAgenda`
   y `getSellerTaskAgenda`; el alcance ya lo decide `CrmScope`, así que dos
   funciones habrían sido dos sitios donde equivocarse.
2. **`reopenTask` no estaba en el plan** y se añadió: una tarea completada por error
   era irreversible desde la interfaz.
3. **El alcance de una tarea se decide sobre el prospecto, no sobre
   `crm_tasks.seller_id`** — la columna existe pero es secundaria; el dueño del
   trato manda.
4. **`listProspectTasks` no se envolvió** en el registro de acciones auditadas
   porque **no escribe**.

`assignCrmProspect` y `distributeCrmProspects` **mueven las tareas abiertas con el
trato**, y `createTask` asigna el vendedor del prospecto. La agenda usa
**resource embedding** de PostgREST (`crm_prospects!inner(...)`): sin el `!inner`
las filas padre llegan con `crm_prospects: null`. `LOGGED_ADMIN_ACTIONS` pasó de
18 a 22.

**F5 — el admin recupera la escritura.** Los tres formularios compartidos
(`ProspectFormModal`, `ActivityFormModal`, `ImportCsvModal`) se movieron a
`src/components/crm/` y **inyectan** sus acciones: es la regla que gobierna esta
superficie —"si un comando no se inyecta, su sección no se pinta"— y por eso el
vendedor y el admin comparten una copia y no dos. `prospect-form.tsx`,
`activity-form.tsx` e `import-csv-modal.tsx` se borraron.

El **pozo** se arregló en el origen: `ProspectInput` ganó `seller_id` opcional y
`resolveNewProspectSeller` deja el prospecto **sin asignar** cuando quien crea es
admin y no elige vendedor; el camino del vendedor (`seller_id = userId`) no cambió.
El selector de vendedor se ofrece **solo en el alta**, no al editar. Y
`updateCrmProspect` **descarta `status` y `seller_id` en runtime** antes de delegar:
la edición no es una vía de reasignación encubierta. La bitácora guarda **los
nombres de los campos, no los valores**, para no copiar PII al registro de auditoría.

`validateProspectSegmentation` rechaza `min > max` **aunque la base no lo haga**,
porque el agente razona sobre ese intervalo y un intervalo imposible le da un dato
falso. `getAdminCities` existe porque `/admin/leads` es un componente cliente y no
puede importar `@/lib/data`. El `refreshKey` del drawer existe porque `onChanged`
**no** recarga la ficha. `deleteCrmActivity` lee **antes** de borrar, y la prueba
fija ese orden con un `Trace` (`["read","delete"]`): invertirlo enrojece.
`LOGGED_ADMIN_ACTIONS` 22 → 27.

**F6 — el agente deja de razonar sobre `null`.** Con las cuatro columnas dentro del
contrato y del formulario, el agente por fin recibe `employees`, `instagram` y el
intervalo de volumen. Se eliminó `EXTRA_PROSPECT_COLUMNS` y su uso. El briefing
suma **el pipeline abierto**, no el alcance entero, y de ahí el nombre propio
`readOpenCrmPipelineValue` — con `openOnly` filtrando
`.not("status","in","(cliente_activo,perdido)")`, espejo del índice parcial de
`00184` y de `CRM_CLOSED_STATUSES`. El panel del admin conserva el alcance entero
en `crmPipelineValue`: **los dos totales no son intercambiables y por eso tienen
nombre distinto**. El `null` viaja hasta la plantilla y hasta el prompt, con una
**regla escrita** para que la IA no diga `$0` cuando no hay valor declarado.

**La prueba del prompt no es vacua, y se demostró mutilándola.** Sustituir el
argumento de `:214` de `agente/actions.ts` por `null` hizo **fallar** el caso que
exige que `Empleados: 12`, `@tacosana`, `3,000` y `6,000` aparezcan en el prompt;
restaurado el archivo, `diff` → **idéntico** y 6/6 otra vez.

**F7 — verificación y este acta.** Dos specs e2e extendidos
(`admin-leads.spec.ts` 148 → **285** líneas, `comercializacion.spec.ts` 116 → **147**),
con 9 casos nuevos. **La primera corrida dio 3 rojos que no eran del producto**:
`Test timeout of 30000ms exceeded while running "beforeEach"`, porque sin
`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` el helper navegaba a `/auth/login`, no
encontraba los campos y **consumía los 30 s del test antes de que `test.skip`
pudiera decidir**. El arreglo es de dos capas: el `beforeEach` **salta al instante**
si faltan las credenciales, y `signInAsAdmin` devuelve `false` sin navegar en ese
caso, con el `waitForURL` bajado de 20 s a 12 s para que un login que no cuaja deje
sitio al `skip` en vez de comerse el presupuesto. **Medido después: 38 passed,
3 skipped, 0 failed.** El fallo era del arnés, no de la interfaz: es la misma
lección de la Ronda 15 — **un gate rojo no siempre es del producto**.

**Verificación final medida.** `npx tsc --noEmit` → **1 error, ajeno y en vuelo**
(`src/app/r/[slug]/pedido/[id]/order-tracking.tsx:173`, `TS2345`, marca de tiempo
**30 s anterior** a mi medición) · `npm test` → **345 archivos / 5980 pruebas, 1 en
rojo, ajena** (`db-function-grants.contract.test.ts:170` por
`00186_foodos_coupon_release.sql`) · la superficie CRM entera → **21 archivos /
620 pruebas, 0 en rojo** · e2e → **41 casos, 0 en rojo** · `npm run lint` → exit 1
con **7 warnings, todos ajenos** en `order-tracking.tsx` · `npm run build` → exit 1
por el mismo `TS2345` ajeno · `npm run knip` → exit 1 por **1 export ajeno**
(`canFoodosCustomerCancel` en `src/lib/foodos-order-status.ts:125`).

**Cuatro gates en rojo y los cuatro son de la misma sesión concurrente.** Los
archivos implicados tienen marcas de tiempo **posteriores a mi último cambio**:
`00186_foodos_coupon_release.sql` (21:24:31), `foodos-order-status.ts` (21:24:48),
y `order-tracking.tsx` **21:35:12 — escrita mientras yo corría `lint`**, con mi
última edición a las 21:34:20. Nada de un barrido de CRM puede producir un
`TS2345` de `FoodosPaymentStatus` ni un import sin usar en una ruta `/r/[slug]`.
Se declaran; no se tocan, porque escribir en un archivo que su autor tiene abierto
es exactamente cómo se pierde trabajo ajeno. **`git log` no atribuye en este árbol**
(auto-commit del workspace): la atribución se hace por marca de tiempo y por
contenido del mensaje de error.

**Deuda declarada, no arreglada** — con el prefijo `CRM`, que estaba libre:

| # | Deuda | Estado |
|---|---|---|
| CRM1 | **`orders.seller_id` existía y ninguna ruta la escribía.** El aviso de `00155:39` se confirmó: usarla para atribuir comisión daría **cero siempre**. El camino del dinero es `crm_prospects.user_id → orders.user_id` y así se dejó. **Cerrada en la ronda 23** eliminando la columna (`00189`): su único efecto real era la segunda FK `orders → profiles`, causa del `PGRST201` de los embeds | ✅ |
| CRM2 | **`getProspectClientOrders` limitaba a 50 pedidos.** Las ventas y la comisión salían de las **mismas 50 filas** de la lista, así que a partir del pedido 51 el ingreso quedaba **subestimado en silencio** —con la etiqueta prometiendo «histórico»—. El total se separó de la lista: `scanPaidRevenue` (`src/lib/comercializacion/actions/vinculos.ts`) escanea el historial con la ventana alta y la **fila de más** de `readCrmPipelineValue` (`CRM_REVENUE_SCAN_LIMIT`), y si el historial no cupiera la cifra se pinta como **mínimo** (`≥ $X`, `formatMeasuredAmount`), nunca como total | ✅ |
| CRM3 | **No se puede verificar RLS real en producción**, solo lo que declaran las migraciones. `crm_tasks` tiene RLS encendida y **0 políticas**: el acceso depende de que todo pase por `createServiceClient()`. **Cerrada en la ronda 23**: el perímetro resultó ser de **24 tablas**, no una, y su modelo de acceso quedó declarado con el archivo que lo demuestra (`rls-declared.contract.test.ts`). La parte que sigue abierta es la de arriba —**RLS real no se puede verificar desde el repo**, solo declararse— y por eso el contrato verifica la declaración, no la base | 🟡 |
| CRM4 | **La atribución de uso de columnas salió de grep de identificadores.** Una referencia dinámica (nombre construido en runtime) podría escapar al inventario de H3. **Cerrada en la ronda 26 con contrato, no con promesa**: los nombres de columna viven en **un solo vocabulario** (`CRM_PROSPECT_COLUMN_SETS`, la escalera de degradación) y toda lista que llega a un `.select()` de `crm_prospects` sale de ahí. Quedan **exactamente dos** sitios que construyen la lista a mano —`readLeadRow` y `buildQuery`— y `crm-column-refs.contract.test.ts` (10) los declara, cuenta y resuelve: un tercero, o uno alimentado por algo que no sea el vocabulario, pone el contrato en rojo | ✅ |
| CRM5 | **`estimated_value` es un valor declarado, no un histórico.** El pipeline es una **foto**, no una tendencia: no se puede responder "¿cuánto valía el pipeline el mes pasado?". **Cerrada en la ronda 23 declarando la limitación, no construyendo la serie** (una tabla de snapshots sin lector sería superficie muerta); `crm-forecast.contract.test.ts` (15) la hace falsable | ✅ |
| CRM6 | **El motivo de pérdida no se puede exigir retroactivamente.** Las filas históricas en `perdido` no lo tienen y el `CHECK` lo permite a propósito; cualquier métrica por motivo tendrá denominador parcial. **Cerrada en la ronda 26 declarando la cobertura**: el hueco es **histórico** (anterior a `00184`) y **no crece**, porque `crmClosePatch` lanza si falta el motivo y `actions.ts:1918` es su único llamador. `crm-loss-reason.contract.test.ts` (14) vigila el vocabulario, la asimetría del `CHECK` y que la métrica **diga su denominador** | ✅ |

**Lección.** El CRM no estaba a medio construir: estaba **construido y sin boca ni
manos**. Tres de los siete hallazgos (H3, H4, H6) eran *escrituras que nadie podía
hacer* o *datos que nadie podía llenar*, y el peor de la ronda —el `CHECK` que el
usuario podía violar desde un `<select>`— **no estaba en el backlog**: apareció al
leer qué escribía realmente cada ruta. Y el defecto estaba duplicado en dos rutas
porque la misma decisión se había tomado dos veces en dos archivos.
**Un dato que nadie puede llenar no es un dato: es un `null` que el agente se cree.**

### Ronda 19 — Auditoría de estatus de las 54 superficies

**Origen.** El dueño del producto pidió saber **dónde está fuerte y dónde flaquea**
el sitio, porque la complejidad —tres productos en un dominio— ya no se puede
sostener en la cabeza. Un pedido así se puede responder de dos maneras: repitiendo
esta documentación, o midiendo el código. Se hizo lo segundo.

**Método.** Tres auditorías independientes por subsistema —panel del restaurante,
FoodOS y panel admin—, cada una **obligada a citar archivo y línea y a buscar
contraejemplos en la documentación**, no a confirmarla. Este documento es
detallado y se auto-vigila con contratos, así que una auditoría que lo repita no
aporta nada: el valor está exactamente en las contradicciones.

**Punto de partida medido.** `npm run verify` en verde: typecheck, lint, **349
archivos de test / 6,080 tests**, `knip` exit 0. 177 migraciones en sincronía
verificada y 21 specs e2e. **Ninguna de las 54 superficies está rota, y ninguna es
humo.** El inventario cerrado: 13 herramientas de panel, 21 superficies de FoodOS,
20 secciones de admin. El resultado sobre las **54 existentes** fue 23 fuertes, 29
sólidas, 1 parcial y 1 stub; más **1 superficie inexistente** (facturación CFDI).

**Advertencia sobre `git log`.** Los commits de este árbol son autocommits
`"Save uncommitted changes"` de la aplicación. **No atribuyen trabajo ni expresan
intención**, así que el historial se descartó como fuente: la atribución se hace
por marca de tiempo y por contenido.

**Lo que la auditoría confirmó como fuerte** —para que la ronda no se lea solo
como una lista de defectos—: el ciclo operativo del restaurante (mostrador →
mesas → cocina → caja → tablero) está completo y con las reglas del dominio
cerradas y anotadas (una sola autoridad de día local, `payment_status === "paid"`
como única regla de ingreso, folio que nunca se reutiliza); los tres pilares del
negocio interno (`productos`, `leads`/CRM y `whatsapp` + automations) son lo más
maduro del sitio; y la disciplina de ingeniería es poco común —incluidos
contratos de test que vigilan **esta misma documentación**.

**Deuda declarada, no arreglada** — con el prefijo `AU`, que estaba libre:

| # | Deuda | Estado |
|---|---|---|
| AU1 | **El dinero del restaurante no llega al restaurante.** El cobro con tarjeta entra a la cuenta de la plataforma y el enrutado vía Stripe Connect existe en código pero **está apagado en producción**: `STRIPE_CONNECT_ENABLED` ausente en `src/lib/foodos-payouts.ts:9`, `src/lib/foodos/actions/payouts-admin.ts:6` y `src/app/api/admin/foodos/payouts/route.ts:14`. Hoy la dispersión es manual desde `/admin/foodos/dispersiones`. Es la deuda con más riesgo (fiscal y de confianza) y la que bloquea escalar FoodOS | 🔜 |
| AU2 | **`pos` es un stub deliberado y no hay ESC/POS.** Los 6 proveedores de POS están declarados con `implemented:false` (`src/lib/pos/registry.ts`) y el webhook entrante responde **503**; la impresión es HTML imprimible con `window.print()` (`src/lib/foodos-printing/types.ts:9-13`). No es un fallo silencioso —está documentado— pero la superficie se ofrece en Diamante y un POS de mostrador sin impresora térmica no sobrevive en un restaurante real. El camino real hoy es la importación CSV | 🔜 |
| AU3 | **La escalera de niveles concentraba el valor en la cima.** De 10 capacidades premium, **6 exigen Diamante** (`src/lib/foodos-entitlements.ts`): wallet, app de marca, sitio IA, catering, mesero IA e integraciones POS. La ronda 20 bajó **punto de venta nativo y comandero a Oro** —son las dos capacidades que hacen *cobrar y operar*, no las de escaparate, y cobrar es el mínimo para que el resto sirva—, así que hoy abren en Plata `marketing_ia`; en Oro, `flotilla`, `pos_mostrador` y `comandero`; y en Diamante las 6 restantes. El valor caro de operar ya no espera a la cima. **Sigue abierto** que la escalera se apoye en una recompra previa a la propia recompra | 🔜 |
| AU4 | **El acceso admin era todo-o-nada.** `MANAGED_ROLES = ["admin","vendedor","cliente"]` (`src/lib/admin-roles.ts:6`) y el `CHECK` de la base solo admitía esos tres (`00067_master_admin_roles.sql:17`, reconfirmado en `00071:90`). **Cerrado en la Ronda 20** con un **eje nuevo, no un reemplazo**: `profiles.admin_permissions TEXT[]` (`00188_admin_permissions.sql`), `NULL` = sin restringir, y seis dominios (catálogo, pedidos, dinero de la red, clientes, marketing, sistema) que recortan **dentro** de la puerta. Los tres candados sobre `role` siguen intactos —`is_admin()`, las tres policies RLS y `protect_profile_role()` no se tocaron— porque un segundo eje no tiene por qué mover el primero. Administrable desde `/admin/usuarios`, con bitácora propia | ✅ |
| AU5 | **El panel del restaurante no tenía tests de superficie.** Cero archivos bajo `src/components/panel/**` (excluyendo foodos) y el e2e solo navegaba 3 rutas (`e2e/mobile.spec.ts:1867,1990,2039`). **Cerrado en la Ronda 21** con siete archivos nuevos que cubren la lógica pura de los seis flujos que mueven dinero del panel —ventas, comanda, inventario, planificador, mermas y costeo— más un **contrato estático** del invariante "un solo productor de totales", que `docs/agents/panel.md` declaraba y **ningún test vigilaba**. Los tests destaparon **dos defectos de dinero** que no hacían fallar nada: el colchón de seguridad de la proyección fallaba en su límite exacto por coma flotante, y dos categorías de insumo caían al grupo de merma barato en silencio (2 % en vez de 3 % y 12 %). Sigue abierto lo que este entorno no puede probar: los componentes no se montan —no hay jsdom ni Testing Library— y el e2e autenticado es `AU10` | ✅ |
| AU6 | **Facturación CFDI no existe.** Grep de `cfdi/timbrado/facturapi/sat/rfc` en `src/` sin resultados. Lo que el panel llama "facturas" son **tickets subidos por usuarios para ganar créditos** (`invoice_submissions`): aprobarlos acredita monedero vía `approve_invoice_submission` (00144), no timbra nada. Bloquea al restaurantero que necesita factura y depende de contratar un PAC. Nota: `docs/REPORTE-FUNCIONES-Y-MEJORAS.md` lo listaba como función existente y **quedó corregido** por esta ronda | 🔜 |
| AU7 | **Huecos y duplicidad en la bitácora admin.** El contrato `src/lib/admin-audit.contract.test.ts` ya exigía que toda ruta mutante audite o esté exenta con motivo escrito; la excepción de `bump-affinity` era **más estrecha que la ruta** (justificaba `weight` pero no el alta ni la baja del par, que sí son merchandising) y se corrigió con `affinity_pair_create` / `_update` / `_delete`. La **duplicidad** también quedó cerrada: se retiró `src/lib/audit.ts` —el módulo legado de 4 acciones que espejaba en `notifications`— y `/api/admin/audit-log` ahora lee `admin_audit_log`, el mismo libro que la pestaña de `/admin/bitacoras`. Retirarlo destapó **dos huecos que solo el legado cubría**: la **asignación de repartidor** no tenía equivalente en el catálogo nuevo (`order_driver_assigned` / `order_driver_unassigned`, añadidas con test) y `product_images_update` / `products_seed` quedaron sin escritor al retirar los endpoints de `AU8` (eliminadas de `AUDIT_ACTIONS`). Un registro que no registra todo no es un registro | ✅ |
| AU8 | **Dos endpoints admin no usaban `requireAdmin()`.** `seed-products` y `update-images` se protegían con token de entorno (`SEED_API_TOKEN` / `ADMIN_API_SECRET`, fail-closed) y llevaban datos hardcodeados de un solo uso. Violaban el invariante #1 de `docs/agents/admin.md:11-12`. Eran scripts, no features: **retirados** en la Ronda 20 | ✅ |
| AU9 | **El CRM tiene el ciclo de retroalimentación roto.** Son las seis filas `CRM1`–`CRM6` que declaró la ronda 18. Tres quedaron cerradas. **`CRM2`** —las ventas y la comisión del cliente vinculado se calculaban sobre las 50 filas de la lista, no sobre el historial— se separó la medición de la presentación (`scanPaidRevenue` + `formatMeasuredAmount`, con `≥` cuando el historial no cabe en la ventana). **`CRM1`** (`orders.seller_id` sin escritor) se cerró eliminando la columna, porque el silencio no era un dato. **`CRM5`** (`estimated_value` es foto, no histórico) se cerró **declarando la limitación y no construyendo la serie**: el CRM puede decir cuánto vale el pipeline ahora y no puede decir cuánto valía el mes pasado, y esa segunda pregunta no se deriva de la primera. **`CRM3`** quedó a medias por construcción: el perímetro resultó ser de **24 tablas** con RLS y cero políticas, no una, y su modelo de acceso se declaró con evidencia (`rls-declared.contract.test.ts`); lo que sigue abierto es que **RLS real no se puede verificar desde el repo**, solo declararse. Siguen abiertas `CRM4` (atribución de uso por grep) y `CRM6` (motivo de pérdida no retroactivo). La ronda 18 le dio boca y manos; la 23 le dio memoria de lo que sabe y de lo que no | 🟡 |
| AU10 | **La cobertura e2e es desigual y no autentica.** Sin e2e para ~10 secciones admin (bitácoras-UI, comisiones, conversion, proveedores, recompensas, seo-ia, sistema, whatsapp, dispersiones, repartidores), y el propio `docs/agents/admin.md:1247` admite que `e2e/a11y.spec.ts` **no** sirve para `/admin/*`. El repo no tiene seed ni credenciales, así que el e2e verifica guards y render, no flujos. Se suma al backlog de flakiness, del que `E7`–`E9` **cerraron en la Ronda 23** y solo quedan abiertos `E10` y `E11`. La mitad autenticada ya tiene camino y no depende de terceros: `docs/CREDENCIALES.md` §4 lo resuelve con un usuario admin de prueba en el propio Supabase | 🔜 |
| AU11 | **El costo de compra era público, y con él la comisión, el estado de Stripe y el costo del menú.** La causa es una sola y no es de código: `products`, `foodos_restaurants` y `foodos_menu_items` tenían `GRANT SELECT` **a nivel de tabla** para `anon`/`authenticated` (del `ALTER DEFAULT PRIVILEGES` de Supabase), y sus políticas RLS de lectura filtran **filas** (`USING (true)`, `status = 'active'`), no columnas. Con la llave anónima que viaja en el navegador bastaba `GET /rest/v1/products?select=cost` —o `foodos_restaurants?select=platform_fee_percent`, o `foodos_menu_items?select=cost`— para leer, **sin cuenta y sin sesión**: el costo de compra de los 475 productos, la comisión que le cobramos a cada restaurante activo, su cuenta Express de Stripe y el costo de cada platillo de su menú. Los cuatro se comprobaron con sonda anónima (`200` con fila) antes de tocar nada. **Cerrado** con `00192` (products) y `00193` (FoodOS): `REVOKE SELECT` de tabla + `GRANT SELECT (…)` **columna por columna**, con la lista blanca en `src/lib/product-columns.ts` / `src/lib/foodos-columns.ts` y un contrato por tabla (`product-columns.contract.test.ts`, `foodos-columns.contract.test.ts`) que compara SQL y código, barre `src/` buscando lectores sin `service_role` que pidan una columna privada, y **se probó por mutación**. El código público dejó de pedir `select("*")` (PostgREST lo expande a toda la caché y la consulta entera falla con `42501`); las lecturas que sí necesitan lo privado pasan a `service_role` **después** de autorizar y acotadas al recurso autorizado. Dos hallazgos que salieron de aquí y están escritos donde toca: (1) `foodos_restaurants.user_id` **tiene que seguir siendo pública** —67 políticas RLS de dueño la leen para poder evaluarse, y revocarla deja la tienda sin menú con `42501`; acotar esas políticas a `{authenticated}` es neutro pero toca 54 tablas incluidas `orders`/`profiles`/`wallets`, y no compensa esconder un UUID que no es credencial—; y (2) `transfer_clabe`/`transfer_bank`/`transfer_beneficiary` **son públicas a propósito**, porque el storefront las pinta para que el comensal pague por SPEI. El primer intento de `00193` falló justo por (1) y la guarda de la propia migración lo cazó | ✅ |

**Lo que esta ronda desmintió.** El inventario de `docs/REPORTE-FUNCIONES-Y-MEJORAS.md`
declaraba "Facturas (CFDI)" como función del admin y "12 herramientas" en el panel.
Lo primero es falso —son créditos por ticket subido— y lo segundo estaba
desactualizado: son 13. Ambas afirmaciones quedaron corregidas, porque **una
auditoría que deja la documentación mintiendo no sirvió de nada**.

**Lección:** *la documentación de este repo es tan buena que casi se puede auditar
leyéndola. Ese es justo el motivo por el que no se puede: los tres hallazgos más
graves de esta ronda —el dinero que no llega, el POS que no imprime y el CFDI que
no existe— estaban todos declarados como si existieran.*

### Ronda 20 — De la auditoría al arreglo

**Origen.** La Ronda 19 midió dónde el sitio está fuerte y dónde flaquea, y dejó
diez debilidades priorizadas. Una lista de debilidades sin arreglo es un
diagnóstico, no un tratamiento: esta ronda es la que **mueve el código**. El
dueño del producto eligió el criterio de orden —*los tres ejes, en oleadas
ordenadas por impacto sobre esfuerzo*— y una decisión de negocio que ninguna
medición podía tomar por él: **encender Stripe Connect**, para que el dinero del
cobro llegue directo al restaurante en vez de acumularse en la cuenta de la
plataforma.

**Método.** Cada área crítica se **verificó en el código antes de tocarla**, y
en tres casos la verificación cambió el trabajo: la Oleada 2.2 ya estaba
implementada y lo que faltaba era el contrato que la vigila; `AU8` describía dos
endpoints que eran scripts de un solo uso, no features; y `src/lib/audit.ts`
—que se iba a *unificar*— resultó ser el único escritor de dos eventos, así que
retirarlo sin trasplantarlos habría perdido traza. **El plan se escribió contra
el diagnóstico y se corrigió contra el código.**

**Oleada 0 — cerrar los agujeros de la puerta de admin.** Se retiraron
`/api/admin/seed-products` y `/api/admin/update-images`, dos endpoints que se
protegían con un token de entorno en vez de `requireAdmin()` y llevaban datos
hardcodeados de un solo uso: violaban el invariante #1 de `docs/agents/admin.md`
y no eran features, eran scripts que se quedaron a vivir dentro del panel. Se
unificó la bitácora: `src/lib/audit.ts` espejaba cuatro acciones en
`notifications` mientras `admin_audit_log` guardaba el resto, así que la misma
acción se registraba en dos libros y `/api/admin/audit-log` leía el libro
equivocado. Retirarlo destapó **dos huecos que solo el legado cubría** —la
asignación de repartidor no tenía equivalente en el catálogo nuevo— y **dos
acciones muertas** que quedaron sin escritor al retirar los endpoints de arriba.

**Oleada 1 — el dinero.** No existía **ni una sola llamada a `refunds.create`**
en todo el repositorio: un restaurantero no podía devolver un cobro ni desde la
UI ni por API. La restricción que decidió el diseño es de Stripe, no nuestra:
`reverse_transfer` y `refund_application_fee` **solo se pueden pasar al crear**
el reembolso, así que en el webhook ya es tarde. Por eso el camino normal es una
ruta admin que crea el reembolso y el webhook queda como **reconciliador**. Y una
trampa que se vio a tiempo: reutilizar `refunded` para un reembolso parcial
habría devuelto el **cashback completo**, porque `reverse_cashback_on_cancel()`
(00135) y `reversible_payment_confirmation` (00146) leen ese valor como reversión
total. De ahí el valor nuevo `partially_refunded`, que **no** se añadió a esas
listas. En la misma oleada, `platform_fee_percent` se **leía en cuatro sitios y
no se escribía en ninguno**: la comisión de la plataforma solo se podía cambiar
por SQL. Ahora es administrable, con **0 por defecto**, para cerrar el hueco sin
tomar la decisión de negocio en nombre de nadie.

**Oleada 2 — la escalera de niveles y el modo prueba.** Punto de venta nativo y
comandero bajaron de Diamante a Oro. El criterio no fue "abrir más" sino
**separar lo que hace cobrar de lo que hace escaparate**: un restaurante que no
puede cobrar no aprovecha ninguna otra capacidad, y las dos que se bajaron son
justo las de operar el día. `pos_integraciones` —conectar un punto de venta
**ajeno**— se quedó en Diamante a propósito (hasta la **Ronda 23**, que la sacó
del candado al comprobar que ningún adaptador está implementado: ver `RD1`). El modo prueba ya existía y
funcionaba: el hueco real era que `preview-gates.contract.test.ts` vigilaba el
aviso de bloqueo pero **no** el host del demo, así que un `ToolPreviewNotice` sin
`ToolGuideHost` habría sido un botón muerto —poder *ver* lo que no se puede
*probar*— sin que ningún test lo notara. La landing no necesitó cambios de
código: `PUBLIC_TIER_LADDER` se deriva de `TIER_LADDER` + `FEATURE_MIN_TIER`, y
lo que sí se corrigió fueron **cuatro afirmaciones** que ya mentían sobre qué
incluye cada nivel.

**Oleada 3 — el CRM y los permisos de admin.** `CRM2` se separó en medición y
presentación, siguiendo el patrón que el propio repo ya tenía (`readCrmPipelineValue`):
tres estados, no dos —sin datos, medido y medido a medias—, con `≥` cuando el
historial no cabe en la ventana. Y se cerró `AU4` con **un eje nuevo**: la
columna `admin_permissions` recorta dentro de la puerta de admin sin tocar
`role`, `is_admin()`, las tres policies RLS ni `admin_users`. Se eligió columna
anulable y **no** tabla de concesiones porque `NULL` (sin restringir) y `'{}'`
(restringido a nada) son **distinguibles**, y una tabla con cero filas no lo es:
borrar filas de permisos por error **asciende** al usuario a admin completo,
mientras que un valor ilegible en la columna lo **degrada**. El default de todo
el eje es el lado que niega.

| # | Entrega | Estado |
|---|---|---|
| OE1 | **Endpoints con token retirados** (`AU8`). `seed-products` y `update-images` borrados: eran scripts de un solo uso con datos hardcodeados y 0 consumidores en código | ✅ |
| OE2 | **Una sola bitácora** (`AU7`). Retirado `src/lib/audit.ts`; el feed lee `admin_audit_log`; `order_driver_assigned` / `order_driver_unassigned` trasplantadas al catálogo nuevo con test; acciones muertas eliminadas | ✅ |
| OE3 | **Camino de reembolso.** `src/lib/refund.ts`, `buildRefundParams()`, `POST /api/admin/orders/[id]/refund`, webhook reconciliador, `partially_refunded` en las cuatro listas de paridad del enum, UI en `/admin/pedidos` | ✅ |
| OE4 | **Comisión de plataforma administrable.** `PATCH /api/admin/foodos/restaurants/[id]/platform-fee` + editor en `/admin/foodos/dispersiones`; 0 por defecto | ✅ |
| OE5 | **Escalera de niveles** (`AU3`). `pos_mostrador` y `comandero` a Oro; contrato del producto y landing actualizados | ✅ |
| OE6 | **Modo prueba vigilado.** Cuarto chequeo en `preview-gates.contract.test.ts`: toda página con aviso de bloqueo monta el host del demo y no lo esconde | ✅ |
| OE7 | **`CRM2` reparado** (`AU9`). `scanPaidRevenue` + `formatMeasuredAmount`; el `≥` distingue "medido" de "medido a medias" | ✅ |
| OE8 | **Permisos granulares de admin** (`AU4`). `admin-permissions.ts` puro, `00188_admin_permissions.sql`, `requireAdminPage()`, 18 guards de sección, 52 rutas de API con dominio, editor en `/admin/usuarios` y contrato del árbol | ✅ |
| OE9 | **Connect encendido** (`AU1`). Decidido, no ejecutado: exige credenciales y una cuenta piloto real | 🔜 |
| OE10 | **e2e autenticado, CFDI, ESC/POS, wallet y a11y** (`AU2`, `AU6`, `AU10`). Depende de hardware, de un PAC contratado y de credenciales de prueba. Los **tests de superficie del panel** que esta ronda dejó fuera se cerraron en la Ronda 21 (`AU5`) | 🔜 |

**Lo que esta ronda desmintió.** Cuatro afirmaciones del plan, no del código:
que el modo prueba faltaba (estaba, y lo que faltaba era su guardia), que los dos
endpoints de `AU8` eran features (eran scripts), que `src/lib/audit.ts` era
duplicado puro (era el único escritor de dos eventos) y que `admin-roles.test.ts`
no existía (existía, con ocho tests en verde). **Ninguna de las cuatro habría
hecho fallar un test**: las cuatro se detectaron leyendo el código antes de
tocarlo, que es exactamente el motivo por el que esta ronda no se ejecutó contra
el diagnóstico.

**Lección:** *un diagnóstico se escribe una vez y se cree para siempre.* La
Ronda 19 midió honestamente y aun así cuatro de sus consecuencias operativas
eran falsas al llegar al código. La auditoría no se equivocó en lo que vio; se
equivocó en lo que **supuso** que faltaba. Por eso cada oleada empezó leyendo el
archivo que iba a cambiar, y por eso dos de las entregas de esta ronda —`OE6` y
la mitad de `OE2`— terminaron siendo **contratos que vigilan** algo que ya
funcionaba, en vez de código nuevo. En un repo que se auto-vigila, la diferencia
entre "está roto" y "nadie lo está mirando" es toda la diferencia.

**Cierre medido.** `npm run verify` en verde al terminar: typecheck, lint,
**355 archivos de test / 6,229 tests**, `knip` exit 0 — desde los 349 / 6,080 de
la Ronda 19. Dos migraciones nuevas aplicadas y verificadas por SQL (`00187`
reembolsos, `00188` permisos de admin), ambas **puramente aditivas**.

### Ronda 21 — La regla que solo estaba escrita

**Origen.** `AU5` decía que el panel del restaurante —la pantalla donde el
restaurantero pasa su día— tenía **cero tests de superficie**, mientras que la
lógica de negocio sí estaba testeada. La formulación de la auditoría era
tentadora: "es la superficie de uso diario y la menos vigilada", que suena a
tarea de cobertura. No lo fue. Al escribir los tests aparecieron **dos defectos
de dinero** que llevaban ahí sin que nada fallara, precisamente porque no había
nada que pudiera fallar.

**Método.** Antes de escribir un test se midió **el entorno**, porque es el que
decide qué test es posible: `vitest.config.ts` corre en `environment: "node"` y
su `include` es `src/**/*.test.ts` —**solo `.ts`, no `.tsx`**—, y las
dependencias de testing del `package.json` son exactamente una, `vitest`. **No
hay jsdom, ni happy-dom, ni Testing Library**, así que **un componente no se
puede montar**. Quedaban dos caminos honestos y se usaron los dos: unitarios
puros sobre los módulos `*-shared.ts` (importables en node) y **contratos
estáticos** que leen el árbol real con `readFileSync`/`readdirSync`. Ninguno de
los dos simula un clic; el objetivo no era simular al usuario sino **fijar por
escrito las reglas que el panel aplica al dinero**.

**El invariante que nadie vigilaba.** `docs/agents/panel.md` declara que hay
**un solo productor de totales del mostrador**: `entryTotal` es la fuente única
y `hubEntryTotal` **delega** en él. Un grep de `entryTotal|hubEntryTotal|
counterSummary` devolvía solo archivos de producción: **cero tests**. La regla
existía únicamente en un docstring. Medido con `node -e` sobre **976 archivos de
producción**: la fórmula del descuento porcentual aparece en **un** archivo,
`entryTotal` se declara en **un** archivo, y el cuerpo de `hubEntryTotal` es
exactamente `return entryTotal(e)`. El docstring del propio `hub-data.ts`
registra por qué: *el cálculo estaba duplicado y divergía en el descuento
porcentual —el del hub no recortaba en 0, así que un descuento mayor al 100 %
daba un total negativo*. La duplicación ya se había arreglado; **lo que faltaba
era el test que impide que vuelva**.

**Los dos defectos que destaparon los tests.** Ninguno de los dos habría hecho
fallar un test existente, porque no existía.

El primero es de coma flotante y estaba en la proyección de stock del
inventario: la regla exige un colchón del 10 % sobre el consumo previsto, pero
`100 * 1.1` en punto flotante da `110.00000000000001`, así que un inventario de
**exactamente 110** contra un consumo de 100 quedaba clasificado como "justo"
cuando el colchón estaba **completo**. La corrección escala la comparación a
enteros (`stock * 10 >= needed * 11`) y mueve **solo** ese límite exacto: los
casos de frontera vecinos siguen clasificando igual, que es la única forma
aceptable de tocar una regla que ya está en uso.

El segundo es una taxonomía incompleta y estaba en el costo ajustado por merma
del planificador: `getWasteCategory` mapea la categoría de un insumo al grupo de
merma que le aplica, y le faltaban sinónimos. `"Tortillas"` y `"Base"` —granos—
caían en `"Otros"` (2 %) en vez de `"Secos"` (3 %), y `"Guarnición"` caía en
`"Otros"` en vez de `"Verdura"` (12 %) pese a que `"Acompañamiento"` —el mismo
concepto, la papa que acompaña— **ya estaba mapeado a Verdura**. No es cosmético:
ese porcentaje entra en el costo estimado que el planificador le muestra al
restaurantero, así que el error era **una subestimación silenciosa de la
merma**, y en el caso de la guarnición la diferencia entre grupos era de 2 % a
12 %.

**El hallazgo más incómodo, y el que no se tocó.** El planificador lee el
porcentaje con `wastePcts[wc] ?? WASTE_CATEGORIES.find(...)?.defaultPct ?? 8`.
Como `getWasteCategory` solo devuelve claves declaradas, ese `?? 8` es **código
muerto**: nunca se dispara. No se eliminó —quitarlo no cambia el comportamiento
y dejarlo documenta que alguien quiso protegerse— pero **sí se fijó en un test**
la propiedad que lo vuelve muerto, para que si algún día la función deja de ser
total, el test lo diga en vez de que el fallback lo tape.

**Un test que se cazó a sí mismo.** El contrato del planificador incluye una
lista blanca de las categorías que **sí** deben caer en `"Otros"` a propósito
(salsas, aceites, botanas). Al correrlo falló: la lista decía `"Botanas"` y la
categoría real del catálogo es `"Botana"`. El detector atrapó la errata de quien
lo escribió, que es exactamente la prueba de que el detector mira algo.

| # | Entrega | Estado |
|---|---|---|
| TP1 | **Totales del mostrador.** `ventas-shared.test.ts`: `entryTotal` (el descuento porcentual se calcula sobre el subtotal y no sobre el unitario, el monto fijo se resta una sola vez, el total se recorta en 0) y `counterSummary` (cuenta ventas, no unidades; excluye otros días) | ✅ |
| TP2 | **Comanda.** `comanda-shared.test.ts`: `entryTime` prefiere `createdAt` y descifra el id base36 cuando falta, `fmtTime` en 24 h local, paridad de `STATUS_META` con los tres estados y de `CHANNELS` con los cuatro canales | ✅ |
| TP3 | **Un solo productor de totales.** `panel-money.contract.test.ts`: la fórmula del descuento vive en **un** archivo, `entryTotal` se declara **una** vez y `hubEntryTotal` delega sin aritmética propia. Con detectores probados contra fixtures **antes** de mirar el perímetro y canarios contra el paso en vacío | ✅ |
| TP4 | **Inventario.** `inventario-shared.test.ts`: `purchaseOrderLine` (objetivo = mínimo × 2, nunca negativo, costo proporcional) y `projectionVerdict` en sus tres estados y sus límites exactos. **Destapó el defecto de coma flotante**, corregido con comparación entera | ✅ |
| TP5 | **Planificador.** `planificador-shared.test.ts`: taxonomía de merma y coherencia entre catálogo y grupos. **Destapó las dos categorías mal clasificadas**, corregidas | ✅ |
| TP6 | **Mermas y costeo.** `mermas-shared.test.ts` (unicidad y monotonía del id, causas ordenadas con `otro` al final, ningún consejo huérfano) y `costeo-shared.test.ts` (toda categoría con emoji, todo slug con insumos con precio, toda receta con porciones) | ✅ |
| TP7 | **Componentes montados y e2e autenticado.** El entorno no tiene jsdom ni Testing Library, y el e2e no tiene semilla ni credenciales (`AU10`) | 🔜 |

**Lo que esta ronda desmintió.** Tres afirmaciones, y la tercera era mía. La
primera: que `AU5` fuera una tarea de cobertura. No lo era —los tests
encontraron dos reglas de dinero mal escritas, no dos pantallas rotas— y la
lección es que **el valor no estuvo en cubrir, estuvo en tener que escribir la
regla en una forma que no admite ambigüedad**. La segunda: que "la lógica de
negocio está testeada" bastara. Era cierto y no bastaba, porque la regla del
dinero del mostrador vive en **el panel** (`ventas-shared.ts`) y lo que estaba
testeado era la de `src/lib/`. La tercera: que este entorno no permite testear
el panel. Permite menos de lo que parece —no se monta un componente— y más de lo
que se supone: contratos estáticos sobre el árbol real, con detectores probados
por fixtures negativas, vigilan invariantes que ningún test unitario puede
vigilar.

**Lección:** *una regla que solo vive en un docstring no está vigilada, está
documentada.* El invariante del productor único de totales estaba escrito,
explicado y con la historia de su propia ruptura en el comentario del código; y
nada lo comprobaba. La Ronda 20 ya había aprendido esto por otra vía —dos de sus
entregas terminaron siendo contratos que vigilan algo que ya funcionaba—, y esta
ronda lo confirma desde el otro lado: cuando por fin se escribe el test de una
regla que nadie miraba, lo normal no es que pase, es que **encuentre algo**.

**Cierre medido.** `npm run verify` en verde al terminar: typecheck, lint,
**362 archivos de test / 6,338 tests**, `knip` exit 0 — desde los 355 / 6,229 de
la Ronda 20. Siete archivos de test nuevos y **dos correcciones de dinero** en
código de producción, ninguna de las cuales habría aparecido sin escribir el
test.

### Ronda 22 — El guard que no era el guard

**Origen.** `AU10` decía dos cosas distintas y las juntaba: la cobertura e2e
**no alcanza a ~10 secciones del panel admin**, y el e2e **no autentica**, así
que verifica guardas y render en vez de flujos. La segunda mitad es un problema
de credenciales —este entorno no tiene semilla ni usuario de prueba— y no se
puede resolver escribiendo código. La primera mitad sí, y es la que se cerró.
La distinción importa: una de las dos se podía arreglar hoy y la otra no, y
tratarlas como un solo bloque habría dejado las dos abiertas.

**Método.** Primero se midió la cobertura real por sección, contando menciones
en `e2e/`: `/admin/leads` 26, `/admin/productos` 8, `/admin/pedidos` 6,
`/admin/marketing` 3, `/admin`, `/admin/usuarios` y `/admin/restaurantes` 2,
`/admin/bitacoras` 1. Y **once secciones con cero menciones**:
`/admin/proveedores`, `/admin/repartidores`, `/admin/comisiones`,
`/admin/foodos/dispersiones`, `/admin/seo-ia`, `/admin/whatsapp`,
`/admin/recompensas`, `/admin/foodos/restaurantes`, `/admin/operar`,
`/admin/conversion` y `/admin/sistema`. Ocho de diecinueve. Después se midió el
entorno, porque es el que decide qué test es posible: el calentamiento de
`e2e/global-setup.ts` recorría 72 rutas en 13 s y `admin-audit.spec.ts` pasaba
6/6 en 21,4 s, así que el e2e **sí corría** y el problema no era de arranque.

**El barrido que se apoya en el mapa.** En vez de escribir diecinueve pruebas
con diecinueve URLs escritas a mano —que es lo que se desincroniza en cuanto
alguien añade una sección—, `e2e/admin-guards.spec.ts` **importa
`ADMIN_SECTIONS`** de `src/lib/admin-permissions.ts` y recorre el mapa. Ese
módulo es puro (cero imports), así que un spec de Playwright puede importarlo
sin arrastrar el servidor. La lista de secciones tiene entonces **una sola
copia**, y la número veinte se prueba el día que se declara. Un canario exige
`paths.length >= 19` y que ninguna ruta se repita, para que el barrido no pueda
pasar en vacío si el mapa se vacía.

**El bug que costó diecinueve fallos.** El deep link estaba roto: un anónimo que
pedía `/admin/comisiones` acababa en `/auth/login?next=/admin`, y tras entrar
aterrizaba en el panel, no donde iba. El arreglo natural era
`requireAdminPage()`, la función que cada `layout.tsx` de sección llama con su
dominio. Se arregló, se probó, y **el barrido siguió fallando las diecinueve**.
La razón es de orden de ejecución de Next: **el guard que corta a un anónimo es
el layout raíz** (`src/app/admin/layout.tsx`), no los layouts de sección —cuando
el ancestro redirige, los hijos **nunca se ejecutan**— y ese layout escribía
`next=/admin` en un literal. Arreglar el guard de abajo no podía cambiar nada
mientras el de arriba siguiera redirigiendo. El diagnóstico se hizo con una
sonda temporal en el proxy que devolvió `x-debug-pathname: /admin/usuarios`, lo
que probó que la cabecera **sí** se propagaba y descartó al proxy como culpable;
después un grep de `/auth/login` en `src/` señaló la línea. La lección es
general: *cuando un guard vive en varios niveles, el que dispara es el ancestro.*

**Por qué el destino viaja en una cabecera.** `requireAdminPage()` corre desde
layouts, y **un layout de Next no recibe el pathname** —solo `params` y
`children`—, así que no puede saber qué sección pidió el visitante. El proxy
escribe `x-pathname` (con query incluida) en las cabeceras de la petición. El
**orden importa y no es obvio**: se muta `request.headers` *antes* de
`updateSession(request)`, porque es su `NextResponse.next({ request })` quien
las propaga y esa función tiene cuatro salidas tempranas —ruta estática, sin
Supabase configurado, sin cookie `sb-`, token vigente—; mutar después habría
dejado esas cuatro sin cabecera. El valor se codifica con `encodeURIComponent`
en `adminLoginPath`, y eso **no** es un exceso: el formulario de login lee el
parámetro con `searchParams.get("next")`, que ya descodifica, así que el
`%2F` se resuelve solo — y sin la codificación, una ruta con `&` partiría el
query param en dos.

**El contrato que cazó el hueco, y cómo.** Con el arreglo en pie y el barrido en
verde, `npm run verify` falló en **un solo test**:
`src/lib/e2e-warmup.contract.test.ts`, el contrato que exige que **todo patrón
de ruta que visite un spec `@ci` esté calentado** en `e2e/global-setup.ts`.
Once secciones no lo estaban. La parte incómoda es *cómo* las detectó: no
entendió el bucle del barrido —un `page.goto(path)` con la ruta en una variable
no es un literal—, las encontró **por accidente**, porque el docstring del spec
las enumera entre backticks y la regex de literales del contrato también acepta
backticks. Es decir: el contrato acertó por un camino que no era el suyo, y el
día que alguien reformule ese comentario las once se quedan sin calentar **en
silencio**. Se cerraron las dos cosas a la vez: las once rutas entraron en
`ROUTES` con un comentario que explica por qué, y el contrato ganó una prueba
que **deriva la obligación del mapa** —recorre `ADMIN_SECTIONS`, resuelve cada
ruta a su patrón y exige que esté calentado— con un canario que falla si alguna
sección no resuelve, para que el test no pueda pasar filtrando lo que no
entiende. Verificado por falsación: borrando `/admin/whatsapp` de `ROUTES`
fallan **las dos** pruebas nombrando esa ruta.

| # | Entrega | Estado |
|---|---|---|
| EA1 | **Medición de cobertura.** Menciones por sección en `e2e/`: once de diecinueve secciones con **cero** menciones, medido antes de escribir nada | ✅ |
| EA2 | **Deep link que recuerda la sección.** `adminLoginPath()` en `src/lib/admin-auth.ts` (pura, exportada, testeable) y `ADMIN_PATH_HEADER`; `requireAdminPage()` la usa | ✅ |
| EA3 | **`x-pathname` en el proxy.** `src/proxy.ts` escribe la ruta con su query para `/admin`, **antes** de `updateSession` para que las cuatro salidas tempranas la propaguen | ✅ |
| EA4 | **El guard raíz.** `src/app/admin/layout.tsx` deja de escribir `next=/admin` literal. **Es el arreglo que realmente cerró el bug**: los diecinueve fallos venían de aquí, no de `requireAdminPage()` | ✅ |
| EA5 | **Barrido de guardas.** `e2e/admin-guards.spec.ts`: canario, diecinueve pruebas de guarda anónima, enlace profundo con query, parámetros adversarios, y un bloque autenticado gateado por credenciales | ✅ |
| EA6 | **Sesión unificada.** `e2e/support/session.ts` con `hasAdminCredentials()` y `signInAsAdmin()`; las dos copias locales que había en `admin-leads.spec.ts` y `admin-productos-modal.spec.ts` se retiraron | ✅ |
| EA7 | **Candado anti-regresión.** `admin-sections.contract.test.ts` falla si algún layout vuelve a escribir un literal `"/auth/login?next=..."` o `next=/admin`, y exige que el shell use `adminLoginPath` y `ADMIN_PATH_HEADER` | ✅ |
| EA8 | **Calentamiento y su contrato.** Las once secciones entran en `ROUTES`; el contrato de calentamiento gana una prueba que **deriva** la obligación de `ADMIN_SECTIONS` en vez de depender de un comentario | ✅ |
| EA9 | **Flujo autenticado de verdad.** Sigue gateado por `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`, que **no existen en este entorno**. El bloqueo es de credenciales, no de código: `signInAsAdmin()` está escrito y no lanza, simplemente no tiene con qué entrar | 🔜 |

**Lo que esta ronda desmintió.** Cuatro cosas. La primera: que el deep link se
arreglara en `requireAdminPage()`. Era la función que *parecía* el guard —la que
lleva el nombre, la que recibe el dominio, la que está en los diecinueve
layouts— y no era la que cortaba el paso; arreglarla dejó el fallo intacto las
diecinueve veces. La segunda: que la cobertura e2e de `AU10` fuera un problema
de escritura de specs. Once secciones no tenían mención, pero **añadir el
barrido no bastó**: hizo falta calentarlas, y eso lo dijo un contrato de otro
archivo, no la prueba nueva. La tercera, y la más incómoda: que un contrato
detectara el hueco **no prueba que lo vigile**. El de calentamiento acertó por
un comentario; si ese comentario se reescribe, el contrato vuelve a decir que
todo está bien. La cuarta: que el e2e autenticado fuera alcanzable desde aquí.
No lo es, y queda escrito como tal en vez de como pendiente de implementación —
`siginInAsAdmin` existe; lo que falta es un usuario.

**Lección:** *un contrato que acierta por un camino que no era el suyo está
diciendo "no sé mirar esto", no "está bien".* El de calentamiento no podía ver
un `page.goto(path)` con la ruta en una variable, y en vez de callarse acertó
por el docstring. La reparación no fue añadir las once rutas —eso arregla el
síntoma— sino **darle al contrato una fuente de verdad que pueda leer**:
`ADMIN_SECTIONS`. La diferencia se ve en el caso que importa, la sección
número veinte: con el arreglo del síntoma habría que acordarse de calentarla;
con la fuente de verdad, el contrato lo exige solo.

**Cierre medido.** `npm run verify` en verde al terminar: typecheck, lint,
**362 archivos de test / 6,349 tests**, `knip` exit 0 — desde los 362 / 6,338 de
la Ronda 21. En e2e: **28 passed / 1 skipped** en el barrido más `auth.spec.ts`,
y la suite `@ci` completa en **443 passed / 122 skipped / 0 failed**, con el
calentamiento ampliado de 72 a 83 rutas sin tocar su presupuesto (120 s × 5
sigue por debajo del timeout de 25 min del job). El e2e autenticado queda
declarado como bloqueado por credenciales.

### Ronda 23 — El arnés que mentía y los medidores que se saltaban lo que no entendían

**Origen.** El usuario pidió una auditoría de estatus —qué funciona y qué no, en
`/panel` y en `/admin`— porque el sitio le resultaba opaco. La auditoría
(`docs/AUDITORIA-ESTATUS.md`, 54 superficies) produjo el mapa; este documento
produjo el orden. La ronda ataca lo que la auditoría marcó como crítico, y lo
ataca en un orden deliberado: **primero el arnés de pruebas, después las
mediciones**. No por elegancia, sino porque en esta ronda se comprobó dos veces
que un medidor puede mentir en silencio, y que un arnés roto hace que todo lo
demás sea fe. Arreglar el sitio con un arnés que miente es cambiar números sin
cambiar nada.

**Oleada B — el arnés.** Cuatro entregas, y la cuarta se llevó el tiempo.

- **`b1` — el consentimiento y la guía se pisaban.** El aviso de cookies y el
  panel de guía de la herramienta podían estar abiertos a la vez, y el
  consentimiento —que es obligación legal— perdía. El contrato de flotantes ya
  había arreglado el pill; lo roto era el **drawer** (`z-[90]`) y su backdrop.
  Se extrajo `src/lib/cookie-consent.ts` (la decisión, pura y testeable), se
  refactorizó el componente y se reescribió `use-tool-guide.ts` para que la guía
  **ceda** ante el consentimiento. El renombre `dismissToolGuide` →
  `expectToolGuideClosed` no es cosmético: el nombre viejo afirmaba una
  intención y el nuevo afirma un **resultado observable**, que es lo que el test
  comprueba. Cuatro capas de prueba (8 unitarias, 8 de contrato, 4 de e2e).
- **`b2`/`b3` — el arnés de e2e corría contra un servidor compartido.** `distDir`
  configurable, `/.next*/` en `.gitignore`, `NEXT_DIST_DIR` y `workers` en
  `playwright.config.ts`, `reuseExistingServer: false`, puerto propio (`3210`) y
  `tsconfig.json` con `"references": []` para que Next deje de añadir entradas.
  Los workers bajaron de 4 a **2**: no es prudencia, es que con 4 el
  calentamiento **corrompía** el `prerender-manifest.json`.
- **`b4` — la migración del e2e a `next build` + `next start`.** El e2e corría
  sobre `next dev`, y `next dev` tenía dos problemas medidos: corrompía el
  manifest (arriba) y **crecía ~7 MB/s hasta los 6.6 GB** en una máquina de
  16 GB con swap al 85 % —el mismo `next build` pide **216 MB** y tarda 50,2 s,
  treinta veces menos—. La migración se implementó (`build:e2e`, `SERVER_MODE`,
  `ES_PROD`, `command`/`timeout` condicionales) y **falló: 10 rojos de 11 en
  5m32s**. La cadena de sondas que encontró la causa es el contenido real de esta
  entrega: `example.com` **se colgaba** y `about:blank` no; `page.setContent`
  también se colgaba, así que no era la red ni el JS; un `TMPDIR` fresco lo
  arreglaba. La causa: **168 perfiles `playwright_chromiumdev_profile-*` zombis**
  acumulados en el `$TMPDIR` del sistema, que hacían que Chromium se quedara
  esperando con **CPU al 0 %** y sin error. El arreglo es un `TMPDIR` propio
  purgado en cada arranque, exportado desde `playwright.config.ts`. Re-validado:
  **11 passed en 1,4 min**. La firma —`domcontentloaded` a los 42 ms, `evaluate`
  OK a los 42 ms, colgado a los 200–1500 ms, CPU 0 %— queda escrita porque
  distingue esta avería de las otras cuatro que se midieron en la ronda.

**Oleada A — las mediciones.** Ocho entregas. La moraleja se repite: **casi todos
los números del backlog eran falsos**, y los que no lo eran estaban sin medir.

- **`a1` — contraste de `/panel`.** El contrato de contraste existía para
  `/admin` y no para el panel del restaurantero. Se extrajo la matemática WCAG a
  `src/lib/contrast.ts` (el contrato de admin pasó de 720 a ~318 líneas sin
  perder una prueba) y se midió: **48 archivos, 475 pares, 60 fallos AA** y dos
  afordancias muertas que resultaron ser falsos positivos (hoy declarados en
  `VARIANTES_DE_INHIBICION`). **51 arreglos aplicados**, con un aplicador que
  exige unicidad antes de escribir. Nace `panel-contrast.contract.test.ts`
  (13 pruebas) con un **ratchet** de deuda (`DEUDA_NEUTROS`) que impide que los
  grises vuelvan a subir aunque no se exija el cero hoy.
- **`a2` — el hueco de foco.** 256 `outline-none` en el perímetro y **cero**
  `focus-within:bg-*` reales: el anillo de foco se apagaba sin poner nada en su
  lugar. El detector se reescribió con `ultimaVariante()`, `VARIANTE_PROPIA`,
  `VALOR_SIN_PINTURA` y `pintaFoco()` —porque `focus-within:ring-0` **no** es un
  fallo si después una variante propia sí pinta— y ganó 4 pruebas.
- **`a3` — la paleta latente.** `warm-400` mide **3,08** sobre blanco: falla AA.
  No era un token muerto: tenía **4 usos reales**, todos como `placeholder:` en
  `CheckoutFlowScreen.tsx:350,374,393,412`. Pasaron a `warm-500` (4,56). La
  prueba de vida del contrato se hizo plantando el token a mano y viendo fallar
  la guarda.
- **`a4` — la política de grises (`CX8`/`CX9`).** El barrido completo de
  `src/**` dio **191 fallos crudos → 162 falsos positivos → 29 exentos →
  `aArreglar=0`**, con **110 + 11 ediciones** en 111 archivos y **4 reglas de
  exención** que particionan los 29 sin solape ni resto (`control-inactivo-por-variante`
  3, `control-inactivo-por-rama` 4, `relleno-translucido` 20, `color-de-ejecucion`
  2). El contrato `neutral-contrast.contract.test.ts` (8 pruebas) exige tres
  cosas a la vez: que no quede ningún vivo, que cada regla gaste **exactamente**
  su presupuesto, y que ninguna regla quede muerta.
- **`a5`/`a6`/`a7` — las tres filas que estaban mal.** `A14` decía que los
  archivos de `recompensas` no estaban cubiertos por `MotionConfig`; medido por
  AST son **20 archivos, 19 con import real**, todos bajo el `MotionConfig` del
  padre —y `AJENOS` excluía `recompensas`, así que la regla `R6` **no los veía**:
  el contrato era ciego al directorio y la fila describía esa ceguera como
  hallazgo—. `A15` sí era un fallo vivo: `InvoiceScannerScreen.tsx:466` tenía
  `focus-within:border-brand-500/50` a **2,19:1** (bajo el 3:1 de componentes);
  quedó en **5,2:1** con el patrón ya usado en `search-bar.tsx`. Y `A17` —la fila
  que decía que los dos detectores de nombre accesible tenían «tasa de falsos
  positivos alta» y los declaraba **medidos, no aprobados**— resultó ser cierta al
  medirla y **falsa tras corregir el detector**: no eran 113 botones sin nombre
  sino **25**, y los 25 eran verdaderos. Los falsos venían de tres formas que un
  detector que lee el AST sí distingue y uno que lee la cadena de texto no
  (`aria-label={t("…")}`, texto pintado por expresión, props por spread). Los 25
  se arreglaron con `aria-label` y **`R7` los congela en cero** con tolerancia
  cero. Los campos sí se quedan medidos y sin contrato —**193**, no 135— por una
  razón que la fila no decía: de los 193, 79 son ruido legítimo y 114 limpios, y
  al triar los 79 aparecieron **defectos reales mezclados** (un `<label>`
  **hermano** sin `htmlFor` no asocia nada y el heurístico lo daba por nombrado).
  Congelar consagraría el ruido en las dos direcciones.

| # | Entrega | Estado |
|---|---|---|
| RB1 | **Precedencia consentimiento → guía.** `src/lib/cookie-consent.ts`, drawer y backdrop reordenados, `use-tool-guide.ts` cede. 8 + 8 + 4 pruebas en tres capas | ✅ |
| RB2 | **Aislamiento del arnés.** `distDir` configurable, `NEXT_DIST_DIR`, `/.next*/` ignorado, `tsconfig` sin referencias basura, puerto propio 3210 | ✅ |
| RB3 | **Workers 4 → 2 y `reuseExistingServer: false`.** Con 4 el calentamiento corrompía el `prerender-manifest.json` en la ruta 8 de 64 | ✅ |
| RB4 | **E2E sobre `next build` + `next start`.** El cuelgue era un `$TMPDIR` con **168 perfiles de Chromium zombis**, no el servidor de producción: 10 rojos/5m32s → **11 passed/1,4 min** | ✅ |
| RA1 | **Contraste de `/panel`.** 475 pares medidos, 60 fallos AA, 51 arreglos; `panel-contrast.contract.test.ts` (13) con ratchet de neutros | ✅ |
| RA2 | **Hueco de foco.** Detector R1 reescrito (`ultimaVariante`, `pintaFoco`); 256 `outline-none` auditados, cero `focus-within:bg-*` reales | ✅ |
| RA3 | **Paleta latente.** `warm-400` a 3,08 con 4 usos vivos → `warm-500` (4,56); `latent-palette.contract.test.ts` (6) | ✅ |
| RA4 | **Política de grises (`CX8`/`CX9`).** 191 crudos → 162 falsos → 29 exentos → **0 vivos**; 121 ediciones; 4 reglas con presupuesto; `neutral-contrast.contract.test.ts` (8) | ✅ |
| RA5 | **`A14` remedida.** 20 archivos (19 con import real), todos bajo el `MotionConfig` del padre; `AJENOS` hacía la regla `R6` ciega al directorio | ✅ |
| RA6 | **`A15` verificada y arreglada.** `InvoiceScannerScreen.tsx:466` de **2,19:1** a **5,2:1** | ✅ |
| RA7 | **`A17` decidida.** 76→25 botones y 1190→193 campos tras 4 ajustes de precisión; 25/25 verdaderos positivos, los 25 arreglados con `aria-label`; **`R7` congela `controles=0`**; campos medidos y **no** congelados, con la razón escrita | ✅ |
| RA8 | **Registro.** Auditoría y filas `CX5`–`CX9`/`A17` corregidas con las mediciones de la ronda; conteo del pie actualizado | ✅ |
| RC1 | **`orders.seller_id` eliminada.** Columna de atribución que **nadie escribió ni leyó nunca**, y cuya única consecuencia real era la segunda FK `orders → profiles` que causaba el `PGRST201` de los embeds. Migración `00189`; `orders-seller-id.contract.test.ts` (9) congela la eliminación, porque el modo de fallo es **volver a añadirla** | ✅ |
| RC2 | **RLS sin políticas, declarada.** 24 tablas con RLS encendida y cero políticas: 9 sin un solo `COMMENT ON TABLE` y 14 con un comentario que describía la tabla pero **no quién puede leerla**. Todas se acceden con `createServiceClient()` (o por RPC restringida a `service_role`). `rls-declared.contract.test.ts` (11) exige que cada una declare su modelo de acceso **con el archivo que lo demuestra** | ✅ |
| RC3 | **`CRM5` — el previsto es una foto, y ahora se dice.** `crm_prospects.estimated_value` no tiene histórico y el CRM **no puede** responder «cuánto valía el pipeline el mes pasado»; la pregunta no se improvisa desde la cifra de hoy. Se **declara en vez de construir la serie**: una tabla de snapshots sin lector es la superficie muerta que `00189` acaba de eliminar. `crm-forecast.contract.test.ts` (15) hace falsable la declaración — falla si aparece la serie, si `estimated_value` se duplica en otra tabla, si el módulo del dinero deja de ser puro o si vuelve a citarse `orders.seller_id` | ✅ |
| RD1 | **POS fuera del candado de pago.** `pos_integraciones` estaba en **Diamante** —el nivel más caro— y **no hace nada**: los seis adaptadores comerciales están declarados `implemented: false` (`src/lib/pos/registry.ts`) y el webhook responde 503. Se conserva la superficie y se baja a **Verde**. La bajada de una línea no bastaba: `PUBLIC_TIER_LADDER` se deriva de `featuresForTier`, así que la escalera pública habría anunciado "Conectar tu punto de venta" **como beneficio del nivel gratuito** —y del más caro a la vez—. Se separan los dos predicados: `perksForTier` (lo que el nivel **aporta**, excluye la línea base) alimenta la escalera; `featuresForTier` (lo que el nivel **puede usar**) alimenta al admin, la adopción y el panel. El test congela la condición de subida: si algún día se implementa un adaptador, falla y obliga a subir el nivel | ✅ |

**Lo que esta ronda desmintió.** Siete cosas, y las siete apuntan al mismo sitio.

La primera: que el e2e estuviera roto por el servidor. La migración a
producción era correcta y **el fallo estaba en el sistema operativo**, en un
directorio temporal con 168 perfiles zombis. Costó seis sondas porque el síntoma
—Chromium colgado con CPU al 0 % y sin error— no se parece a ninguna causa
conocida.

La segunda: que `next dev` fuera lento. No era lento, era **insaciable**: ~7 MB/s
hasta 6.6 GB. La firma que lo separa de un servidor caído está escrita arriba,
porque los dos se ven igual desde el test.

La tercera: que el `prerender-manifest.json` se corrompiera por un bug de Next.
Lo corrompía **el propio calentamiento** con `CONCURRENCY = 4`; con 1 no falla
nunca (64 rutas, 168,7 s). Y Next escribe ese archivo **sin truncar**, así que un
fallo a mitad deja restos y el `JSON.parse` siguiente revienta: la avería se
**autoalimenta** y es permanente en `dev`.

La cuarta, y la más incómoda: que los detectores del backlog midieran lo que
decían medir. `A17` declaraba una tasa de falsos positivos que era cierta con el
detector viejo y **dejó de serlo** cuando el detector se corrigió; `A14`
describía como hallazgo la **ceguera** del contrato a `recompensas`. Y en `a4`,
los dos defectos peores no los encontró el barrido sino la desconfianza en el
barrido: `RE_VARIANTE` **no incluía `placeholder:`**, así que todo
`placeholder:text-*` era invisible (**15 pares, 10 en fallo**), y la familia
`neutral` **no estaba en `PALETA`** porque Tailwind v4 escribe los acromáticos
como `oklch(70.8% 0 none)` —hue literal `none`— mientras el patrón exigía
`[\d.]+`: **13 pares descartados en silencio**, uno de ellos **vivo**
(`wallet-card-view.tsx:209`, 4,35 → 6,16). Un medidor que se salta sin avisar lo
que no entiende no es un medidor, es una opinión con salida numérica.

La quinta: que «medido» y «aprobado» fueran estados del mismo eje. No lo son.
`A17` estaba **medida y mal**. Los campos de `a7` quedan **medidos y sin
aprobar**, y eso es un estado legítimo y escrito: 193 con las vías de falso
positivo enumeradas, porque congelarlos consagraría el ruido.

La sexta, y la que más se parece a un patrón: que **el silencio del esquema se
lee igual que su acierto**. `orders.seller_id` existía desde `00052`, con FK a
`profiles` e índice propio, y **ninguna vista, RPC ni política la leía**, y
ningún archivo de `src/` o `e2e/` la nombraba: era una columna de atribución que
devolvía `NULL` para siempre y que invitaba a construir sobre ella una
atribución que nunca habría funcionado. Su único efecto medible era la segunda FK
`orders → profiles`, exactamente la causa del `PGRST201` que
`src/lib/admin/order-selects.ts` documenta y su test vigila. Y en la misma línea,
**24 tablas con RLS encendida y cero políticas**: deny-by-default, correcto, y
sin una línea que dijera quién las lee — la superficie se veía idéntica con el
permiso bien puesto que con el permiso mal puesto. En los dos casos la reparación
fue la misma: no cambiar el comportamiento, sino **escribir la decisión donde se
pueda verificar**. `00189` elimina la columna y el contrato congela la
eliminación; el registro de RLS nombra las 24 tablas y el archivo que prueba cada
acceso. La tercera cara del mismo silencio la puso `CRM5`: `estimated_value` es
una cifra declarada **sin serie detrás**, y el CRM puede decir cuánto vale el
pipeline hoy y no cuánto valía el mes pasado. La tentación era construir la
tabla de snapshots; la decisión fue **no hacerlo**, porque una tabla de
histórico sin lector es exactamente la superficie muerta que `00189` acababa de
eliminar, y en su lugar dejar la limitación escrita y **falsable**: si alguien
crea la serie, el contrato falla y le obliga a actualizar la declaración.

La séptima, y la que cierra el círculo: que **un candado de nivel fuera una
decisión de una línea**. `pos_integraciones` estaba en Diamante y no hacía nada;
sacarla de ahí parecía mover un valor en un mapa. No lo era, porque el mismo
`featuresForTier` que decide qué **puede usar** un restaurante es el que arma la
**escalera de marketing**, y en la escalera una capacidad de nivel Verde no
significa "es gratis": significa "es el beneficio que te da subir a Verde", que
se anuncia con palomita en los cuatro niveles. El candado tenía un solo nombre y
tres significados —*qué me da subir*, *qué puedo usar* y *qué aporta mi nivel*—
y ninguno estaba escrito. La reparación no fue bajar el nivel, sino **separar los
predicados**: `perksForTier` (lo que el nivel **aporta**) para la escalera
pública, `featuresForTier` (lo que el nivel **puede usar**) para el admin, la
adopción y el panel. La capacidad es la misma, y ahora cada superficie responde
la pregunta que de verdad hace.

**Lección:** *un número de backlog no es un hecho, es una medición caducada; y un
medidor que descarta en silencio lo que no entiende convierte cada cero en una
pregunta abierta.* Las tres mitades de esta ronda son la misma lección vista desde
tres lados: el arnés de pruebas (Oleada B) mentía por causas que estaban **fuera**
del código, los medidores (Oleada A) mentían por causas que estaban **dentro** del
suyo, y el esquema (Oleada C) **no mentía: callaba**, que desde fuera se lee
igual. En los tres casos la reparación no fue ajustar el número, sino hacer que el
instrumento **diga lo que no puede ver**. La Oleada D añade el cuarto lado: un
**mismo nombre con dos lecturas**, donde la reparación es nombrar cada lectura.

**Cierre medido.** `npm run verify` en verde al cerrar las cuatro oleadas:
typecheck, lint, **370 archivos de test / 6,445 pruebas**, `knip` exit 0 — desde
los 362 / 6,349 de la Ronda 22. Siete contratos nuevos
(`panel-contrast` 13, `neutral-contrast` 8, `latent-palette` 6,
`cookie-consent` 8, `orders-seller-id` 9, `rls-declared` 11,
`crm-forecast` 15) y uno extendido
(`a11y-static`, 33 → **37**, con la regla `R7`). En e2e: **11 passed en 1,4 min**
sobre `next build` + `next start`, desde los 10 rojos en 5m32s del primer
intento. La Ronda 23 queda **cerrada**: `d1` era lo último pendiente de las
oleadas A–D.

### Ronda 24 — La bitácora que no decía cuánto callaba

**Origen.** La debilidad #7 de [`docs/AUDITORIA-ESTATUS.md`](AUDITORIA-ESTATUS.md):
las tres pestañas de `/admin/bitacoras` consultaban con un `LIMIT` duro y
**ninguna declaraba que se había cortado**. Una lista truncada en silencio se lee
como una lista completa: el admin ve 100 filas y concluye «eso es todo lo que
pasó». En `admin_audit_log` —el registro de quién tocó el dinero, el catálogo y
los permisos— eso es perder evidencia, no una imprecisión de UI. La pestaña
hermana de la que sí importa legalmente (`errores`) ya exportaba CSV; la de
auditoría, no.

**Oleada A — medir el corte antes de tocarlo (`ba1`–`ba3`).**
- **`ba1` — el estado real de las tres.** La tabla de topes quedó escrita en la
  auditoría antes de cambiar una línea: `auditoria` 100
  (`AUDIT_LOG_PAGE_SIZE`), `errores` 200 (`ERROR_LOG_CAP`), `emails` 200
  (`EMAIL_LOG_CAP`), las tres ordenando por fecha descendente y ninguna
  declarando el borde.
- **`ba2` — los tres defectos que sólo aparecen midiendo.** `getErrorLogs`
  devolvía `total: entries.length` —un campo llamado `total` que significaba
  «mostradas»—; `bySeverity`/`bySource` se calculaban sobre **las filas
  devueltas** y se pintaban como tarjetas grandes del periodo; y el tope estaba
  escrito **dos veces**, con `200` en la constante y `100` suelto en la expresión
  que lo aplicaba.
- **`ba3` — el índice ausente, con `EXPLAIN`.** `email_logs` ordenaba por
  `sent_at DESC` sin índice que lo cubriera; `idx_email_logs_user_type
  (user_id, email_type, sent_at)` no servía porque el `user_id` delante
  descalifica el orden. Sobre 200 000 filas: **2 858 → 6 buffers (~476×)**.

**Oleada B — que cada bitácora diga lo que no muestra (`bb1`–`bb4`).**
- **`bb1` — `cap + 1` filas, pedidas a propósito.** La fila de más es la
  **sonda** que responde «¿hay más?» sin un `count(*)` que recorra la tabla. Sin
  ella, la UI no puede distinguir una bitácora de 100 filas de una cortada en
  100.
- **`bb2` — `total` deja de ser un sinónimo de `shown`.** Pasa a `number | null`
  y **nunca** se rellena con el largo de la página; el tipo lo impide. Donde no
  se pregunta el total, viaja `null`, que significa «no se preguntó».
- **`bb3` — `resumenDeCorte` se pinta siempre**, no sólo cuando `truncated`. Y
  las tres pestañas exportan CSV, así que el dato completo es alcanzable aunque
  la pantalla siga capada.
- **`bb4` — el tope aplicado es el que la UI declara.** El `100` suelto se
  convirtió en `ERROR_LOG_PAGE_DEFAULT`, con nombre y docstring.

**Oleada C — congelarlo (`bc1`–`bc2`).**
- **`bc1` — `src/lib/bitacora.ts`**, el vocabulario compartido: `PaginaCapada<T>`,
  `paginaCapada()`, `resumenDeCorte()`. Su comportamiento lo prueba
  `src/lib/bitacora.test.ts` (13).
- **`bc2` — `src/lib/bitacora-limites.contract.test.ts` (31)** congela cinco
  cosas por pestaña: el tope es una constante con nombre; **no hay un segundo
  tope sin nombre**; el tope se declara **una sola vez y en un archivo que puede
  declararlo**; la consulta pide `cap + 1`; y la pestaña declara el corte y
  ofrece export. **El perímetro se descubre del disco**, así que una cuarta
  bitácora sin declarar pone el contrato rojo.

**Oleada D — el backlog que envejeció (`bd1`–`bd2`).**
- **`bd1` — las filas `E7`, `E8` y `E9` ya estaban resueltas** por la Ronda 23.
  Reescritas a ✅ con la evidencia verificada en el código
  (`tool-guide.tsx:32-33`, `mobile-chrome.spec.ts:44-52`,
  `playwright.config.ts:46-62`) en vez de dejarlas en 🔜.
- **`bd2` — el prose obsoleto de la auditoría, corregido contra el código.** Tres
  afirmaciones de §3 estaban fuera de fecha: `pos` «nivel Diamante» (no se cobra
  en ningún nivel y la superficie abre en **Verde** sin candado); «de 10
  capacidades premium, 8 exigen Diamante» (re-medido: **5 Diamante / 3 Oro / 1
  Plata / 1 línea base**); y el `METHOD_LABEL` de `pedidos/page.tsx`.

**Lo que esta ronda desmintió.**

- **La nota del plan que decía que `foodos-reportes.ts` usa `t()` 35 veces era
  falsa.** `grep -c "\bt("` da **0**: no traduce nada. La afirmación «está en
  español fijo» **se sostiene** — y `src/lib/foodos.ts` tampoco importa i18n,
  porque sus `CHANNEL_LABELS` son literales.
- **«La clave `efectivo` no corresponde a ningún slug real» era falsa.**
  `efectivo` **sí** es un slug de `FoodosPaymentProofMethod`. El defecto real era
  otro y peor: la tabla estaba declarada **dos veces** —`Record<string, string>`
  en el panel, `Record<FoodosPaymentProofMethod, string>` en el micrositio—, así
  que añadir una forma nueva rompía el micrositio con un error de tipo y **no**
  el panel, que pintaba el slug crudo. Unificada en `PROOF_METHOD_LABELS`.
- **«El tope se aplicaba después del filtro» era falso, y lo escribí yo.** La
  `.limit()` se aplica antes de que la consulta se resuelva: el `LIMIT` es del
  SQL y el filtro también, así que «filtrar y cortar» ≡ «cortar y filtrar». El
  defecto inventado se sustituyó por **el real**, que apareció midiendo: **dos
  números para un solo tope**.
- **Las filas `E7`–`E9` del backlog ya estaban resueltas** y seguían listadas
  como 🔜. Un backlog que no se poda miente igual que una lista que no declara su
  borde.
- **Y un defecto que no era de datos sino de módulo:** los topes nuevos se
  declararon dentro de `src/lib/admin-errors.ts`, que empieza por `"use server"`
  — y un módulo `"use server"` **sólo puede exportar funciones asíncronas y
  tipos**. Lo cazó `src/lib/use-server.contract.test.ts`, no `tsc` ni ESLint.
  Ahora viven en `src/lib/bitacora.ts` y una regla impide que vuelvan.

| # | Entrega | Estado |
|---|---|---|
| BA1 | Estado real de las tres bitácoras medido y tabulado antes de tocar código | ✅ |
| BA2 | Los cuatro defectos de `getErrorLogs` identificados midiendo, no supuestos | ✅ |
| BA3 | Índice ausente de `email_logs` probado con `EXPLAIN (ANALYZE, BUFFERS)` (2858 → 6 buffers) | ✅ |
| BB1 | `cap + 1` filas en las tres consultas: la sonda que responde «¿hay más?» | ✅ |
| BB2 | `total` pasa a `number \| null` y deja de rellenarse con el largo de la página | ✅ |
| BB3 | `resumenDeCorte` en las tres pestañas y export CSV en las tres | ✅ |
| BB4 | El `100` suelto se convierte en `ERROR_LOG_PAGE_DEFAULT` con docstring | ✅ |
| BC1 | `src/lib/bitacora.ts` como vocabulario compartido, con test de comportamiento (13) | ✅ |
| BC2 | `bitacora-limites.contract.test.ts` (31) congela el borde y descubre el perímetro del disco | ✅ |
| BD1 | Filas `E7`–`E9` del backlog reescritas a ✅ con evidencia verificada | ✅ |
| BD2 | Prose obsoleto de §3 de la auditoría corregido contra el código | ✅ |

**Lección:** la misma que las tres rondas anteriores, un escalón más abajo. La
Ronda 23 encontró instrumentos que decían estar midiendo y no medían; la Oleada
C, un esquema que calla; la Oleada D, un nombre que hacía dos trabajos. Aquí es
**una lista que no declara su borde** — y la reparación volvió a ser la misma:
**escribir lo que no se ve**, no cambiar lo que se ve. La ronda no alteró una
sola pantalla en su comportamiento visible; cambió lo que las pantallas
**dicen**. Y dejó dos defectos autoinfligidos como recordatorio de por qué la
regla es medir antes de afirmar: un defecto inventado («el tope se aplica después
del filtro») que hubo que retirar, y dos constantes declaradas en un módulo que
no puede contenerlas.

**Cierre medido.** `npm run verify` en verde al cerrar las cuatro oleadas:
typecheck, lint, **373 archivos de test / 6,498 pruebas**, `knip` exit 0 — desde
los 370 / 6,445 de la Ronda 23 —53 pruebas más—. Dos contratos nuevos
(`bitacora-limites`, 31, y `foodos-labels`, 6), el de comportamiento
(`bitacora`, 13) y 3 pruebas añadidas a `foodos.test.ts` por la unificación de
`PROOF_METHOD_LABELS`. La migración
`00190_email_logs_sent_at_index.sql` quedó aplicada. La Ronda 24 queda
**cerrada**: las 11 filas `BA1`–`BD2` en ✅.

### Ronda 25 — La guía que dice dónde se consigue

**Origen.** Tras la Ronda 19 (auditoría de estatus) y las Rondas 20–24, quedaron
**8 todos abiertos** que se venían atribuyendo en bloque a «faltan credenciales
externas». Al preguntar **dónde se consiguen**, la premisa resultó **falsa en 3 de
los 8** — y mientras fuera falsa, el operador no podía ni empezar, porque no sabía
qué pedir, a quién, ni cuánto cuesta. El coste de la confusión era el mismo que el
de la falta de credencial: trabajo detenido.

**Oleada A — rastrear cada integración hasta su origen (`g1`, `g2`).** Nuevo
[`docs/CREDENCIALES.md`](CREDENCIALES.md): los 9 bloqueos, cada uno con **qué
desbloquea, dónde se consigue, cuánto cuesta y cómo se verifica**, y el orden
recomendado por coste. Tres correcciones medidas, no supuestas:
- **México sí está soportado por Stripe Connect.** `docs.stripe.com/connect/express-accounts`
  lista *México* entre los países cuyas cuentas Express se pueden crear; plataforma
  `MX` + cuentas `MX` es **misma región**, que es el requisito cuando no hay saldo
  transfronterizo. **`w1-connect-*` no estaba bloqueado por país** y no hace falta
  un PSP mexicano alternativo. (La doc de Express abre con un aviso de
  «funcionalidad obsoleta» hacia **Accounts v2**: deuda futura, no bloqueo.)
- **`w4-pos-escpos` no es un problema de credenciales.** `src/lib/foodos-printing/types.ts`
  documenta que `printers.ts` se borró **a propósito** por no tener consumidores, y
  los 6 adaptadores comerciales siguen `implemented: false` porque fingir una
  sincronización produce un menú desincronizado en silencio. Lo que falta es una
  **decisión de transporte**, no un secreto.
- **`w4-a11y` tampoco.** Es trabajo de código, ya cubierto por la Ronda 23 (ver
  su acta más abajo).
- **`w3-e2e-auth` no necesita un tercero.** El usuario de prueba se auto-provisiona
  en **tu propio Supabase** (`npm run admin create e2e@resurte.me`, `docs/OPS.md §8.2`),
  que imprime la contraseña una sola vez.
- **`w4-wallet` tiene, además del certificado, un bloqueo arquitectónico** que la
  credencial no resuelve: la firma de Apple invoca `openssl smime -sign`, y el
  propio `src/lib/foodos-wallet/apple.ts` declara que eso **no existe en
  serverless**. El camino barato es Google (3 valores obligatorios).

**Oleada B — punteros que no envejezcan (`g3`).** La guía se enlaza desde los tres
sitios donde alguien la buscaría: el blockquote de `docs/AUDITORIA-ESTATUS.md §7`
(tras las filas que «dependían de un tercero»), `docs/OPS.md §3` y la cabecera de
`.env.local.example`. **Decisión de forma:** dentro de `docs/` se cita por **nombre
de sección, nunca por número de línea** — la propia inserción de `g3` corrió
`OPS.md` +11 líneas y rompió dos citas numéricas el mismo día.

**Oleada C — el contrato que impide que envejezca (`g4`, `g5`).** Nuevo
`src/lib/credenciales.contract.test.ts`, **7 pruebas, 4 reglas bidireccionales**:
(1) toda integración de `src/lib/integration-status.ts` está documentada; (2) toda
variable nombrada en la guía existe de verdad, con excepciones **razonadas**
(`CFDI_*` propuestas, `POSTGRES_*` de plataforma); (3) los enlaces son `https` y
los `docsUrl` de POS coinciden con el registro; (4) todo path citado existe.

**Cada regla se probó con un sabotaje vivo antes de darla por buena**, y ahí estaba
el valor: **el sabotaje destapó un agujero propio.** La regla 3 comparaba con
`includes()`, es decir **por subcadena**, así que una guía que dijera
`https://developer.clip.mx/VIEJO/` **pasaba**, porque la URL buena es prefijo de la
mala. Ahora se comparan **URLs exactas**. Ocho sabotajes, ocho rojos: integración
sin documentar, variable fantasma, excepción sin razón, excepción que sobra, enlace
`http://`, `docsUrl` divergente, path inexistente, y la guarda de extracción
(un contrato que no encuentra nada no vigila nada).

**Lección:** la misma de las Rondas 23 y 24, un escalón más abajo. Allí fueron
instrumentos que decían medir y no medían; aquí es **una premisa que se venía
heredando sin comprobar** —«esto está bloqueado por credenciales»— y que al
medirla resultó falsa en 3 de 8 casos. Y la reparación volvió a ser la misma:
**escribir lo que no se ve**. La ronda no encendió una sola integración; cambió lo
que el repo **sabe** sobre ellas.

**Cierre medido.** `npm run verify` en verde: typecheck, lint, **374 archivos de
test / 6,505 pruebas**, `knip` exit 0 — desde los 373 / 6,498 de la Ronda 24, es
decir **+1 archivo y +7 pruebas, exactamente el contrato nuevo**. `docs/CREDENCIALES.md`
no declara ningún conteo a propósito: un documento que no afirma un número no puede
quedar obsoleto por él. Los 8 todos bloqueados quedaron reescritos con **su
credencial, su origen y su comando de verificación** (`g6`). Sin commit: el árbol
sigue siendo del usuario.

### Ronda 26 — El fortalecimiento, medido (y dos filas que mentían)

**Origen.** Al preguntar **cómo había quedado el fortalecimiento**, la respuesta no
estaba en la prosa: este documento llevaba cinco rondas de actas y el backlog había
ido cerrando filas **sin que ninguna acta dijera el total**. Así que la ronda empezó
**midiendo el backlog fila por fila** en vez de resumirlo, y el conteo salió limpio:
**de 23 trabajos en 5 oleadas, 17 cerrados**.

- **A — Accesibilidad del panel: 7/7 ✅** (Ronda 23).
- **B — El bug móvil: 3/3 ✅** (Ronda 23).
- **C — Memoria del CRM: 5/5 ✅** (`CRM1`–`CRM3` y `CRM5` en la Ronda 23; `CRM4` y
  `CRM6` en esta ronda).
- **D — El POS que se ofrece y no existe: 2/2 ✅** (Ronda 23).
- **E — Bloqueado por un tercero: 0/6 ejecutados 🔜** — y ese es el resultado
  **correcto**: la Ronda 25 convirtió una incógnita en una lista con nombre, precio y
  orden. Las 4 debilidades que siguen abiertas **no son deuda de código**: tres
  esperan una compra o una decisión, una espera un piloto.

**Oleada A — la deriva: dos filas describían un estado que ya no existe.** Medir, y
no leer, destapó que la documentación se había desincronizado de sí misma:
`docs/AUDITORIA-ESTATUS.md` seguía listando la **debilidad #9 (accesibilidad) como
abierta** cuando la Ronda 23 la había cerrado, y la fila `AU10` citaba los logs
`A14`–`A17` y `CX1`–`CX9` como «ya abiertos» **cuando las 9 filas `CX1`–`CX9` ya
estaban ✅**. Ninguna de las dos rompía una prueba: el texto no falla, se lee igual de
bien y el lector deja de confiar en él — el mismo modo de fallo que el resto de los
contratos, un escalón más arriba. Las dos quedaron corregidas, y el **§12 «Estado tras
la Ronda 25 — el fortalecimiento, medido»** de `docs/AUDITORIA-ESTATUS.md` fija el
conteo por oleada para que la próxima ronda no tenga que reconstruirlo.

**Oleada B — la memoria del CRM, hecha falsable (`CRM4`, `CRM6`).** Las dos filas
pedían lo mismo que `CRM5` ya había resuelto en la Ronda 24: **declarar, no
construir**.
- **`CRM6` — el motivo de pérdida no se puede exigir retroactivamente.** El hueco es
  **histórico** (anterior a la migración `00184`) y **no crece**, porque `crmClosePatch`
  lanza si falta el motivo y `src/app/admin/actions.ts` es su único llamador. Lo que
  faltaba no era un dato: era que la métrica **dijera su denominador**. Nuevo
  `src/lib/crm-loss-reason.contract.test.ts`, **14 pruebas**: el vocabulario, la
  **asimetría del `CHECK`** (que permite el `NULL` a propósito) y que el porcentaje por
  motivo se declare como **parcial**.
- **`CRM4` — la atribución de uso de columnas salió de grep de identificadores.** Una
  referencia **construida en runtime** podría escapar al inventario. La forma de
  volverlo falsable ya existía: los nombres de columna de `crm_prospects` **viven en un
  solo lugar** (`CRM_PROSPECT_COLUMN_SETS`, la escalera de degradación) y toda lista que
  llega a un `.select()` sale de ahí. Quedan **exactamente dos** sitios que construyen
  la lista a mano —`readLeadRow` y `buildQuery`— y
  `src/lib/crm-column-refs.contract.test.ts`, **10 pruebas**, los declara, cuenta y
  resuelve: un tercero, o uno alimentado por algo que no sea el vocabulario, lo pone en
  rojo. Ambas reglas se probaron con **sabotaje vivo** antes de darlas por buenas.

**Oleada C — el veredicto de `E11`: el footer es inocente y el rojo era una carrera
del propio test.** La fila pedía aislar `src/components/layout/footer.tsx` contra el
test que había fallado en CI. El diff medido de ese archivo en el commit rojo es
**solo clases Tailwind** (`pt-8→pt-6`, `gap-*` reducidos, `mb-2→mb-1`, `mt-3→mt-2
sm:mt-3`) más borrar «— Central de Abastos Digital» del copyright: **cero JavaScript,
cero estado, cero listeners**, y `git diff <commit rojo> HEAD -- footer.tsx` sale
**vacío**. El listener del carrito vive en `cart-drawer.tsx` y `layout.tsx` lo monta
**como hermano** del footer. Lo que fallaba era el test: usaba como señal de apertura el
texto «🔥 Restaurantes también compran», que **solo se pinta con el carrito no vacío**,
de modo que **dos condiciones compartían una señal**; y como el evento es un **toggle**,
despachar a ciegas podía cerrar el drawer que el intento anterior acababa de abrir. El
bucle oscilaba y su error final acusaba al drawer tanto si no había abierto como si el
carrito aún no había hidratado. **La señal correcta ya existía y se estaba ignorando**:
el drawer se **desmonta** al cerrar (`if (!isOpen) return null`), así que el propio
`role="dialog"` es su señal de apertura. Verificación: el spec completo
`e2e/checkout-drawer.spec.ts` en **26/26**, con el **mismo `footer.tsx`** de la corrida
roja.

**Tres lecciones, todas de la misma familia — un instrumento que dice medir y no mide.**
1. **`next build` typechea, y el `webServer` del e2e corre `build:e2e` = `next build`.**
   Un solo error de `tsc` **mata el run entero de Playwright antes del primer test**
   (`Failed to type check.` → `Process from config.webServer was not able to start`).
   Y **`vitest` no typechea**: un contrato nuevo puede estar verde en vitest y romper el
   e2e. De ahí que `verify` empiece por el typecheck — y de ahí la disciplina de correr
   `npm run typecheck` **antes** de cualquier Playwright.
2. **Un tipo más estrecho que su fuente es un lugar donde esconder un caso.**
   `crmProspect()` devuelve la fila **ya tipada**, pero el `CHECK` asimétrico permite que
   la base traiga un motivo fuera del vocabulario o sin la columna. Escribir esos casos
   **obliga a castear**, y **el casteo es la prueba de que el tipo no se ensanchó** para
   tapar el hueco.
3. **Un componente que se desmonta al cerrar es su propia señal de apertura**, y un
   evento **toggle** exige un reintento **idempotente**. Esperar un texto del contenido
   conflaciona «no abrió» con «todavía no tiene datos»; esperar el `role="dialog"` no.

**Cierre medido.** `npm run verify` en verde: typecheck, lint, **376 archivos de test /
6,529 pruebas**, `knip` exit 0 — desde los 374 / 6,505 de la Ronda 25, es decir
**+2 archivos y +24 pruebas, exactamente los dos contratos nuevos** (14 + 10). El
fortalecimiento no encendió ninguna capacidad: Wallet sigue en 501, POS sigue
`implemented: false`, el cron sigue fail-closed sin su secreto. Lo único que cambió es
**lo que el repo sabe sobre sí mismo**. Sin commit: el árbol sigue siendo del usuario.

### Ronda 27 — El entorno que se borraba solo

**Origen.** *«Necesito tener mis env keys y no las tengo actualmente»*. `.env.local`
era un volcado de `vercel env pull`, y **21 variables estaban en `[SENSITIVE]`**: la
CLI de Vercel no puede descifrar las marcadas como *Sensitive*, así que escribe ese
literal en vez del valor. La app arrancaba igual, y las fallas aparecían después
disfrazadas de 404, de estado vacío o de 401 opaco — exactamente los síntomas que
`docs/OPS.md §3` ya documentaba para las dos variables que se habían reparado a mano
el 17-sep.

**El diagnóstico: perder las llaves fue el daño; que entrara en silencio fue el
problema.** `[SENSITIVE]` **es una cadena con contenido**, así que todo guarda de
«¿existe?» la da por buena. Y ahí estaba el hueco real:
`src/lib/supabase/env.ts` **ya tenía el guarda correcto** —un `PLACEHOLDERS` con
`[SENSITIVE]`, `your-project-url` y compañía, más un `isUsable()`— pero **solo lo
usaban la URL y la anon key**. El tercer consumidor, `createServiceClient()`,
validaba `!url || !serviceRoleKey` en crudo: construía un cliente con una llave
falsa y la falla salía como 401 —o como un problema de RLS— en vez de como «falta
configurar el entorno». `price-index-refresh.ts` comprobaba veracidad por el mismo
camino. **La regla existía y no llegaba a todos sus consumidores**, que es un modo
de fallo distinto de «la regla no existe» y más difícil de ver: el archivo con el
guarda está bien escrito y su lectura da confianza.

**Lo que se añadió.**
- `supabaseServiceKey()` en `src/lib/supabase/env.ts`, reutilizando el guarda que ya
  estaba ahí, y usada por `service.ts` y `price-index-refresh.ts`.
- **`npm run env:doctor`** (`scripts/env-doctor.mjs`): clasifica cada variable en
  *ok / vacía / placeholder*, avisa si `NEXT_PUBLIC_SUPABASE_URL` apunta al proyecto
  de producción, distingue las cinco llaves que **no se recuperan de ningún panel**
  (se muestran una sola vez) y sale con código 1 si queda un `[SENSITIVE]`. **Nunca
  imprime un valor**, y funciona igual en la máquina y dentro de un sandbox, porque
  lee `.env.local` cuando existe y el entorno inyectado cuando no.
- **`src/lib/deploy-env.ts`** + `robots.ts` + `stripe.ts`: los tres guardarraíles del
  apartado siguiente.

**La pregunta que trajo el resto: cómo editar desde el celular sin filtrar
producción.** La intención era cargar las llaves en un builder de terceros. Ahí el
`service_role` bypassa RLS por diseño (pedidos, direcciones y datos de clientes) y
una llave live de Stripe cobra de verdad, así que la respuesta no podía ser «comparte
las llaves»: es **un staging con llaves propias**. De ahí `isProductionDeploy()`
—`VERCEL_ENV === "production"`, que Vercel inyecta por su cuenta, de modo que **solo
producción se identifica positivamente**— y sus dos consumidores: `robots()` devuelve
`disallow: "/"` fuera de producción, y `getStripe()` **rechaza** una llave `sk_live_…`
fuera de producción, con `ALLOW_LIVE_STRIPE=1` como válvula explícita para la máquina
del desarrollador. Los dos fallan hacia el lado seguro: un entorno que no se
identifica **no indexa y no cobra**.

**Una comprobación que ahorra un callejón.** `npx supabase projects list` —read-only—
revela que la organización ya tiene **2 proyectos activos** (`Hustle Alliance` y
`Resurte.me`), que es justo el tope del plan Free. El runbook lo dice **antes** del
primer comando, no después del error: el staging exige liberar un cupo (pausar o
borrar el que no se use) o pasar a un plan de pago.

**Una alarma que era falsa.** `docs/OPS.md §3` y `docs/CREDENCIALES.md §0` abrían con
una rotación urgente: que `supabase/.temp/pooler-url` había estado versionado en un
repositorio público **con la contraseña de `postgres` en claro**. Verificado el
historial, **hay un solo blob y no lleva contraseña** (92 bytes:
`postgresql://postgres.<ref>@aws-0-us-east-2.pooler.supabase.com:5432/postgres`); lo
que expone es el host del pooler y el usuario, que revelan un *project ref* ya público
porque viaja en `NEXT_PUBLIC_SUPABASE_URL`. Las dos guías quedaron corregidas con el
comando que lo comprueba. La regla de no versionar `supabase/.temp/` ni `.env*` sigue
igual: nunca dependió de que ese archivo llevara un secreto.

**Tres lecciones.**
1. **Un guarda que no llega a todos sus consumidores no es un guarda.** El fallo no
   estaba en la lógica de `env.ts`, que era correcta, sino en que dos módulos leían
   `process.env` por fuera. Cuando un guarda vive en una función y no en el dato, cada
   consumidor nuevo es una oportunidad de saltárselo.
2. **El valor centinela de una plataforma es un valor verdadero.** `[SENSITIVE]` es
   lo que la herramienta escribe *en lugar de* un secreto, y para cualquier `if` es
   simplemente una cadena no vacía. Los centinelas hay que tratarlos como ausencia,
   no como dato.
3. **Recuperar no es rotar.** Copiar de un panel no cambia nada en producción; rotar
   sí. Y `SUPABASE_JWT_SECRET` es la única llave que **no** admite rotación sin
   downtime (mata todas las sesiones y desvalida las llaves legacy), mientras que
   `POSTGRES_PASSWORD` —la que la guía marcaba como urgente— resulta la más barata de
   todas, porque el código **nunca** lee `POSTGRES_*`.

**Cierre medido.** `npm run verify` en verde: typecheck, lint, **380 archivos de test /
6,551 pruebas**, `knip` exit 0 — desde los 376 / 6,529 de la Ronda 26, es decir **+4
archivos y +22 pruebas, exactamente los cuatro contratos nuevos** (`supabase/env`,
`deploy-env`, `stripe`, `app/robots`). Los 6 rojos intermedios fueron de
`ai-crawlers.test.ts`, que vigila el robots.txt **de producción** y ahora lo declara
(`VERCEL_ENV=production` en el `beforeEach`) en vez de depender del entorno de quien
corre las pruebas. Sin commit: el árbol sigue siendo del usuario.

## Agentes de mantenimiento por dominio

Ver `docs/agents/` — perímetro, invariantes y verificación por feature.
