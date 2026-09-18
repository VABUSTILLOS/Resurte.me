# Agentes de dominio — Resurte.me

Cada playbook define el **perímetro** de un agente de mantenimiento: qué archivos
posee, qué invariantes no puede romper y cómo verificar su trabajo. Un agente solo
toca su dominio; los cambios compartidos (globals.css, layout.tsx, toast, cart-context)
requieren revisar todos los playbooks que dependen de esa superficie.

> **El núcleo del CRM es compartido.** Desde la Ronda 10, `src/lib/crm-core.ts`,
> `src/lib/crm-prospects.ts`, `src/lib/crm-conversation.ts`,
> `src/components/crm/ProspectDetailDrawer.tsx` y
> `src/components/crm/ConversationPanel.tsx` los consumen **dos** agentes: Admin
> (`/admin/leads`) y Comercialización (`/comercializacion`). Tocarlos exige leer
> [admin.md](admin.md) **y** [comercializacion.md](comercializacion.md).
> `src/lib/crm-reader.contract.test.ts` mantiene la lista exacta de quién lee
> `crm_prospects`, y `src/lib/crm-writers.contract.test.ts` —desde la Ronda 11—
> la de quién **escribe** en el CRM: cada escritura tiene que tener un consumidor
> de producción, y el archivo de acciones del admin no puede volver a la
> allowlist de `knip`.

| Agente | Playbook | Superficie principal |
|---|---|---|
| Catálogo | [catalogo.md](catalogo.md) | `src/components/product`, `src/components/city`, `src/components/search`, `src/app/[slug]`, `src/app/catalogo` |
| Checkout y pagos | [checkout.md](checkout.md) | `src/components/cart`, `src/components/checkout`, `src/contexts/cart-context.tsx`, `src/app/api/orders`, `src/app/api/payments` |
| Recompensas | [recompensas.md](recompensas.md) | `src/app/recompensas`, `src/lib/wallet-actions.ts`, `src/app/api/redeem` |
| Panel | [panel.md](panel.md) | `src/app/panel`, `src/components/panel`, `src/hooks/use-*`, `src/lib/panel-*` |
| Admin | [admin.md](admin.md) | `src/app/admin`, `src/app/api/admin`, `src/lib/admin-*` |
| UX móvil global | [ux-movil.md](ux-movil.md) | `src/app/globals.css`, `src/app/layout.tsx`, `src/components/layout`, `src/components/toast.tsx`, `src/components/pwa`, `public/sw.js` |
| Punto de venta y comandero | [pos-mesas.md](pos-mesas.md) | `src/app/panel/foodos/{mostrador,mesas,caja,tablero,pedidos}`, `src/lib/foodos-{order-create,cash,tables,payments,reportes,shift,owner,printing}`, `src/lib/panel-roles.ts` |
| Comercialización (CRM del vendedor) | [comercializacion.md](comercializacion.md) | `src/app/comercializacion`, `src/lib/comercializacion`, `src/components/comercializacion` |

## Reglas comunes a todos los agentes

1. **No romper el prerender estático**: ninguna página pública puede leer `cookies()`/
   `headers()` (convierte la ruta en SSR por request y dispara el Fluid CPU de Vercel).
2. **Móvil primero**: todo control interactivo respeta 44px (`touch-target`), safe-area
   insets y `overscroll-contain` en superficies con scroll propio.
3. **Colisiones del rail inferior**: cualquier flotante nuevo usa
   `--floating-bottom-offset` y registra su clase de colisión en `globals.css`
   (patrón `body.cart-bar-active`, `body.has-bottom-tab`, `body.has-panel-bottom-nav`,
   `body.cookie-consent-visible`, `body.has-sticky-atc`).
4. **Reduced motion**: toda animación nueva entra en el bloque
   `@media (prefers-reduced-motion: reduce)` de `globals.css`. El bloque cubre
   **CSS**, no JavaScript: una animación dirigida por `framer-motion` esquiva el
   bloque entero y necesita `<MotionConfig reducedMotion="user">` envolviendo el
   subárbol (patrón en `src/app/recompensas/page.tsx`). Para los valores
   arbitrarios (`animate-[fadeUp_0.15s_ease-out]`) no hay nombre que listar, así
   que el bloque lleva un `[class*="animate-["]` de captura. La guardia es
   `npx vitest run src/lib/a11y-static.contract.test.ts` (R5 para clases CSS, R6
   para `framer-motion`); el bloque existe desde antes, pero hasta la Ronda 13
   nadie medía qué clases se usaban de verdad contra las que estaban listadas, y
   `animate-pulse`/`animate-ping`/los `animate-[…]` se habían escapado.
5. **Verificación mínima antes de commit**: `npm run verify` —que encadena
   `npm run typecheck`, `npm run lint`, `npm test` y `npm run knip`— más
   `npm run build`, que se deja aparte por latencia. **Son los mismos scripts
   que corre el pipeline** (CI los declara como pasos separados para poder
   atribuir el rojo a un gate concreto, y `src/lib/ci-config.contract.test.ts`
   falla si invoca un `npm run X` que no existe). Mientras la invariante decía
   `npx tsc --noEmit` y CI invocaba `npx tsc --noEmit` pero el desarrollador
   tecleaba otra cosa, la lista era una promesa **sin ejecutor** (no existía
   script `typecheck`, ni `verify`, ni `.githooks/`, ni `core.hooksPath`) y el
   resultado se medía en los dos sitios a la vez: de 22 corridas rojas de
   `verify`, **8** murieron en `Lint` y **2** en `Typecheck`. Es el mismo
   corolario de la invariante 11 —**medir con un comando distinto es medir otra
   cosa**—. El ejecutor local es `.githooks/pre-push`, que **avisa y no
   bloquea** (ver `docs/OPS.md` §12).
6. **Accesibilidad**: diálogos con foco inicial + Escape + `aria-modal`; cambios de
   estado anunciados con `aria-live`; iconos decorativos con `aria-hidden`.
7. **Ninguna frontera `loading.tsx` por encima de un `notFound()` posterior a un
   `await`**: el fallback hace flush del shell y el 404 queda congelado como 200
   (soft-404 indexable). El guard va en el `layout.tsx` del mismo segmento —que
   queda fuera de su propia frontera— o se elimina la frontera. Consecuencia
   aceptada al corregir el micrositio: al borrar `src/app/loading.tsx` el sitio
   perdió el esqueleto **global** de carga. Si se quiere de vuelta, va **por
   segmento o dentro de un route group**, nunca en la raíz. Excepción conocida:
   `/panel/foodos/pedidos/[id]/print` (bajo `src/app/panel/loading.tsx`).
8. **El día local tiene una sola autoridad**: `src/lib/local-date.ts`
   (`DEFAULT_TIMEZONE`, `dayKeyOf`, `localDateParts`, `toDatetimeLocalValue`).
   Nunca se deriva un día de negocio con `toISOString().slice(0, 10)` ni con
   `toLocaleDateString("en-CA")` sin `timeZone`: ambos leen la zona del
   **runtime**, y a partir de las 18:00 de México (medianoche UTC) devuelven
   **mañana**. Ese defecto llegó a producción en el checkout —el selector
   ofrecía "Hoy" y agendaba la entrega para el día siguiente, toda la cena— y
   después en 20 sitios más. Las excepciones legítimas (validación round-trip,
   clave ISO de semana, `reportTo` del reporte de ventas, prefijo de Storage)
   están declaradas con su motivo en `src/lib/local-date.contract.test.ts`, que
   **falla si aparece un sitio nuevo sin justificar**. Los recortes de
   `toISOString()` sin recorte (`created_at`, `sent_at`, `expires_at`) son
   timestamps de auditoría y **no se tocan**.
9. **Todo spec e2e corre en CI, o no existe**: `npm run test:e2e` es
   `playwright test --grep @ci`, así que un spec sin la etiqueta **existe en el
   repo y nunca se ejecuta**. Ese agujero escondió cuatro archivos completos
   —84 tests, un tercio de la evidencia móvil— que al encenderlos estaban
   obsoletos y en rojo: asertaban UI que ya no existía, y uno de ellos
   (`redeem.spec.ts`) creía mockearse con `page.route` cuando su propia
   petición salía por `page.request.post()`, que **no pasa por ese interceptor**.
   La etiqueta va en el header del `describe` (los `test` hijos la heredan); un
   spec que solo aplica a un project se auto-excluye con
   `test.skip(({ isMobile }) => !isMobile)`, no dejándolo sin etiqueta.
   `src/lib/e2e-specs.contract.test.ts` **falla** si aparece un spec o un
   `describe` de nivel superior sin `@ci`, o si el script deja de filtrar.
   Corolario: **un `@ci` que pasa porque se saltó no es cobertura** — los tests
   que dependen de sesión o de datos reales se saltan solos, y en CI no hay
   ninguno de los dos.
10. **Todo flotante inferior declara su colisión**: un elemento `fixed` anclado
   al rail (`bottom-[var(--floating-bottom-offset)]` y compañía) con
   **`z >= 60`** se pinta por encima del banner de cookies (`z-[60]`) y puede
   interceptar el tap de "Aceptar todas". El pill de la guía del panel
   (`z-[85]`) lo hacía: el usuario móvil del panel **no podía consentir**, y el
   fallo llevaba documentado como "ajeno al plan" desde hacía varias rondas.
   Todo flotante de esa franja o bien lleva una clase semántica **y** aparece en
   una regla `body.cookie-consent-visible .<clase>` de `globals.css`, o bien
   declara su exención **con motivo escrito** (un `z` igual no intercepta: el
   banner se renderiza al final de `layout.tsx` y gana el empate por orden de
   DOM). `src/lib/floats.contract.test.ts` **falla** si aparece un flotante sin
   decidir o si una clase declarada como oculta no está en el CSS.
11. **Todo gate de CI está verificado y verde, o no está en CI**: un paso que
   lleva rojo permanente no protege de nada — entrena a ignorar el resultado, y
   su rojo deja de distinguirse del rojo ajeno. `knip` estuvo así desde que se
   añadió al pipeline: **479 hallazgos** y nadie mirándolo, porque la causa
   estaba en la **configuración** (`--production` oculta todo lo que solo
   consumen los tests; sin `ignoreExportsUsedInFile`, cada símbolo usado dentro
   de su propio módulo y cada colisión de nombre entre módulos cuentan como
   hallazgo) y no en el código. Corolario: **medir con un flag que el
   desarrollador no usa es medir otra cosa** — CI y local invocan el mismo
   script. `src/lib/knip-config.contract.test.ts` **falla** si la allowlist crece
   sin justificación escrita, si una justificación queda huérfana, si se suprime
   un archivo entero en vez de un export, o si el paso de CI vuelve al flag.
   Matiz que conviene recordar antes de atribuirse un rojo: `knip` analiza el
   **working tree**, no `HEAD`, así que su recuento depende de lo que haya sin
   commitear; lo que el contrato fija es la configuración.
12. **Todo pipeline declara su concurrencia y su orden de gates, o mide otra
   cosa**: un workflow sin `concurrency` no solo desperdicia minutos —**cancela
   evidencia**. Medido sobre 99 corridas: **33** arrancaron a menos de 180 s de
   la anterior, mientras el job `e2e` tarda **155–244 s**; el resultado fue
   **13 cancelaciones de 40** (`##[error]The operation was canceled.` a los
   ~91 s, muy por debajo de su `timeout-minutes: 25`), y una cancelación se
   reporta igual que un fallo. La coincidencia con el solape (**32,5 %** vs
   **33 %**) descartó las hipótesis de contenido: el job `e2e` pasaba **25 de
   40** con **exactamente el mismo `env`**, así que le faltaba un candado, no
   una variable. Y el **orden** es la otra mitad: con `Knip` antes de `Build`,
   `Build` **nunca llegó a ejecutarse** en CI —aparecía como `-` en todos los
   listados de pasos—, de modo que el gate más caro del repo llevaba quién sabe
   cuánto sin medir nada mientras el pipeline parecía tenerlo. Un paso que no
   puede llegar a correr no es un gate. `src/lib/ci-config.contract.test.ts`
   **falla** si desaparece `concurrency`, si deja de cancelar, si el grupo pierde
   `github.ref`, si un `npm run X` del workflow apunta a un script inexistente,
   si vuelve `npx tsc --noEmit` o `knip --production` a una línea `run:`, si
   `Build` sale de su sitio (después de los tests, antes de `Knip`), si una
   variable `env:` no está documentada en `.env.local.example`, si `test:e2e`
   pierde `--grep @ci`, si el hook de pre-push deja de ser ejecutable o gana
   `exit 1`/`set -e`, o si se reintroduce un gestor de hooks que bloquee
   (`husky`, `lint-staged`, `simple-git-hooks`, script `prepare`).

13. **Una migración "aplicada" no prueba que su efecto exista**: el historial de
   migraciones es una *afirmación*, y en este repo llegó a ser falsa. Comparar el
   cuerpo **desplegado** de cada función contra el que la migración declara
   (md5 del texto normalizado) dio **45 de 47 coincidencias y 2 drifts reales**:
   `process_cashback_for_order` (`00029`) y `redeem_service` (`00035`) figuraban
   como aplicadas sin haber aterrizado. El primero era grave —producción corría
   el cuerpo viejo, con las tablas sin calificar y `search_path = ''`— y
   reventaba con `42P01` **todo `INSERT` de pedido con `total >= 2500`**: el
   checkout devolvía HTTP 500 para todo carrito grande, y además acreditaba
   cashback real **antes** de que el cliente pagara. Restaurados en `00147` y
   `00148`. Tres corolarios de método, porque el primer barrido reportó **18
   drifts** y 16 eran artefactos: (a) **en Postgres `.` coincide con el salto de
   línea**, así que `regexp_replace(prosrc, '--.*', '', 'g')` borra desde el
   primer comentario hasta el **final del cuerpo**; hace falta la bandera `'gn'`;
   (b) `btrim` va **después** de colapsar `[[:space:]]+`, o queda un espacio
   inicial; (c) `prosrc` es solo el cuerpo —firma, `LANGUAGE`, `SET` y `SECURITY`
   viven en `pg_proc.proconfig`—. Y para escribir la corrección, **empalmar es
   más seguro que reescribir**: `sed -n 'A,Bp' origen.sql` y verificar que el md5
   del cuerpo empalmado coincide.
   Los guards que evitan que esto vuelva van **dentro de las migraciones**, no en
   un contrato de test, y fallan la migración entera:
   * **`search_path` vacío**: ninguna función `public` con `search_path=''` puede
     referenciar una tabla sin calificar el esquema. Corrió 7 pares ofensores
     antes de `00147` y devuelve **vacío** desde entonces (`00147`, `00148`,
     `00149`, `00150`).
   * **`RETURNS TABLE` que no emite fila**: en plpgsql, un `RETURN;` desnudo en
     una función `RETURNS TABLE` (= `SETOF record`) **no emite ninguna fila**;
     hace falta `RETURN NEXT;`, que emite pero **no termina**, así que una salida
     temprana necesita **ambos**. `redeem_service` cerraba sus cuatro salidas con
     `RETURN;` desnudo: debitaba la wallet, insertaba la transacción, creaba el
     canje y devolvía **cero filas**, de modo que el llamador —que lee
     `data?.[0]`— mostraba "No se pudo completar el canje" **después** de que el
     saldo ya se había ido. Pérdida silenciosa de saldo, y el mensaje invitaba a
     reintentar. Era **anterior a todo el trabajo de la Fase C** y la **única**
     de 800 funciones `public` con ese patrón. El guard de `00149` lo detecta
     (probado en seco: devuelve exactamente `redeem_service`).

14. **Toda ruta admin que muta negocio deja fila en `admin_audit_log`**: de las 32
   rutas admin con export mutante, **17 no escribían nada**. Entre las que
   faltaban había dos que mueven dinero (`facturas` abona créditos de monedero,
   `reward-services` fija el costo en créditos de un servicio canjeable) y dos que
   cambian precios de checkout (`bump-rules`, `discount_pct`). La bitácora es el
   **único** registro de quién cambió un precio, quién otorgó créditos y quién
   activó un repartidor: sin esa fila, una discrepancia de saldo no tiene
   respuesta. Reglas:
   * `logAdminAction` es **best-effort por diseño** (su `try/catch` interno se
     traga todo). Se llama con `await logAdminAction(supabase, {...})` a secas,
     **sin `try/catch` local**: envolverlo sugiere que el helper es inseguro y
     contradice las 18 llamadas previas del repo.
   * `detail` es `Record<string, unknown> | undefined`, así que `detail: null` es
     error de tipo: se **omite la clave**, no se pone `null`.
   * Cuando el cambio es de **precio**, la fila registra el **valor anterior**
     (`previous_cost`, `previous_discount_pct`): un `action` sin contexto no sirve
     para reconstruir el cambio.
   * Las rutas que mutan sin sesión de admin —`orders/[id]/cancel`, que
     autentica por el token del propio pedido— escriben con `actorId: null` y el
     motivo en `detail.via` (`"token"`). La ausencia de actor es honesta; la
     ausencia de fila no.
   * Las excepciones están en `src/lib/admin-audit.contract.test.ts` con motivo
     escrito, y ese contrato **falla** si aparece una ruta mutante nueva sin
     auditar o si una exención queda obsoleta. `orders/[id]/status` **no** es una
     excepción: escribe en `admin_audit_log` (`:204`, `:214`) **y** en
     `notifications` (`:279`, `:287`) a propósito — libro de admin y espejo del
     cliente son audiencias distintas.

15. **El ciclo de vida de un canje lo mueve `advance_redemption()` y nadie más.**
   Un canje gasta créditos reales, así que el estado y el dinero tienen que
   moverse juntos o no moverse. Reglas:
   * **Ninguna otra función escribe `redemptions.status`** (guard de `00151`) y
     **ninguna ruta lo hace con un `update` directo**: todas pasan por
     `advanceRedemption()`. Un `update` suelto se saltaría la bitácora, el
     reembolso y las transiciones válidas a la vez.
   * `requested → {in_progress, cancelled}`, `in_progress → {delivered, cancelled}`,
     `delivered` y `cancelled` son terminales. Un estado terminal responde **409**
     antes de tocar el saldo, no después.
   * El reembolso es **idempotente por `refunded_at IS NULL`**: repetir la
     cancelación no devuelve los créditos dos veces. `changed = false` en la salida
     significa "ya estaba así" y la interfaz lo dice así; `ok = true` con
     `changed = false` **no** es un éxito que se pueda anunciar.
   * `advance_redemption` es `SECURITY DEFINER`, `search_path = ''` y
     **service_role-only**; recibe el `id` por parámetro y **no comprueba dueño**.
     Por eso toda ruta de cliente verifica la propiedad **en el predicado**
     (`.eq("id", …).eq("user_id", …)`), no después de leer.
   * El brief del cliente se valida **antes** de debitar: un dato obligatorio que
     se valida después del cobro no es obligatorio. Guardarlo es best-effort —un
     fallo al persistirlo no revierte el canje— porque el brief es contexto y el
     débito es el hecho.
   * `src/lib/redemptions.contract.test.ts` compara la máquina de estados de
     TypeScript contra el SQL de `00152` (matriz, vocabulario, bloque de
     reembolso y ACL) y **falla si dejan de coincidir**. Si cambias una transición,
     cambia las dos o la prueba te detiene.
   * Los plazos (`reward_services.sla_days`) se anuncian **antes** de la compra.
     No existe devolución automática por incumplimiento de SLA: no prometerla.

16. **Un artefacto de bucket privado se guarda como ruta, se sube antes de la
   transición que lo referencia, y su fallo nunca bloquea esa transición.**
   Aplica a los comprobantes de entrega del marketplace (`orders.delivery_proof_*`,
   `00154`) y es el mismo criterio del comprobante de FoodOS.
   * Se persiste la **ruta** del objeto, jamás una URL firmada: una URL caduca y
     quedaría guardada muerta. La firma es un acto de lectura
     (`createSignedUrl`, 3600 s) y sólo la hace una ruta de servidor.
   * La foto **respalda, no autoriza**: subirla no cambia `orders.status` y no es
     requisito para marcar `delivered`. Si bloqueara el cierre, se subiría
     cualquier cosa con tal de desbloquearse. Un pedido `cancelled` sí rechaza el
     comprobante con **409** — aceptarlo sería una contradicción.
   * Al reemplazar, el objeto anterior se borra **después** de que la base apunte
     al nuevo; si el `update` falla, se borra el objeto recién subido, no el
     vigente. Un borrado a ciegas nunca toca una ruta que no sea del propio
     espacio de nombres (`isMarketplaceProofPath`).
   * La coherencia la impone la base: o las tres columnas son `NULL`, o hay ruta
     **y** fecha. Una nota sin foto no significa nada.
   * El comprobante es visible para el admin y para el cliente por el
     *capability token* del pedido (`?t=<restore_token>`), además de por sesión de
     dueño o de admin. La ruta de lectura responde `404` genérico, limita por IP
     y nunca devuelve la ruta del objeto.


## Sin agente asignado: cuenta y autenticación

`src/app/auth/**`, `src/components/auth/**`, `src/lib/supabase/**` y
`src/lib/passkeys.ts` (fase U del plan) no pertenecen a ninguno de los ocho
perímetros. **Todos** los agentes dependen de ellos, porque todos asumen una
sesión: `createClient()` devuelve `null` sin configuración y los consumidores
hacen `if (!supabase) return`. Antes de tocarlos, revisar los ocho playbooks.
Reglas propias de esta superficie:

1. `src/lib/supabase/client.ts` enciende `auth: { experimental: { passkey: true } }`.
   Quitarlo no rompe el build: rompe **al llamar** a `signInWithPasskey` /
   `auth.passkey.*`. Lo cubre un test de contrato en `src/lib/passkeys.test.ts`.
2. La detección de capacidades del navegador (WebAuthn, push) se hace con
   `useSyncExternalStore`, no con `useState` + `useEffect`: el servidor debe
   pintar `false` sin desajuste de hidratación, y la regla
   `react-hooks/set-state-in-effect` lo prohíbe.
3. Las reglas puras de passkeys (etiqueta, fecha, validación, mapeo de errores a
   español) viven en `src/lib/passkeys.ts`. La UI no las reimplementa.
4. Ningún error de WebAuthn se suprime salvo el aborto explícito: `NotAllowedError`
   cubre tanto "cerré la ventana" como "este dispositivo no tiene ninguna llave" y
   merece copy según el flujo (`passkeyErrorMessage(err, flow)`).
