# Criterios de aceptación v5 — 2026-09-12 (fase 4)

Alcance fase 4: completar la arquitectura de clusters de `docs/estrategia-contenidos-seo.md` (§2) creando las 4 guías pilar restantes (operación, marketing, legal/finanzas, crecimiento) e interlinking desde posts existentes. Commits por etapa.

## Cambios respecto a v4, con justificación

1. **6/6 pilares = arquitectura de clusters completa.** Con las 2 de fase 3 y las 4 de esta fase, cada hub de la estrategia tiene su página pilar con sección hub que mapea el clúster. Pendiente explícito (fuera de este PR): enlazar las pilares desde home/nav (cambio de UI).
2. **Veracidad en la guía legal:** sin tasas fiscales ni montos de multas específicos (no verificables en la sesión); lenguaje cualitativo + "confirma con tu contador". Los rangos numéricos se limitan a los aprobados (sueldo ×1.3-1.4, costo laboral 25-35%, food cost 28-35%, inversiones de apertura/expansión de referencia).
3. **QA de schema superado sin correcciones:** ambos writers entregaron la clave `faq` correcta esta vez (la regla de fase 3 funcionó). Se verificó igual contra `src/lib/blog.ts` antes de cada push.
4. **Preview Vercel:** la cuota se liberó intermitentemente durante la tarde; SUCCESS confirmado en `902f763` y `8eca3d9` (todo el MDX de fases 2-3). Los commits de fase 4 son MDX nuevo por el mismo pipeline; la re-verificación del head final sigue programada (cron 2026-09-13 14:00 UTC).

## Criterios v5 (finales)

- [x] 4 guías pilar creadas (`guia-operacion-cocina`, `guia-marketing-restaurantes`, `guia-legal-finanzas-restaurante`, `guia-crecer-restaurante`) → 6/6 hubs de la estrategia
- [x] Cada pilar con sección hub que mapea su clúster (19, 21, 8 y 12 guías enlazadas respectivamente) + enlaces a pilares hermanos
- [x] Interlinking desde 4 posts existentes (mise-en-place, google-maps-2026, facturacion-cfdi, franquicias) en 2 commits
- [x] Schema validado contra `src/lib/blog.ts` (clave `faq`, categorías y variantes de CTA válidas, títulos ≤60c, descriptions ≤160c)
- [x] `llms.txt` reorganizado con sección de guías pilar primero
- [x] Docs actualizados: auditoría (fase 4, 6/6 hubs) y estrategia (§2 completa + pendiente de enlazar pilares desde home/nav)
- [x] Un commit por etapa: pilares `444c759`/`8d1c692`, interlinking `540ea30`/`ceafa84`, docs/llms `b72fae8`, verifier (este commit)
- [⏳] Preview Vercel del head final — re-verificación programada (cron 2026-09-13 14:00 UTC); últimos SUCCESS con contenido de app: `8eca3d9`
