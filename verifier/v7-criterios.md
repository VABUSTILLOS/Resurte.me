# Criterios de aceptación v7 — 2026-09-12 (fase 6)

Alcance fase 6: completar la serie por categoría de insumo (lácteos/huevo, bebidas, abarrotes — 6/6 categorías) y crear la pieza §3.2 de la estrategia ("Las 5 formas de surtir tu restaurante en México"), la última pendiente del contenido de comparación. Commits por etapa.

## Cambios respecto a v6, con justificación

1. **Serie por insumo completa (6/6).** Las 6 categorías del catálogo tienen su guía enlazando a su página transaccional. La brecha n.º 6 de la estrategia queda cerrada a nivel de categorías; el siguiente nivel (posts por insumo específico como aguacate o tortilla) queda explícitamente como opcional.
2. **Contenido de comparación completo (§3).** Con `formas-surtir-restaurante-mexico` quedan creadas las 4 piezas de la sección §3 de la estrategia: central vs en línea, 5 formas de surtir, alternativas a competidor y costo mensual.
3. **Veracidad:** cero precios de mercado actuales y cero cifras de terceros no verificables (membresías, mínimos de Sysco). Ejemplos de abarrotes etiquetados como hipotéticos; rangos ya publicados reutilizados.
4. **Preview Vercel:** los builds exitosos en `c9d4702` y `fcfafef` (fase 5) compilaron el árbol completo; los commits de fase 6 agregan MDX por el mismo pipeline. Re-verificación del head final programada (cron 2026-09-13 14:00 UTC).

## Criterios v7 (finales)

- [x] 3 guías que completan la serie por insumo: `proveedores-lacteos-huevo-restaurantes`, `proveedores-bebidas-mayoreo-restaurantes`, `abarrotes-mayoreo-restaurantes` → 6/6 categorías con enlace a su `/cdmx/categoria/*`
- [x] Pieza §3.2 creada: `formas-surtir-restaurante-mexico` (tabla maestra de 5 formas + decisión por etapa y por tipo de restaurante; sin cifras de terceros)
- [x] Schema validado contra `src/lib/blog.ts` (clave `faq`, categoría proveeduria, cta coleccion)
- [x] `llms.txt` con la serie completa (6 guías) y "5 formas" al frente de comparativas
- [x] Docs actualizados: estrategia (brecha 6 ✅, §3.2 ✅) y auditoría (fase 6, filas 11 y 14 del resumen)
- [x] Un commit por etapa: guías `58a484f` + `8e1e06c`, docs/llms `6f7cf08`, verifier (este commit)
- [⏳] Preview Vercel del head final — re-verificación programada (cron 2026-09-13 14:00 UTC)
