# Agente: Carrito, checkout y pagos

## Posee
- `src/components/cart/**` (drawer, MobileCartBar, FreeShippingProgress)
- `src/components/checkout/**` (CheckoutDrawer, steps, bumps, upsell)
- `src/contexts/cart-context.tsx`
- `src/app/api/orders/**`, `src/app/api/payments/**`, `src/lib/payments.ts`,
  `src/lib/checkout-config.ts`, `src/lib/order-bumps.ts`,
  `src/lib/ingredient-affinity.ts`, `src/lib/upsell-offers.ts`

## Invariantes
- **Fuente única de totales**: `calcCheckoutTotals` (cliente) y su espejo en
  `POST /api/orders` (servidor). Cualquier cambio de regla (envío gratis, cupón
  sobre bumps) se hace en ambos lados el mismo día. El `bumpCount` que recibe es
  **unidades**, no líneas: se calcula con `countBumpUnits(selectedBumps)` para
  que un bump con cantidad 3 cuente como 3 artículos.
- **El conteo que se muestra es catálogo + bumps**: todas las superficies usan
  `countOrderUnits(itemCount, selectedBumps)` (= `itemCount + countBumpUnits`)
  para el número de productos que ven el header (insignia y `aria-label`),
  `MobileCartBar`, la cabecera del drawer "Mi Carrito", `/cart` y
  `/{ciudad}/carrito`; 2 productos + 3 bumps se leen como **5**. El `itemCount`
  del carrito (`cart-context`) **no cambia de semántica**: sigue siendo solo
  catálogo y sigue gobernando el vacío, `cart-bar-active` y el `itemCount` de
  `calcCheckoutTotals`. En `/cart` y `/{ciudad}/carrito` el resumen muestra un
  **único** "Subtotal (N productos)" con el monto ya sumado
  (`totals.effectiveSubtotal`): no se reañade la fila "Artículos especiales".
  Los guardas de render siguen siendo `itemCount > 0` (no puede haber bumps sin
  catálogo) y las filas "Artículos especiales" del `CheckoutDrawer` se conservan
  porque los e2e las verifican.
- **Bumps encadenados sin tope**: el checkout **omite `limit`** al pedir las
  ofertas, y `resolveBumps` sin `limit` devuelve **todas** las reglas activas que
  apliquen al carrito — el tamaño del pool lo determina `bump_rules`, no una
  constante. `MAX_BUMPS` (3) es solo la **ventana visible**: `BumpCards` con
  `revealNext` muestra 3 tarjetas y al elegir una su tarjeta **desaparece** (ya
  vive como línea del pedido), el hueco lo ocupa la siguiente oferta y la cadena
  sigue de forma indefinida; la lista se encoge al final y `BumpCards` renderiza
  `null` solo cuando la API no devolvió ninguna oferta. **No reintroduzcas un tope
  de producto**: `MAX_BUMPS_REQUEST_LIMIT` (100) es únicamente un tope anti-abuso
  del endpoint público `POST /api/cart/bumps` — `sanitizeBumpLimit` lo aplica a un
  `limit` explícito, y un `limit` no numérico cae a `MAX_BUMPS`. Por eso en el
  checkout un bump no se deselecciona desde las tarjetas: se ajusta o se reduce
  su cantidad en `OrderItemsList`. Las superficies de carrito (`cart-drawer`,
  `/cart`, `/{ciudad}/carrito`) siguen sin `revealNext` y sin `limit`: ahí las
  tarjetas se marcan/desmarcan y conservan su copy de "Hasta 3".
- **Los bumps sobreviven salir del checkout**: la selección vive en localStorage
  (`resurte_bumps`) y, para usuarios con sesión, en `user_carts.bumps` (migración
  `00113`) — igual que el carrito. El dueño de la sincronización es el **store**
  de `src/hooks/use-selected-bumps.ts` (`useSyncExternalStore` + push debounced),
  no el hook de React: `CartDrawer` está montado una sola vez en `layout.tsx` y
  sigue vivo en el checkout, así que no hay carrera de desmontaje. Los endpoints
  son **dedicados** (`PUT /api/cart/bumps/selection` replace-all, `POST
  /api/cart/bumps/hydrate` merge-and-return) y **no** un campo opcional de
  `PUT /api/cart`: en un replace-all compartido no se puede distinguir "no toques
  los bumps" de "vacía los bumps", y `bumps_updated_at` es un timestamp **propio**,
  separado de `updated_at`, para que el merge last-write-wins de los bumps no pise
  un cambio de carrito local (ni al revés). El merge (`mergeBumps`, puro y probado
  en `bumps-sync.ts`) lo usan cliente y servidor para no divergir.
- **Qué se poda de una selección persistida**: `BumpCards` descarta los bumps cuyo
  **producto ya es una línea del carrito** (se cobraría doble) y, solo cuando la
  petición del pool fue completa (`revealNext && limit === undefined`), los que ya
  no están en la respuesta. **Conserva** a propósito los de regla inactiva o
  ausente — que `POST /api/orders` dé el 400 explícito "El artículo especial X no
  está disponible" — y los de `quantity: 0`, que son legítimos (`MIN_ITEM_QUANTITY`
  es 0) y se filtran al armar el pedido, no antes. La selección vacía es
  intencional: `[]` con timestamp nuevo sube como "el usuario quitó todas las
  ofertas", mientras que una respuesta del servidor vacía nunca borra la del
  dispositivo.
- **Copy de las tarjetas = nombre real del catálogo**: `BumpCards` y el modal de
  upsell encabezan con `bump.product.name` / `offer.product.name`. El
  `bump_rules.title` es una frase adorno ("Limón para tus mariscos") y solo puede
  usarse como subtítulo explicativo, nunca como encabezado. Si añades una
  superficie de oferta, lee el nombre del producto, no el título de la regla.
- **Afinidad por ingrediente (tier superior)**: `resolveBumps` resuelve primero
  el tier de afinidad (`src/lib/ingredient-affinity.ts`, puro y sin I/O) y luego
  los tiers de receta y categoría. Un candidato afín encabeza el ranking y se
  etiqueta `badgeLabel: "Ideal con tu pedido"`. Las reglas de afinidad llevan
  `trigger_type = "ingredient_affinity"` y `display_order = 100` para quedar por
  debajo de las reglas del admin. **La afinidad es aditiva**: nunca reemplaza al
  tier de categoría; si no hay pares ni recetas coincidentes, el ranking previo
  queda intacto. Un par curado (`bump_affinity.kind = 'curated'`) gana el motivo
  sobre el del recetario y su texto es "Ideal con {origen}". El tier es
  tolerante a fallos: si `bump_affinity` no existe (`42P01`, migración `00112`
  sin aplicar) o la query falla, el motor sigue con los demás tiers.
  `ingredient_affinity` **no es un trigger evaluable** en `evaluateTriggerTypes`
  (devuelve `false`): solo lo materializa `resolveBumps`. Por eso
  `upsell-offers.ts` y el lookup de descuentos en `payments.ts` filtran
  `.neq("trigger_type", "ingredient_affinity")` — esas reglas existen para el
  carrito, no para upsells 1-click. `POST /api/orders` valida bumps por
  `product_id` + `is_active`, así que las reglas de afinidad pasan sin cambios.
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
`npm test` (payments, checkout-config, order-bumps, ingredient-affinity,
checkout-bdd-regression) + `npx playwright test e2e/checkout-drawer.spec.ts` y un
checkout de prueba E2E en móvil con cupón y bumps.
