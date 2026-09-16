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
  `BumpCards` con `revealNext` muestra siempre un máximo de `MAX_BUMPS` tarjetas.
  Al elegir una oferta su tarjeta **desaparece** (ya vive como línea del pedido)
  y el hueco lo ocupa la siguiente oferta del pool; al agotarse el pool la lista
  se encoge y, sin ofertas pendientes, `BumpCards` renderiza `null`. Por eso en
  el checkout un bump no se deselecciona desde las tarjetas: se ajusta o se
  reduce su cantidad en `OrderItemsList`. Las superficies de carrito
  (`cart-drawer`, `/cart`, `/{ciudad}/carrito`) siguen sin `revealNext`: ahí las
  tarjetas se marcan/desmarcan y conservan su copy de "Hasta 3".
- **Cantidades editables (piso 0 + confirmación)**: `OrderItemsList` (checkout) y
  `QuantityStepper` (exportado para `ReviewStep`) son la única UI de +/− del
  pedido. `MIN_ITEM_QUANTITY` es 0: el "−" baja hasta 0 y ya en 0 pide
  confirmación (`RemoveLineDialog`) para quitar el artículo del pedido — el
  checkout nunca borra nada sin un "sí" explícito. Una línea en 0 **sale del
  carrito** (una sola fuente de totales, `POST /api/orders` rechaza cantidad 0)
  pero sigue visible en el pedido con la etiqueta "En 0" hasta que el usuario
  confirme quitarla o la suba otra vez. Ese estado lo gobierna `useOrderLines`
  (`src/components/checkout/use-order-lines.ts`), compartido por `CheckoutDrawer`
  y el checkout full-page; la regla pura vive en `src/lib/order-lines.ts`
  (`resolveQuantityChange`) y tiene pruebas en `order-lines.test.ts`. Por eso el
  checkout full-page **no** se vacía con el carrito en 0: su guard usa
  `items.length` (líneas visibles), no `itemCount`. El payload de
  `use-checkout-order` omite las líneas con `quantity === 0` (catalog y bumps):
  un bump en 0 sigue en `selectedBumps` y enviarlo 400-earía el pedido.
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
