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
- La búsqueda de ciudades es insensible a acentos (`fold()` con NFD).
- `RecentlyViewed` persiste en localStorage (`resurte-recently-viewed`, tope 12) y
  se monta desde la página de producto (server) recibiendo el producto por props —
  no leer localStorage en render inicial.

## Verificación
`npm run build` (prerender de 20 ciudades) + smoke de `/chihuahua`,
`/chihuahua/buscar?q=aguacate`, `/catalogo/chihuahua` y la página de un producto
(verificar stepper tras agregar y el rail de recientes) a 375px.
