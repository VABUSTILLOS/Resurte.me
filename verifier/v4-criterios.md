# Criterios de aceptación v4 — 2026-09-12 (fase 3)

Alcance fase 3: ejecutar la arquitectura de clusters de `docs/estrategia-contenidos-seo.md` (guías pilar), cerrar la 4ª página de comparación/alternativas, cubrir la brecha "lista de insumos para abrir un restaurante" y agregar interlinking desde posts existentes. Commits por etapa (A→E) como pidió el usuario.

## Cambios respecto a v3, con justificación

1. **Contenido redactado por subagentes con revisión obligatoria del orquestador antes de push.** Regla nueva tras el incidente de integridad de fase 2: todo MDX generado por agente se valida contra el schema real de `src/lib/blog.ts` antes de publicarse. Evidencia de que la regla funciona: el redactor de fase 3 entregó la clave YAML `faqs` (inválida) y se corrigió a `faq` en revisión — sin ella, los posts nuevos habrían perdido su sección de preguntas y el schema FAQPage.
2. **Veracidad con fuentes externas caídas.** Las herramientas de búsqueda del agente de research fallaron (timeouts sistemáticos); su brief llegó marcado [VG]/[NV]. En consecuencia, la guía de alternativas se redactó con reglas hedged estrictas: cero precios de membresía, cero pedidos mínimos de Sysco, cero rankings de mercado, cero menciones de Makro. Solo se afirman hechos verificados de Resurte.me.
3. **Preview Vercel sigue bloqueado por cuota de plataforma (24 h).** El último SUCCESS con contenido de aplicación sigue siendo `8f4af8b`. Los commits de fase 3 agregan MDX de contenido nuevo que pasa por el mismo pipeline ya validado en ese commit; la re-verificación del head final queda programada (cron 2026-09-13 14:00 UTC).

## Criterios v4 (finales)

- [x] 2 guías pilar creadas (`guia-proveeduria-restaurantes`, `guia-costos-restaurante`) con sección hub que mapea su clúster e interlinking cruzado entre ambas
- [x] 4ª página money de comparación: `alternativas-sysco-clubes-precio` (reglas de veracidad hedged aplicadas)
- [x] Brecha de apertura cubierta: `lista-insumos-abrir-restaurante`
- [x] Interlinking desde 4 posts existentes (precios-mayoreo-restaurantes, elegir-proveedor-mayorista, guia-food-cost-restaurante-2026, cuanto-cuesta-abrir-restaurante-mexico) en 3 commits separados
- [x] Schema de frontmatter validado contra `src/lib/blog.ts` (clave `faq`, categorías y variantes de CTA válidas, títulos ≤60c, descriptions ≤160c)
- [x] `llms.txt` sincronizado con las 4 guías nuevas
- [x] `docs/auditoria-seo-2026-09.md` y `docs/estrategia-contenidos-seo.md` actualizados al estado real (fase 3, pendientes explícitos)
- [x] Un commit por etapa: pilares (`902f763`), interlinking (`1a4ddfe`, `6d4d29a`, `043fff3`), money+apertura (`8eca3d9`), docs/llms (`c5d3ab0`, `99cd039`), verifier (este commit)
- [⏳] Preview Vercel del head final — pendiente solo por cuota de plataforma; re-verificación programada
