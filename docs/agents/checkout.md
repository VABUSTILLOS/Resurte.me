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
  sobre bumps) se hace en ambos lados el mismo día. El `bumpCount` que recibe es
  **unidades**, no líneas: se calcula con `countBumpUnits(selectedBumps)` para
  que un bump con cantidad 3 cuente como 3 artículos.
- **Bumps encadenados**: el checkout pide el pool completo (`MAX_BUMPS_POOL`) y
  `BumpCards` con `revealNext` muestra una ventana de `MAX_BUMPS` que se
  desplaza al elegir: el bump entra al pedido y aparece el siguiente. El pool se
  agota y ahí se detiene. Las superficies de carrito (`cart-drawer`, `/cart`,
  `/{ciudad}/carrito`) siguen sin `revealNext` y conservan su copy de "Hasta 3".
- **Cantidades editables (mínimo 1)**: `OrderItemsList` (checkout) y
  `QuantityStepper` (exportado para `ReviewStep`) son la única UI de +/− del
  pedido. El "−" se deshabilita en `MIN_ITEM_QUANTITY`: el checkout nunca deja
  el pedido en 0 artículos, para quitar un producto se vuelve al carrito
  (donde `UPDATE_QUANTITY` sí elimina en ≤0).
- **Cifras comerciales**: el umbral de envío gratis vive en `commercial-facts.ts`
  (`FREE_SHIPPING_MXN`) y la tarifa en `checkout-config.ts` (`DELIVERY_FEE_FLAT`).
  Ninguna superficie publica la cifra a mano: la prosa interpola la constante y
  `commercial-facts.test.ts` falla si alguna la escribe literal. Al mover una de
  las dos, revisa también `bump_rules.subtotal_min` en Supabase.
- El carrito persiste en localStorage con carga post-hidratación (`LOAD_CART`);
  no leer localStorage en el render inicial (mismatch #418).
- El drawer es un diálogo: foco inicial, Escape, `aria-modal`, scroll lock del body
  y cierre por swipe-down con handle visual (umbral 80px + haptic).
- Formulario de dirección: `autocomplete` + `inputMode` + `enterKeyHint` por campo;
  CP siempre 5 dígitos numéricos; teléfono 10 dígitos. La última dirección se
  autoguarda en `resurte-last-address` y se ofrece con "Usar mi última dirección".
- Stripe: el `clientSecret` se obtiene de `/api/payments/stripe/create-intent`;
  `/api/orders` solo registra. Webhooks verifican firma.

## Verificación
`npm test` (payments, checkout-config, order-bumps, checkout-bdd-regression) +
checkout de prueba E2E en móvil con cupón y bumps.
