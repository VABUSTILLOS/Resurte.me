# Criterios de aceptación v2 — 2026-09-12 (re-alcance)

Cambios respecto a v1, con justificación:

1. **/admin sin refactor de layout.** v1 asumía refactor del layout de admin para inyectar noindex. Al llegar PRs #11/#12 a `main` sobre el mismo archivo, el refactor generó conflicto. Se adoptó un mecanismo mejor: header `X-Robots-Tag: noindex, nofollow` desde `src/proxy.ts` (convención de Next.js 16). Ventaja: cubre todas las subrutas actuales y futuras de /admin sin tocar UI; el layout quedó idéntico a `main` y el conflicto desapareció.
2. **`proxy.ts`, no `middleware.ts`.** En Next.js 16.2.12 la convención `middleware.ts` está deprecada y rompió el build de Vercel (diagnosticado vía deployment statuses: falla solo en el commit que la introdujo). Reemplazada por `proxy.ts`; preview vuelve a SUCCESS.
3. **13 casos graves de metadatos de blog, no 4.** Se completaron los 13 (5 de la primera tanda + 8 de la segunda). Backlog restante: 31 casos menores (61–79c / 161–194c) con reemplazos listos en Anexo A.
4. **Knip y e2e quedan fuera de alcance** — fallan igual en `main` desde al menos el 29-ago (runs #139, #151, #155, #157). Deuda preexistente, no introducida por este PR; requiere acceso a logs locales para arreglarse a ciegas. Documentado en el PR.

## Criterios v2 (finales)

- [x] Auditoría completa: `docs/auditoria-seo-2026-09.md` (sincronizada con el estado real final)
- [x] Estrategia de contenidos: `docs/estrategia-contenidos-seo.md`
- [x] GA4 sanitizado en código + acción Vercel documentada
- [x] noindex en todas las URLs transaccionales + /admin vía proxy.ts; sitemap y robots coherentes
- [x] GEO: 12 crawlers IA, llms.txt, FAQPage en /faq, copy consistente
- [x] 13 metas graves de blog corregidos; 31 menores con reemplazos listos
- [x] PR #9 mergeable, descripción exacta, preview Vercel SUCCESS en el head final
- [x] Typecheck, ESLint y unit tests verdes en la rama
