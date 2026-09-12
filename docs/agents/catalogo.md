# Agente: Catálogo, búsqueda y ciudades

## Posee
- `src/components/product/**` (ProductCard, ProductCardGrid, galería)
- `src/components/city/**` (landing, selector, detector)
- `src/components/search/**` (SearchBar, overlay móvil)
- `src/app/[slug]/**` (landing por ciudad, producto, categoría, colección, buscar)
- `src/app/catalogo/**`

## Invariantes
- `ProductCard` está envuelta en `React.memo` y usa `content-visibility: auto` — no
  quitar; el catálogo renderiza cientos de cards.
- El quick-add es inline en móvil y flotante en ≥sm; mantener ambos slots con la
  misma altura (grid 2-col parejo) incluso para agotados (CTA "Avísame" o spacer).
- La landing por ciudad es **estática** (`revalidate = 300`); la ciudad se resuelve
  con `resolveCity()` (DB → estático) y el catálogo vía `catalog-cache` — nunca
  introducir `cookies()`/`headers()`.
- El atajo `/` de búsqueda respeta campos enfocados (`isEditableTarget`).
- La búsqueda de ciudades es insensible a acentos (`fold()` con NFD).

## Verificación
`npm run build` (prerender de 20 ciudades) + smoke de `/chihuahua`,
`/chihuahua/buscar?q=aguacate` y `/catalogo/chihuahua` a 375px.
