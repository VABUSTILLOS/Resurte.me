# Criterios de aceptación v1 — 2026-09-12

Objetivo: auditoría SEO completa de resurte.me + tips de blog + estrategia + implementación de mejoras, con foco en rankings de Google y visibilidad en asistentes de IA (GEO).

## Criterios

1. **Auditoría completa documentada** — técnica, on-page, contenido y GEO, con hallazgos priorizados por impacto. → `docs/auditoria-seo-2026-09.md`
2. **Estrategia de contenidos y keywords** — tips de blog posts y plan editorial para el segmento (mayoreo/insumos para restaurantes en México). → `docs/estrategia-contenidos-seo.md`
3. **Fix crítico de medición** — GA4 roto en producción (env var malformada). → sanitización en código + acción documentada para Vercel
4. **Indexación limpia** — noindex en ~60 URLs transaccionales (carrito/checkout/pedidos/búsqueda ×20 ciudades, auth, panel, admin); sitemap sin transaccionales y con institucionales; robots sin contradicciones.
5. **GEO implementado** — crawlers de IA permitidos en robots.txt, `llms.txt`, FAQPage schema en /faq, datos de negocio consistentes.
6. **Metadatos de blog** — corregir los peores casos de títulos >60c / descriptions >160c; dejar reemplazos listos para el resto.
7. **Todo en un PR revisable** — rama `seo/auditoria-2026-09`, PR #9 con descripción precisa, sin romper build ni CI más allá de lo ya roto en `main`.
