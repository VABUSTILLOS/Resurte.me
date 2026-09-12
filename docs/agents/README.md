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
| UX móvil global | [ux-movil.md](ux-movil.md) | `src/app/globals.css`, `src/app/layout.tsx`, `src/components/layout`, `src/components/toast.tsx` |

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
