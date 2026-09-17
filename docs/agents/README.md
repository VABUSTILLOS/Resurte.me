# Agentes de dominio — Resurte.me

Cada playbook define el **perímetro** de un agente de mantenimiento: qué archivos
posee, qué invariantes no puede romper y cómo verificar su trabajo. Un agente solo
toca su dominio; los cambios compartidos (globals.css, layout.tsx, toast, cart-context)
requieren revisar todos los playbooks que dependen de esa superficie.

| Agente | Playbook | Superficie principal |
|---|---|---|
| Catálogo | [catalogo.md](catalogo.md) | `src/components/product`, `src/components/city`, `src/components/search`, `src/app/[slug]`, `src/app/catalogo` |
| Checkout y pagos | [checkout.md](checkout.md) | `src/components/cart`, `src/components/checkout`, `src/contexts/cart-context.tsx`, `src/app/api/orders`, `src/app/api/payments` |
| Recompensas | [recompensas.md](recompensas.md) | `src/app/recompensas`, `src/lib/wallet-actions.ts`, `src/app/api/redeem` |
| Panel | [panel.md](panel.md) | `src/app/panel`, `src/components/panel`, `src/hooks/use-*`, `src/lib/panel-*` |
| Admin | [admin.md](admin.md) | `src/app/admin`, `src/app/api/admin`, `src/lib/admin-*` |
| UX móvil global | [ux-movil.md](ux-movil.md) | `src/app/globals.css`, `src/app/layout.tsx`, `src/components/layout`, `src/components/toast.tsx`, `src/components/pwa`, `public/sw.js` |
| Punto de venta y comandero | [pos-mesas.md](pos-mesas.md) | `src/app/panel/foodos/{mostrador,mesas,caja,tablero,pedidos}`, `src/lib/foodos-{order-create,cash,tables,payments,reportes,shift,owner,printing}`, `src/lib/panel-roles.ts` |

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
   `@media (prefers-reduced-motion: reduce)` de `globals.css`.
5. **Verificación mínima antes de commit**: `npx tsc --noEmit`, `npm run lint`,
   `npm test` y `npm run build`.
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

## Sin agente asignado: cuenta y autenticación

`src/app/auth/**`, `src/components/auth/**`, `src/lib/supabase/**` y
`src/lib/passkeys.ts` (fase U del plan) no pertenecen a ninguno de los siete
perímetros. **Todos** los agentes dependen de ellos, porque todos asumen una
sesión: `createClient()` devuelve `null` sin configuración y los consumidores
hacen `if (!supabase) return`. Antes de tocarlos, revisar los siete playbooks.
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
