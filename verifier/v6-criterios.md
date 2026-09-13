# Criterios de aceptación v6 — 2026-09-12 (fase 5)

Alcance fase 5: cerrar la brecha n.º 4 de la estrategia ("cómo funciona la compra por mayoreo en línea") e iniciar la brecha n.º 6 (serie programática por categoría de insumo) con las 3 categorías de mayor volumen, enlazando a las páginas transaccionales del catálogo (hallazgo 2.6). Commits por etapa.

## Cambios respecto a v5, con justificación

1. **Enlazado blog → catálogo transaccional iniciado.** La auditoría (2.6) detectó que el blog enlazaba al Panel pero casi nada al catálogo que convierte. La serie por insumo resuelve ambas brechas a la vez: cada guía enlaza a su `/cdmx/categoria/{categoria}` con ancla natural (2× por guía).
2. **Veracidad en serie de insumos:** prohibido afirmar precios de mercado actuales (fluctúan, no verificables en la sesión). Las guías enseñan el método (precio por kg útil, costo por unidad, calidad en recepción) con ejemplos etiquetados como ilustrativos; el ejemplo de rendimiento de carne reutiliza el ya publicado en la guía de food cost.
3. **Preview Vercel:** rate limit intermitente sigue activo en la mayoría de los commits; últimos SUCCESS con contenido de app: `902f763` y `8eca3d9` (fases 2-3). Re-verificación del head final programada (cron 2026-09-13 14:00 UTC).

## Criterios v6 (finales)

- [x] Brecha n.º 4 cerrada: `como-funciona-compra-mayoreo-en-linea`
- [x] 3 guías de la serie por categoría de insumo: `proveedores-frutas-verduras-restaurantes`, `proveedores-carne-mayoreo-restaurantes`, `desechables-mayoreo-restaurantes`
- [x] Cada guía de la serie enlaza a su página transaccional del catálogo (`/cdmx/categoria/frutas-verduras`, `/cdmx/categoria/carnes-aves-pescados`, `/cdmx/categoria/desechables`) con ancla natural 2×
- [x] Cero precios de mercado actuales; ejemplos etiquetados como ilustrativos o reutilizados de contenido ya publicado
- [x] Schema validado contra `src/lib/blog.ts` (clave `faq`, categoría proveeduria, cta coleccion)
- [x] `llms.txt` con sección "Por categoría de insumo"
- [x] Docs actualizados: estrategia (brecha 4 ✅, brecha 6 🔶 iniciada) y auditoría (fase 5 + fila 14)
- [x] Un commit por etapa: guías `c9d4702` + `fcfafef`, docs/llms `733d77b`, verifier (este commit)
- [⏳] Preview Vercel del head final — re-verificación programada (cron 2026-09-13 14:00 UTC)
