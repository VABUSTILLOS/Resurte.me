# Criterios de aceptación v3 — 2026-09-12 (fase 2)

Alcance fase 2 (continuación del objetivo SEO/GEO): cerrar el backlog de metadatos del Anexo A, crear contenido "money" de alta intención comercial, mantener `llms.txt` sincronizado y dejar constancia honesta del estado del árbol.

## Cambios respecto a v2, con justificación

1. **Los 31 metas menores del Anexo A pasan de backlog a alcance.** En v2 quedaron como reemplazos listos; en fase 2 se aplicaron los 31 con metodología estricta: cada archivo se obtuvo fresco desde `main` vía API y se re-subió con solo el cambio de frontmatter (cuerpo byte a byte idéntico a `main`).
2. **Incidente de integridad detectado y reparado.** 15 archivos habían quedado con cuerpos incorrectos en commits intermedios de la rama (contenido reconstruido en lugar del original). Se restauraron desde `main` (commits `d9ddbce`→`d027eff`) y se re-aplicaron únicamente las ediciones de frontmatter. Criterio nuevo: ningún archivo del blog puede diferir de `main` más allá del frontmatter previsto en el Anexo A.
3. **Contenido money entra a alcance** (brecha n.º 2 de la auditoría): 3 guías nuevas de comparación/costo con FAQ schema e interlinking.
4. **Preview Vercel: criterio reformulado.** La cuota de despliegues de Vercel entró en rate limit de 24 h durante la fase 2 (mensaje de plataforma: "Deployment rate limited — retry in 24 hours"). El criterio pasa a exigir SUCCESS en el último commit con contenido de aplicación (`8f4af8b`) y evidencia de que los commits posteriores solo tocan archivos que no intervienen en el build (`public/llms.txt` estático, `docs/*.md`, `verifier/*`). La construcción del head final queda programada para re-verificación al liberarse la cuota.

## Criterios v3 (finales)

- [x] 31/31 metas menores aplicados con los valores exactos del Anexo A; cuerpos idénticos a `main` (verificación por re-fetch de muestra: `guia-food-cost-restaurante-2026`, `google-maps-restaurantes-2026`, `calculadora-food-cost-gratis`)
- [x] Integridad del árbol: los 15 archivos dañados restaurados byte a byte desde `main` + frontmatter del Anexo A
- [x] 3 guías money creadas (`central-de-abastos-vs-comprar-en-linea`, `cuanto-cuesta-surtir-restaurante-mes`, `mejores-proveedores-mayoreo-restaurantes`) con frontmatter conforme al schema (título ≤60c, description ≤160c, faq de 5 Q&A, cta, categoría válida) e interlinking al clúster de proveeduría
- [x] Fix del cover 404 de `tendencias-consumo-restaurantes` (og:image incluida)
- [x] `llms.txt` sincronizado con las 3 guías nuevas
- [x] `docs/auditoria-seo-2026-09.md` actualizado: Anexo A 44/44 ✅, sección fase 2 con nota de integridad
- [x] PR #9: descripción actualizada con fase 2 y nota honesta de restauración
- [x] Preview Vercel SUCCESS en `8f4af8b` (último commit con contenido de app); head final pendiente solo por rate limit de plataforma (24 h), con re-verificación programada
- [x] Indexación automática de los posts nuevos confirmada por arquitectura (blog fs-based; `sitemap.xml` y RSS dinámicos vía `getAllPosts`)
