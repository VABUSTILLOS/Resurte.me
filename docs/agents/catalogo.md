# Agente: Catálogo, búsqueda y ciudades

## Posee
- `src/components/product/**` (ProductCard, ProductCardGrid, RecentlyViewed, galería)
- `src/components/city/**` (landing, selector, detector)
- `src/components/search/**` (SearchBar, overlay móvil)
- `src/app/[slug]/**` (landing por ciudad, producto, categoría, colección, buscar)
- `src/app/catalogo/**`

## Invariantes
- `ProductCard` está envuelta en `React.memo` y usa `content-visibility: auto` — no
  quitar; el catálogo renderiza cientos de cards.
- La acción del card tiene 3 estados mutuamente excluyentes: **stepper − N +** (ya
  en carrito, siempre visible), **quick-add** (disponible), **Avísame/spacer**
  (agotado). Los tres ocupan el mismo slot para no desacomodar el grid 2-col.
- La landing por ciudad es **estática** (`revalidate = 300`); la ciudad se resuelve
  con `resolveCity()` (DB → estático) y el catálogo vía `catalog-cache` — nunca
  introducir `cookies()`/`headers()`.
- El atajo `/` de búsqueda respeta campos enfocados (`isEditableTarget`).
- El catálogo de la tienda ordena por `sort_order, name` (00100, orden manual
  del admin) con fallback a solo `name` si la columna no existe; la metadata
  de la página de producto prefiere `seo_title`/`seo_description` (00104)
  con fallback al título/descripción derivados.
- Ventana de oferta (00107): `sale-window.ts` es la fuente única. La tienda
  (ficha, listados, pagos, bumps y upsells) consume `withResolvedSale` /
  `resolveSalePrice` / `resolveEffectivePrice`, NUNCA `sale_price` a pelo:
  fuera de la ventana el precio de oferta se resuelve a `null` para que el
  patrón legado `sale_price ?? price` siga siendo correcto. `get_products_by_collection`
  (00111) devuelve `sale_starts_at`/`sale_ends_at` para que las colecciones
  también respeten la ventana.
- Productos relacionados (00109): `buildRelatedProducts` (tope 4) es la
  fuente única de la sección "También te puede interesar"; descarta el propio
  producto, los no visibles y los agotados, y cae a la misma categoría cuando
  el admin no eligió relacionados. El array lo escribe solo el admin.
- Scroll infinito de categoría (C15): `/[ciudad]/categoria/[slug]` acumula tandas
  de 24 (`loadMoreCategoryProducts`) con un `IntersectionObserver` sobre un
  centinela al final del listado (`rootMargin: 600px 0px`). El observer se
  re-registra en cada tanda para encadenar cargas cuando la tanda no llena el
  viewport y llama siempre a la versión vigente de `handleLoadMore` vía ref
  (`loadMoreRef`) — **no** mover esa asignación al cuerpo del render: escribe
  durante render y `react-hooks/refs` lo bloquea. El botón "Cargar más" se
  conserva como fallback accesible y como salida de error: una tanda fallida
  detiene el auto-scroll (`loadError`) y el botón pasa a "Reintentar", para no
  reintentar en bucle. El `delay` del `ScrollReveal` de las cards va acotado
  (`Math.min(idx * 0.04, 0.3)`): sin tope, las cards 100+ acumulaban un
  `transition-delay` de segundos al llegar por scroll.
- La búsqueda de ciudades es insensible a acentos (`fold()` con NFD).
- Precio por unidad (C13): `unit-price.ts` es la fuente única. `parsePresentation`
  normaliza el texto libre de `products.unit` (`por kilo`, `500 g`, `1 l`,
  `por pieza`, `por manojo`…) a una base física; `comparePresentations` solo
  empareja presentaciones del **mismo** producto base (nombre normalizado) y la
  misma base física, y decide "Más barato" **incluyendo al producto actual en el
  concurso** — nunca comparar kg contra piezas ni `500 g` contra `1 kg` a ojo.
  Las cards y la búsqueda global muestran `$/kg` como insignia y conservan el
  heurístico de mayoreo solo cuando el precio por unidad no es calculable.
- Precio de venta con proveedor (00196–00202): la regla vigente vive en
  `00202` — `LEAST(CEIL(costo_kg * kg * margen), tope_kg * kg)`, donde `kg` es
  el peso de una unidad de venta y el tope sale de la tabla **privada**
  `competitor_prices` (normalizada a kilo por `scripts/alsuper-prices-sync.mjs`).
  Nunca escribir el costo en `products.cost` ni en `description`, ni el nombre
  del rival en datos públicos (lo prohíbe `00020`). Si el rival no vende el
  equivalente por kilo, **no hay tope**: no se inventa una comparación.
  **Son DOS restricciones, no una** (desde `00202`): `precio >= costo` y
  `precio <= competencia`. Si el rival lo vende más barato de lo que nos cuesta
  no existe precio válido y el producto se **oculta** — nunca se vende a
  pérdida. Ocultar por SQL **debe** borrar `publish_at`/`unpublish_at`: el job
  `scheduled-publishing` republica lo que tenga fecha vencida y el producto
  volvería al aire solo (`00203` cierra ese hueco). Ojo con `product_suppliers.cost`: es **por kilo** para FRUGASA
  (`00196`) y **por unidad de venta** para AB Foods (`00191`). Detalle en
  `docs/precios-reglas.md`.
- Mega-menú de categorías (N11): `category-mega-menu.tsx` carga `/api/categories`
  **solo al abrir por primera vez**, cierra con Escape (devolviendo el foco al
  disparador), con clic fuera y al cambiar de ruta, y avisa al header vía
  `onOpenChange` para que la barra no se oculte mientras está abierto. El
  endpoint no lee `cookies()`/`headers()` — mantenerlo así o se rompe el
  prerender estático.
- Anclaje del mega-menú (N11): el panel es `absolute right-0` y se ancla al
  ancestro posicionado más cercano, que es la **fila del header**
  (`relative` en `header.tsx`), no el disparador. El disparador queda a ~150px
  del borde derecho (carrito + cuenta van después), así que anclarlo a él
  desborda la ventana a 640px. Si se mueve el componente a otra superficie,
  hay que darle un ancestro posicionado que llegue al borde del contenedor.
  Cubierto por el e2e `keyboard.spec.ts` → "el mega-menú de categorías cabe en
  la ventana y cierra con Escape" (1280px y 640px).
- `RecentlyViewed` persiste en localStorage (`resurte-recently-viewed`, tope 12) y
  se monta desde la página de producto (server) recibiendo el producto por props —
  no leer localStorage en render inicial.
- Precio de proveedor (00191): el precio de venta de los artículos de un
  proveedor se deriva del **costo de lista**, no se teclea. La regla vigente es
  `price = CEIL(product_suppliers.cost × 1.18)`; el costo vive **solo** en
  `product_suppliers`, que está revocado para `anon`/`authenticated`. Y una
  `description` publicada **nunca** lleva costo ni SKU del proveedor: al
  publicar un producto que nació oculto hay que reescribirla. Detalle en
  `supabase/ESQUEMA.md` §«Precios de proveedor y margen».
- Columnas públicas de `products` (00192): la tienda **no** lee `products` con
  `select("*")`. El `GRANT SELECT` es por columna, así que `*` falla con `42501`
  y deja el catálogo vacío. Para añadir una columna al catálogo público hay que
  tocar **dos** sitios que el contrato compara entre sí:
  `PUBLIC_PRODUCT_COLUMNS` en `src/lib/product-columns.ts` y el `GRANT SELECT (…)`
  de `00192_products_column_privileges.sql`. `cost`, `admin_note`,
  `low_stock_threshold`, `deleted_at` y `publish_at`/`unpublish_at` son
  privadas: solo las lee `service_role`. Guardia:
  `npx vitest run src/lib/product-columns.contract.test.ts`.

## Verificación
`npx vitest run src/lib/unit-price.test.ts` + `npm run build` (prerender de 20
ciudades) + smoke de `/chihuahua`, `/chihuahua/buscar?q=aguacate`,
`/catalogo/chihuahua` y la página de un producto (verificar stepper tras agregar,
el rail de recientes, la insignia `$/kg` y "Comparar presentaciones") a 375px;
a 1280px verificar que el mega-menú de categorías abre, cierra con Escape y no
se sale de la ventana al reducir a 640px (`E2E_PORT=3111 npx playwright test
e2e/keyboard.spec.ts --project=chromium --grep "mega-menú"`).
