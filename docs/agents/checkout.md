# Agente: Carrito, checkout y pagos

## Posee
- `src/components/cart/**` (drawer, MobileCartBar, FreeShippingProgress)
- `src/components/checkout/**` (CheckoutDrawer, steps, bumps, upsell)
- `src/contexts/cart-context.tsx`
- `src/app/api/orders/**`, `src/app/api/payments/**`, `src/lib/payments.ts`,
  `src/lib/checkout-config.ts`, `src/lib/order-bumps.ts`

## Invariantes
- **Fuente única de totales**: `calcCheckoutTotals` (cliente) y su espejo en
  `POST /api/orders` (servidor). Cualquier cambio de regla (envío gratis, cupón
  sobre bumps) se hace en ambos lados el mismo día.
- El carrito persiste en localStorage con carga post-hidratación (`LOAD_CART`);
  no leer localStorage en el render inicial (mismatch #418).
- El drawer es un diálogo: foco inicial, Escape, `aria-modal`, scroll lock del body.
- Formulario de dirección: `autocomplete` + `inputMode` + `enterKeyHint` por campo;
  CP siempre 5 dígitos numéricos; teléfono 10 dígitos.
- Stripe: el `clientSecret` se obtiene de `/api/payments/stripe/create-intent`;
  `/api/orders` solo registra. Webhooks verifican firma.

## Verificación
`npm test` (payments, checkout-config, order-bumps, checkout-bdd-regression) +
checkout de prueba E2E en móvil con cupón y bumps.
