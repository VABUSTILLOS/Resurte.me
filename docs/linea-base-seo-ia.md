# Línea base SEO-IA (GEO/AEO)

Registro de referencia para medir el avance de los siguientes 90 días.

- **Fecha de corte:** 2026-09 (fase de implementación completa)
- **Punto de partida previo:** `docs/auditoria-seo-2026-09.md` (puntuación 7/10,
  infraestructura SEO clásica ya sólida: `robots.txt` con crawlers de IA, sitemap
  dinámico, RSS, OG image, datos estructurados).
- **Objetivo:** que ChatGPT, Perplexity, Gemini y Copilot **citen a Resurte.me** al
  responder preguntas sobre abasto, mayoreo de insumos y operación de restaurantes en
  México.

> Este documento registra el **estado técnico medido**, que es verificable en el
> repositorio. Las métricas de citación (GA4, Search Console, logs de Vercel y panel de
> prompts) **no tienen histórico previo**: su primera medición es la línea base y se
> captura con los procedimientos de `docs/medicion-seo-ia.md`.

---

## 1. Estado técnico medido

### Descubrimiento e indexación

| Indicador | Valor |
| --- | --- |
| URLs en `sitemap.xml` | **267** |
| Rutas devolviendo `200` (barrido completo del sitemap) | **267 / 267** |
| `robots.txt` — líneas `User-Agent` | **26** (1 comodín + 25 crawlers de IA) |
| `llms.txt` / `llms-full.txt` | 2 (generados dinámicamente) |
| Feeds JSON | 2 (`/api/feed/catalogo.json`, `/api/feed/precios.json`) |
| Ciudades cubiertas | 20 |

### Activos citables

| Grupo | Piezas | Qué es |
| --- | --- | --- |
| `respuesta-rapida` | **226** | Respuesta directa extraída del cuerpo de cada artículo |
| `preguntas` | **54** | Preguntas con respuesta autocontenida (`/preguntas`) |
| `datos-clave` | **120** | Tabla de cifras comerciales en páginas de categoría y colección |
| `fuentes-metodologia` | **80** | Bloque de fuentes y metodología en piezas con cifras |
| `precios` | 1 | Índice de precios de referencia (`/precios`) |
| `categorias-blog` | 6 | Hubs de categoría con resumen citable |
| `ciudades` | 20 | Landings de ciudad |
| `feeds` | 2 | Feeds JSON |
| `llms-txt` | 2 | `llms.txt` y `llms-full.txt` |

### Cobertura de contenido

| Indicador | Valor |
| --- | --- |
| Artículos publicados | **226** |
| Artículos con respuesta rápida citable | **226** (100 %) |
| Artículos de `costos` / `proveeduria` (piezas con cifras) | **80** |
| Preguntas curadas | 54 en 6 temas |
| Cifras comerciales en fuente única (`commercial-facts.ts`) | 7 |

### Instrumentación de medición

| Indicador | Valor |
| --- | --- |
| Crawlers de IA autorizados | 25 (8 de ellos capaces de producir cita visible) |
| Motores de IA que disparan `ai_referral` | 12 |
| Preguntas del panel mensual | 20 |
| Motores evaluados por pregunta | 4 (ChatGPT, Perplexity, Gemini, Copilot) |
| Celdas del panel | 80 |

### Rendimiento de entrega (medido con `next start` en producción)

Los crawlers de IA tienen presupuestos de rastreo ajustados: una página que tarda o pesa
demasiado se rastrea menos. Estas cifras se midieron sobre el HTML servido, tras la
optimización de payload RSC (Fase 9).

| Ruta | Antes (raw) | Después (raw) | Gzip | Nota |
| --- | --- | --- | --- | --- |
| `/blog` | 733 KB | **384 KB** | 71 KB | −48 %: proyección `BlogIndexCard` + JSON-LD de índice mínimo |
| `/preguntas` | 452 KB | **363 KB** | 60 KB | −20 %: `ItemList` sin las respuestas duplicadas del `FAQPage` |
| `/blog/categoria/*` | 374 KB | **353 KB** | 39 KB | −6 % por la misma deduplicación de `ItemList` |
| `/{ciudad}` (×20) | — | **121 KB** | 22,7 KB | uniforme en las 20 ciudades |
| `/` | — | **119 KB** | 22,4 KB | |
| `/precios` | — | **79 KB** | 17,5 KB | |

| Indicador | Valor |
| --- | --- |
| Páginas con JSON-LD inválido | **0 / 267** |
| Artículos con respuesta rápida en el HTML SSR | **226 / 226** (no depende de hidratación) |
| Artículos con `#resumen-articulo` en el HTML SSR | **226 / 226** |
| Artículos con `#fuentes-y-metodologia` | **80** |
| Hubs de categoría con `#resumen-categoria` | **6 / 6** |

---

## 2. Qué se debe capturar ahora (primera medición)

Estas cifras **no existen todavía** y son la línea base real de citación. Se capturan una
vez con los procedimientos de `docs/medicion-seo-ia.md`:

1. **Panel de prompts (80 celdas)** — por cada pregunta y motor: ¿cita a Resurte.me?,
   ¿en qué posición?, ¿qué dato tomó?, ¿es exacto?, ¿a quién citó en su lugar?
   Registrar el total de aciertos (`citado = Sí`) y la posición media.
2. **Eventos `ai_referral` en GA4** — conteo inicial (probablemente cero) y desglose por
   `ai_engine`.
3. **Logs de Vercel** — cobertura de rastreo por crawler de familia *respuesta*:
   URLs distintas pedidas / 267.
4. **Search Console** — consultas con impresiones y cero clics (cannibalización por AI
   Overview) y consultas `marca + pregunta`.

---

## 3. Metas a 90 días

| Métrica | Línea base | Meta 90 días |
| --- | --- | --- |
| Preguntas del panel con cita (`citado = Sí`) | por medir | ≥ 30 % (≥ 24 / 80) |
| Posición media cuando hay cita | por medir | ≤ 3 |
| Cifras citadas correctamente (`exacto = Sí`) | por medir | 100 % de las citas |
| Eventos `ai_referral` / mes | por medir | crecimiento sostenido mes a mes |
| Cobertura de rastreo de crawlers de respuesta | por medir | ≥ 60 % de las 267 URLs |
| Rutas del sitemap con `200` | 267 / 267 | mantener 267 / 267 |
| Artículos con respuesta rápida | 226 (100 %) | mantener 100 % |

**Criterio de éxito principal:** que una pregunta real de un restaurantero mexicano
("¿cuál es el pedido mínimo para surtir un restaurante?") se responda en una IA con
Resurte.me como fuente.

---

## 4. Condiciones previas para que la medición arranque

- [x] `NEXT_PUBLIC_GA_MEASUREMENT_ID` correcto (2026-09-17). El valor local es
      `G-YKJ9ECF267` y, sobre todo, `sanitizeEnvId` (`src/lib/analytics.tsx` L22-30) sanea
      el prefijo `NOMBRE_VAR=` y las comillas, que era el fallo real: `ai_referral` se
      emite aunque el valor del dashboard siga sucio.
- [x] Migración `supabase/migrations/00091_price_index.sql` **aplicada** (verificado
      2026-09-17: el proyecto lista sus 138 migraciones, `00091` entre ellas). Lo único que
      no se puede comprobar desde el repo es que el cron ya haya corrido, porque es runtime.
- [ ] Acceso a Google Search Console para el dominio.
- [ ] Acceso a los logs de Vercel.
- [ ] Ejecutar el paquete off-page de `docs/estrategia-contenidos-seo.md` §8 (ítem de
      Wikidata, Google Business Profile y outreach): es lo que convierte el trabajo técnico
      en autoridad externa citable.
