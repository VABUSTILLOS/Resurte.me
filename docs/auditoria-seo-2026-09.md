# Auditoría SEO completa — Resurte.me (2026-09-12)

**Alcance:** auditoría técnica, on-page, contenido y visibilidad en motores de IA (GEO) sobre el sitio en producción y el código fuente. Cambios implementados en el PR #9 (`seo/auditoria-2026-09`). **Fases 2-5 (misma rama, mismo día):** cierre del backlog de metadatos (31 menores), 15 guías nuevas (5 money/comparativas, 6 pilares/hubs, 1 de apertura, 3 de la serie por categoría de insumo), interlinking desde 8 posts existentes y sincronización de `llms.txt`.

---

## 1. Resumen ejecutivo

**Salud general: BUENA base (7/10).** El sitio ya tiene lo que la mayoría tarda años en construir: canonicals en todas las páginas, Open Graph completo, JSON-LD (Organization, WholesaleStore, BlogPosting, BreadcrumbList, FAQPage), sitemap dinámico con 653 URLs, SEO programático por ciudad (20 ciudades × categorías/colecciones), 108 guías de blog con FAQ schema, HTTPS + HSTS, y diseño responsive con un solo H1 por página.

**Lo que frenaba el ranking** (todo corregido en este PR salvo lo marcado como backlog):

| # | Problema | Impacto | Estado |
|---|---|---|---|
| 1 | GA4 roto en producción (URL de gtag malformada) | Sin medición → SEO a ciegas | ✅ Corregido en código + acción en Vercel |
| 2 | ~60 URLs transaccionales indexables (carrito, checkout, pedidos, búsqueda × 20 ciudades) | Alto — dilución de relevancia y crawl budget | ✅ noindex |
| 3 | Contradicción sitemap ↔ robots (`/auth/*` en ambos) | Medio — señales mixtas | ✅ Corregido |
| 4 | GPTBot bloqueado en robots.txt | Alto para GEO — invisible en ChatGPT/IA | ✅ 12 crawlers IA permitidos |
| 5 | Sin `llms.txt` | Medio para GEO | ✅ Creado |
| 6 | `/faq` sin FAQPage schema | Medio — respuestas no citables | ✅ JSON-LD agregado |
| 7 | Sitemap sin páginas institucionales (/about, /contact, /faq, /ciudades…) | Bajo-medio | ✅ Agregadas |
| 8 | 39 títulos >60c y 25 descriptions >160c en blog | Medio — truncamiento en SERP | ✅ 44 corregidos (13 graves + 31 menores) |
| 9 | Copy inconsistente (envío gratis $3,000 vs $2,500; 6 vs 20 ciudades) | Bajo — confianza/E-E-A-T | ✅ Corregido en /faq |
| 10 | HTML SSR pesado (396–573 KB por página) | Medio — LCP/INP en móvil | 📋 Recomendación |
| 11 | Sin contenido "money" de comparación | Alto — keywords de alta intención sin cubrir | ✅ 5 guías creadas (fases 2-3) |
| 12 | Cover 404 en `tendencias-consumo-restaurantes` (typo en nombre de imagen) | Bajo — og:image rota | ✅ Corregido en fase 2 |
| 13 | Blog plano sin hubs temáticos | Medio — PageRank temático disperso | ✅ 6 de 6 pilares creadas (fases 3-4) |
| 14 | Blog enlaza poco al catálogo transaccional | Medio — PageRank no fluye a páginas que convierten | 🔶 Iniciado en fase 5 (serie por insumo enlaza a `/cdmx/categoria/*`) |

---

## 2. Hallazgos técnicos (detalle)

### 2.1 Google Analytics roto — CRÍTICO (medición)
- **Evidencia:** el HTML de producción renderiza `https://www.googletagmanager.com/gtag/js?id=NEXT_PUBLIC_GA_MEASUREMENT_ID=G-YKJ9ECF267`. El valor de la env var en Vercel incluye el nombre de la variable.
- **Impacto:** GA4 no registra nada. Sin datos de tráfico orgánico no hay forma de medir el SEO.
- **Fix aplicado:** `src/lib/analytics.tsx` ahora sanea el valor (`sanitizeEnvId`) — toma la parte posterior al `=`.
- **Acción pendiente (fuera del repo):** corregir en Vercel el valor de `NEXT_PUBLIC_GA_MEASUREMENT_ID` a solo `G-YKJ9ECF267`. Verificar en GA4 → Tiempo real tras el deploy.

### 2.2 Indexación de páginas transaccionales — CRÍTICO
- **Evidencia:** `curl` sobre `/cdmx/carrito`, `/cdmx/checkout`, `/cdmx/buscar` devolvía `index,follow` (heredado del layout raíz); el sitemap incluía `/carrito` y `/buscar` de las 20 ciudades más `/auth/login` y `/auth/register`.
- **Impacto:** ~60 URLs thin/duplicadas compitiendo por crawl budget y diluyendo la autoridad de las páginas de categoría (las que sí rankean).
- **Fix aplicado:** `noindex,nofollow` vía `layout.tsx` en `/auth`, `/cart`, `/{ciudad}/carrito`, `/checkout`, `/mis-pedidos`, `/mis-direcciones`, `/pedido-confirmado`, `/diagnostico-bumps` y `/panel`; `noindex,follow` en `/{ciudad}/buscar` (follow para no cortar el crawl hacia productos). Sitemap limpio.
- **`/admin`:** `noindex, nofollow` mediante el header `X-Robots-Tag` emitido desde `src/proxy.ts` (convención de Next.js 16, sucesora de `middleware.ts`). Cubre todas las subrutas de `/admin` actuales y futuras sin modificar la UI ni los layouts.
- **Nota:** se eliminaron `/admin/` y `/auth/` del `Disallow` de robots.txt — si se bloquean por robots, Google nunca ve el `noindex` y puede indexarlas "a ciegas". Solo `/api/` queda bloqueado.

### 2.3 Contradicción sitemap ↔ robots — ALTO
- `/auth/login` y `/auth/register` estaban en el sitemap y bloqueadas en robots.txt. Corregido: fuera del sitemap, con noindex, rastreables.

### 2.4 Velocidad y Core Web Vitals — MEDIO
- **Medido:** TTFB ~0.8 s (aceptable en Vercel), pero HTML SSR de 396 KB (home), 449 KB (ciudad), 573 KB (/blog) sin comprimir.
- **Riesgo:** LCP móvil por encima de 2.5 s en conexiones lentas; INP por hidratación de bundles grandes.
- **Recomendaciones (no aplicadas, requieren análisis):**
  1. Revisar el payload de RSC: 573 KB en /blog sugiere datos serializados de más (¿se envían los 108 posts completos al cliente?).
  2. Correr `npm run build` y revisar el bundle con `@next/bundle-analyzer`; lazy-load de secciones below-the-fold.
  3. Verificar que las imágenes de producto usen `next/image` con `sizes` correctos y lazy loading (el hero ya tiene preload, bien).
  4. Medir con PageSpeed Insights tras el deploy y fijar presupuesto: LCP < 2.5 s, INP < 200 ms, CLS < 0.1.

### 2.5 Seguridad/HTTPS — OK
HTTPS con HSTS `preload`, CSP (report-only), `x-frame-options: DENY`, `x-content-type-options: nosniff`. Sin mixed content detectado. ✅

### 2.6 Arquitectura y enlazado interno — OK con mejora
- Páginas de categoría a 2 clics del home; blog interligado con CTAs contextuales; breadcrumbs con schema.
- **Mejora sugerida:** hub pages por tema en el blog (ver estrategia de contenidos) y enlazar las páginas de colección (`/coleccion/taquerias-antojitos`) desde los artículos relacionados — hoy el blog enlaza al Panel pero poco al catálogo transaccional. **Avance fases 3-5:** las 6 páginas pilar creadas con interlinking desde 8 posts existentes, y la fase 5 inició los enlaces directos a páginas transaccionales del catálogo: la serie por categoría de insumo enlaza a `/cdmx/categoria/frutas-verduras`, `/cdmx/categoria/carnes-aves-pescados` y `/cdmx/categoria/desechables`.

---

## 3. Hallazgos on-page

### 3.1 Títulos y meta descriptions del blog — MEDIO
- **Evidencia:** análisis de los 108 MDX: 39 títulos >60 caracteres (máx. 93) y 25 descriptions >160 (máx. 202).
- **Corregidos en este PR — los 13 casos graves** (título >79c o description >194c):

  | Post | Antes | Después |
  |---|---|---|
  | control-de-merma-sin-hojas | 93c / 179c | 58c / 142c |
  | inflacion-alimentos-menu-restaurante | 91c / 176c | 57c / 147c |
  | comisiones-delivery-apps-2026 | 89c / 171c | 62c / 154c |
  | nom-251-higiene-restaurante | 87c | 55c |

  Otros 9 (antes: títulos de 80–86c y/o descriptions de 195–202c):

  | Post | Después |
  |---|---|
  | costeo-platillo-nuevo-restaurante | 60c / 133c |
  | proveeduria-mayoreo-restaurantes | 59c / 131c |
  | sector-restaurantero-mexico-2026 | 50c (título) |
  | menu-digital-restaurante-guia | 52c / 148c |
  | margenes-delivery-vs-local | 46c / 152c |
  | panel-herramientas-restaurante-guia | 47c / 155c |
  | margenes-restaurantes-mexico | 52c / 150c |
  | responder-resenas-google-restaurantes | 52c / 152c |
  | inventario-conteo-ciclico-restaurante | 54c / 149c |

- **Menores (31):** ✅ aplicados en fase 2 con los valores exactos del Anexo A. Los cuerpos de los 31 archivos quedaron byte a byte idénticos a `main` (verificado por re-fetch desde la rama).

### 3.2 Lo que está bien (no tocar)
- Títulos únicos con keyword al frente y marca al final en ciudades/categorías.
- Un H1 por página; jerarquía H2/H3 lógica.
- Canonicals auto-referenciales correctos en home, ciudades, categorías y blog.
- OG/Twitter cards con imagen 1200×630 dinámica.
- 1 sola imagen sin alt por página (decorative, aceptable).

### 3.3 Copy inconsistente — corregido
- `/faq` decía envío gratis desde $3,000 (el resto del sitio: $2,500) y listaba 6 ciudades (son 20). Inconsistencias así erosionan E-E-A-T y confunden a los motores de IA que citan el sitio.

### 3.4 Cover 404 en tendencias-consumo-restaurantes — corregido (fase 2)
- El frontmatter apuntaba a `/images/blog/tendencias-consumo-restaurantes.webp`, pero el archivo real en `public/images/blog/` se llama `tendeencias-consumo-restaurantes.webp` (typo con "ee"). Resultado: imagen de portada y `og:image` rotas (404). Corregido el frontmatter al nombre real del archivo.

---

## 4. Contenido y E-E-A-T

**Fortalezas:** 108 guías largas con tablas, números en MXN, FAQ schema propio por post, CTAs al producto, autor declarado ("Equipo Resurte.me — Especialistas en restaurantes"). Cobertura temática amplia: costos, proveeduría, mermas, marketing, NOM-251, CFDI.

**Brechas (ver estrategia de contenidos para el plan completo):**
1. **Sin páginas de autor** — "Equipo Resurte.me" no es una entidad verificable. Crear `/about#equipo` con autores reales, credenciales y foto; enlazar desde cada post (mejora E-E-A-T directa).
2. ~~**Sin contenido "money" de comparación**~~ — ✅ **cubierto**: fase 2 creó 3 guías (`central-de-abastos-vs-comprar-en-linea`, `cuanto-cuesta-surtir-restaurante-mes`, `mejores-proveedores-mayoreo-restaurantes`) y fase 3 agregó 2 más (`alternativas-sysco-clubes-precio`, `lista-insumos-abrir-restaurante`). Todas con FAQ schema, tablas con números en MXN e interlinking al clúster de proveeduría.
3. ~~**Sin páginas hub temáticas**~~ — ✅ **6 de 6 creadas (fases 3-4)**: `guia-proveeduria-restaurantes`, `guia-costos-restaurante`, `guia-operacion-cocina`, `guia-marketing-restaurantes`, `guia-legal-finanzas-restaurante` y `guia-crecer-restaurante`, cada una con sección hub que mapea su clúster. Pendiente: enlazar las pilares desde home/nav (cambio de UI, fuera de este PR).
4. **Fechas de actualización** — los posts tienen `updatedAt`; verificar que se muestre visible en la página (señal de frescura). En fases 3-4 se refrescó el `updatedAt` de los posts que recibieron interlinking.

---

## 5. Visibilidad en motores de IA (GEO) — lo implementado

| Táctica | Antes | Ahora |
|---|---|---|
| Crawlers IA en robots.txt | GPTBot bloqueado | 12 permitidos: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, Meta-ExternalAgent, Amazonbot, CCBot |
| `llms.txt` | No existía | Creado + actualizado en fases 2-5: guías pilar (6 hubs), comparativas money, serie por categoría de insumo y guías clásicas |
| FAQPage schema | Solo en posts | También en /faq (respuestas citables por AI Overviews) |
| Datos consistentes | $3,000/$2,500, 6/20 ciudades | Unificados (clave: las IA amplifican contradicciones) |

**Recomendaciones GEO adicionales (backlog):**
- Respuestas auto-contenidas al inicio de cada guía (las IA citan el primer párrafo; ya lo hacen bien con el bold inicial — mantenerlo).
- Tablas comparativas con números propios (las IA prefieren citar datos estructurados — el blog ya las usa; extender a páginas de categoría).
- Menciones de marca consistentes: "Resurte.me" (no "Resurte" a secas) en todo el copy, schema y redes — facilita que las IA asocien la entidad.
- Perfil de Wikipedia/Wikidata y Google Business Profile a mediano plazo (entidad verificable → Knowledge Graph → más citas).

---

## 6. Plan de acción priorizado

### Crítico (esta semana)
1. ✅ Merge del PR #9 → deploy.
2. ⬜ Corregir `NEXT_PUBLIC_GA_MEASUREMENT_ID` en Vercel (valor: `G-YKJ9ECF267`).
3. ⬜ Reenviar `sitemap.xml` en Google Search Console; verificar en Cobertura que carritos/checkouts salen del índice (usar "Eliminaciones" si alguna ya está indexada).

### Alto (semanas 2–4)
4. ✅ Metadatos del blog: 44/44 aplicados (13 graves en fase 1 + 31 menores en fase 2, Anexo A).
5. ⬜ PageSpeed Insights en home, /cdmx y /blog tras el deploy; si LCP móvil > 2.5 s, atacar payload RSC y bundles.
6. ⬜ Páginas de autor reales + `/about#equipo`.
7. ✅ 4 páginas de comparación/alternativas creadas (3 en fase 2 + `alternativas-sysco-clubes-precio` en fase 3); adicional: `lista-insumos-abrir-restaurante` (brecha de apertura).

### Medio (meses 2–3)
8. ✅ 6 hubs temáticos con página pilar creados (fases 3-4) + interlinking desde 8 posts existentes. Pendiente: enlazar pilares desde home/nav (UI).
9. ⬜ Link building: directorios B2B gastronómicos, CANIRAC, cámaras de comercio locales (20 ciudades = 20 oportunidades locales), guest posts en blogs de la industria restaurantera.
10. ⬜ Google Business Profile para Resurte.me (aunque sea B2B sin tienda: perfil de servicio).

### Largo plazo
11. ⬜ Datos propios publicados ("Índice Resurte.me de precios de insumos") — imán de enlaces y citas de IA.
12. ⬜ Programa de reseñas de clientes B2B (testimonios con nombre y negocio en home).

---

## Fase 2 (2026-09-12) — cierre del backlog y contenido money

### Metadatos: 31/31 menores aplicados
Los 31 archivos del Anexo A se actualizaron en la rama con exactamente los valores redactados en la fase 1. Metodología: cada archivo se obtuvo fresco desde `main` vía API y se re-subió con **solo** los cambios de frontmatter; los cuerpos quedaron byte a byte idénticos a `main`. Verificación por muestreo con re-fetch desde la rama (guia-food-cost-restaurante-2026, google-maps-restaurantes-2026, calculadora-food-cost-gratis): frontmatter nuevo presente y cuerpo intacto en los tres.

**Nota de integridad (transparente):** durante la fase 2 se detectó que 15 de estos archivos habían quedado con cuerpos incorrectos en commits intermedios de la rama (contenido reconstruido en lugar del original). Se restauraron los 15 desde `main` byte a byte y se re-aplicaron únicamente las ediciones de frontmatter del Anexo A. El estado final del árbol es correcto; los commits de restauración (`d9ddbce`…`d027eff`) lo documentan.

### Contenido money creado (3 guías nuevas)

| Slug | Keyword objetivo | Intención |
|---|---|---|
| central-de-abastos-vs-comprar-en-linea | "central de abastos vs comprar en línea", "alternativa central de abastos" | Comparativa/comercial |
| cuanto-cuesta-surtir-restaurante-mes | "cuánto cuesta surtir un restaurante al mes", "gasto mensual insumos restaurante" | Costo/comercial |
| mejores-proveedores-mayoreo-restaurantes | "mejores proveedores de mayoreo para restaurantes", "proveedores alimentos mayoreo México" | Comparativa/comercial |

Las 3 siguen el patrón editorial del blog: respuesta directa en el primer párrafo (citable por IA), tablas con números en MXN, FAQ schema (5 Q&A), casos con números, checklist accionable e interlinking al clúster de proveeduría. Aparecen automáticamente en el índice del blog, el sitemap dinámico y el RSS (el blog se lee del filesystem).

### GEO: llms.txt sincronizado
`public/llms.txt` ahora lista las 3 guías money en "Guías destacadas del blog", para que los asistentes de IA que lo consumen descubran el contenido de comparación.

### Fix adicional
Cover 404 de `tendencias-consumo-restaurantes` (ver 3.4).

---

## Fase 3 (2026-09-12) — hubs, 4ª comparativa y brecha de apertura

### Guías pilar (arquitectura de clusters, estrategia §2)

| Slug | Keyword objetivo | Rol |
|---|---|---|
| guia-proveeduria-restaurantes | "proveeduría para restaurantes" | Hub: mapea las 10 guías del clúster de proveeduría |
| guia-costos-restaurante | "costos de un restaurante" | Hub: mapea el clúster de costos y rentabilidad |

Pendientes 4 pilares: operación, marketing, legal/finanzas y crecimiento.

### Contenido money y apertura

| Slug | Keyword objetivo | Nota |
|---|---|---|
| alternativas-sysco-clubes-precio | "alternativas a Sysco México", "surtir restaurante sin membresía" | Cierra la 4ª página de comparación del plan. Veracidad: fuentes externas no verificables en la sesión → todo dato de terceros hedged; solo hechos verificados de Resurte.me afirmados |
| lista-insumos-abrir-restaurante | "lista de insumos para abrir un restaurante" | Brecha n.º 2 de la estrategia; captura negocios en apertura |

### Interlinking desde posts existentes

| Post origen | Enlaces agregados |
|---|---|
| precios-mayoreo-restaurantes | central-de-abastos-vs-comprar-en-linea, mejores-proveedores-mayoreo-restaurantes, guia-proveeduria-restaurantes (updatedAt refrescado) |
| elegir-proveedor-mayorista | mejores-proveedores-mayoreo-restaurantes, guia-proveeduria-restaurantes |
| guia-food-cost-restaurante-2026 | cuanto-cuesta-surtir-restaurante-mes, guia-costos-restaurante (updatedAt refrescado) |
| cuanto-cuesta-abrir-restaurante-mexico | lista-insumos-abrir-restaurante |

### Control de calidad de la producción por agentes

El MDX de fase 3 se generó con subagentes y se revisó contra `src/lib/blog.ts` antes de publicar. Hallazgo corregido en revisión: el redactor entregó la clave YAML `faqs` en lugar de `faq` — sin esa corrección, los 2 posts nuevos habrían perdido su sección de preguntas y el schema FAQPage. Regla permanente: todo contenido generado por agente se valida contra el schema real del repo antes del push.

---

## Fase 4 (2026-09-12) — los 4 pilares restantes (6/6 hubs)

### Guías pilar creadas

| Slug | Keyword objetivo | Hub de |
|---|---|---|
| guia-operacion-cocina | "operación de cocina restaurante" | Mermas, inventario, mise en place, NOM-251, turnos (19 guías mapeadas) |
| guia-marketing-restaurantes | "marketing para restaurantes" | Google Maps, reseñas, redes, delivery, fidelización (21 guías mapeadas) |
| guia-legal-finanzas-restaurante | "obligaciones fiscales restaurante", "crédito restaurante" | CFDI, impuestos, crédito, salarios, datos (8 guías mapeadas) |
| guia-crecer-restaurante | "cómo hacer crecer un restaurante" | 6 rutas de crecimiento con tabla de decisión (12 guías mapeadas) |

Las 4 con FAQ schema (5 Q&A), tablas MXN y enlaces a pilares hermanos. Veracidad: la guía legal evita tasas/multas específicas (no verificables en la sesión) y remite a "confirma con tu contador".

### Interlinking desde posts existentes (parte 2)

| Post origen | Enlace agregado |
|---|---|
| mise-en-place-cocina-restaurante | guia-operacion-cocina |
| google-maps-restaurantes-2026 | guia-marketing-restaurantes (updatedAt refrescado) |
| facturacion-cfdi-restaurantes | guia-legal-finanzas-restaurante (updatedAt refrescado) |
| franquicias-restaurantes-mexico | guia-crecer-restaurante |

### Producción

2 writers en paralelo (2 pilares cada uno), QA de schema del orquestador antes de cada push (esta vez ambos entregaron la clave `faq` correcta), un commit por etapa: pilares `444c759` + `8d1c692`, interlinking `540ea30` + `ceafa84`, docs/llms `b72fae8`.

---

## Fase 5 (2026-09-12) — brechas de keywords y serie por categoría de insumo

### Guías creadas

| Slug | Keyword objetivo | Nota |
|---|---|---|
| como-funciona-compra-mayoreo-en-linea | "comprar por mayoreo en línea México", "cómo funciona la compra por mayoreo en línea" | Brecha n.º 4 de la estrategia (educación de categoría) |
| proveedores-frutas-verduras-restaurantes | "proveedores de frutas y verduras para restaurantes" | Brecha n.º 6, categoría 1; enlaza a `/cdmx/categoria/frutas-verduras` (2×) |
| proveedores-carne-mayoreo-restaurantes | "proveedores de carne al mayoreo para restaurantes" | Brecha n.º 6, categoría 2; enlaza a `/cdmx/categoria/carnes-aves-pescados` (2×) |
| desechables-mayoreo-restaurantes | "desechables al mayoreo para restaurantes" | Brecha n.º 6, categoría 3; enlaza a `/cdmx/categoria/desechables` (2×) |

### Por qué importa la serie por insumo

Resuelve dos hallazgos a la vez: la brecha de keywords "proveedores de [insumo] para restaurantes" y el hallazgo 2.6 (el blog enlazaba al Panel pero casi nada al catálogo transaccional — las páginas que convierten). Cada guía de la serie enlaza a su página de categoría transaccional con ancla natural.

### Veracidad

Sin precios de mercado actuales (fluctúan y no eran verificables en la sesión): las guías enseñan a evaluar precio por kg útil tras rendimiento, comparar por costo por unidad y verificar calidad en recepción. El ejemplo numérico de carne ($180→$240→$48 por 200 g) es el ya publicado en la guía de food cost. Pendientes de la serie: lácteos/huevo, bebidas y abarrotes.

---

## Anexo A — Backlog de metadatos del blog

### Graves — ✅ aplicados en este PR (registro de valores finales)
| Slug | Campo | Valor aplicado |
|---|---|---|
| costeo-platillo-nuevo-restaurante | title | Costeo de un platillo nuevo: del borrador al menú en 5 pasos |
| costeo-platillo-nuevo-restaurante | description | Cómo costear un platillo nuevo paso a paso: receta, costo por porción, margen y precio de venta, con ejemplo real en pesos mexicanos. |
| sector-restaurantero-mexico-2026 | title | Sector restaurantero en México 2026: cifras clave |
| menu-digital-restaurante-guia | title | Menú digital para restaurante: guía 2026 + plantilla |
| menu-digital-restaurante-guia | description | Todo sobre menús digitales para restaurantes: crea el tuyo gratis, herramientas, cómo subir ventas con QR y plantilla de menú efectiva. |
| proveeduria-mayoreo-restaurantes | title | Proveeduría inteligente: compra mayoreo sin sobreinventario |
| proveeduria-mayoreo-restaurantes | description | Aprende a comprar por mayoreo: volúmenes de compra, márgenes mayoreo vs menudeo, coberturas y un flujo semanal que libera tu capital. |
| margenes-delivery-vs-local | title | Márgenes: delivery vs local, cuál conviene más |
| margenes-delivery-vs-local | description | Comparativa real de márgenes entre local y delivery en México: cuánto ganas por canal, dónde se esconde el costo y cómo mejorar ambos. |
| panel-herramientas-restaurante-guia | title | Panel de Resurte.me: guía de las 7 herramientas |
| panel-herramientas-restaurante-guia | description | Guía del Panel de Resurte.me: costeo de menú, calculadora de mermas, inventario, planificador de pedidos, rentabilidad y kit de apertura. |
| margenes-restaurantes-mexico | title | ¿Cuánto gana un restaurante en México? Márgenes 2026 |
| margenes-restaurantes-mexico | description | Márgenes reales por tipo de cocina en México: food cost, rentabilidad esperada y los números que separan a los que sobreviven de los que cierran. |
| responder-resenas-google-restaurantes | title | Cómo responder reseñas de Google: 12 ejemplos listos |
| responder-resenas-google-restaurantes | description | Responde reseñas de Google como profesional: 12 ejemplos para copiar (positivas, negativas y difíciles) y la fórmula para rankear en Maps. |
| inventario-conteo-ciclico-restaurante | title | Conteo cíclico de inventario en 30 minutos a la semana |
| inventario-conteo-ciclico-restaurante | description | Método de conteo cíclico para restaurantes: qué contar, cuándo, cómo calcular tu merma real y por qué media hora semanal te ahorra miles. |

### Menores (61–79c / 161–194c) — ✅ aplicados en fase 2 (2026-09-12)

Los 31 archivos se actualizaron en la rama con exactamente estos valores; los cuerpos quedaron byte a byte idénticos a `main` (verificado por re-fetch de muestra).

| Slug | Campo | Valor aplicado |
|---|---|---|
| calculadora-food-cost-gratis | title | Calculadora de food cost gratis: cómo usarla paso a paso |
| calculadora-food-cost-gratis | description | Calcula el food cost de tu restaurante gratis: qué datos necesitas, cómo interpretar el resultado y convertirlo en más margen. |
| caso-google-maps-restaurante | title | Caso real: un restaurante llenó sus mesas con Google Maps |
| como-reducir-merma-cocina | description | Plan de 30 días para reducir la merma de tu restaurante: promedios por categoría, causas comunes, acciones semanales y checklist. |
| compra-estacional-restaurante | title | Compra estacional para restaurantes: guía por temporada |
| compra-mayoreo-15-septiembre | title | Compra de mayoreo para el 15 de septiembre sin sobrantes |
| compra-mayoreo-15-septiembre | description | Cómo comprar por mayoreo para fiestas patrias sin quedarte corto ni sobreinventariar: demanda, coberturas, ahorro y calendario. |
| costeo-menu-completo-restaurante | title | Costeo de menú completo: costea todo tu menú en un día |
| costeo-menu-completo-restaurante | description | Cómo costear tu menú completo en un día: método paso a paso, plantilla, margen por platillo y decisión de mantener o quitar. |
| costos-fijos-vs-variables-restaurante | description | Diferencia entre costos fijos y variables en un restaurante, cómo identificarlos y estrategias reales para reducirlos. |
| delivery-insumos-restaurantes | title | Delivery de insumos para restaurantes: guía para dueños |
| elegir-proveedor-mayorista | title | Cómo elegir proveedor mayorista: criterios + plantilla |
| email-sms-restaurantes-fidelizacion | title | Email y SMS para restaurantes: fideliza sin apps caras |
| errores-gestion-restaurante | title | Errores al usar herramientas de gestión en tu restaurante |
| facturacion-cfdi-restaurantes | description | Facturación CFDI 4.0 para restaurantes: cuándo facturar, cómo deducir insumos, qué gastos aplican y cómo evitar multas del SAT. |
| google-maps-restaurantes-2026 | title | Cómo conseguir más clientes con Google Maps en 2026 |
| google-maps-restaurantes-2026 | description | Optimiza tu perfil de Google Business, aparece en el mapa de tu zona, acumula reseñas de 5 estrellas y convierte búsquedas en mesas llenas. |
| guia-food-cost-restaurante-2026 | title | Cómo calcular el food cost de tu restaurante (guía 2026) |
| guia-food-cost-restaurante-2026 | description | Calcula el food cost paso a paso: fórmula exacta, rangos por tipo de cocina, negociación con proveedores y precios con ganancia. |
| higiene-cocina-nom251 | title | Higiene en cocina: rutina diaria que pasa inspección NOM-251 |
| horarios-consumo-restaurante | title | Horarios de mayor consumo en restaurantes: datos y tácticas |
| instagram-restaurantes-contenido | title | Instagram para restaurantes: 12 ideas de contenido semanal |
| instagram-restaurantes-contenido | description | Calendario de Instagram para restaurantes: 12 ideas semanales, qué publicar cada día, conversiones y métricas clave. |
| loyalty-recompensas-restaurante | title | Loyalty para restaurantes: recompensas sin app cara |
| menu-fiestas-patrias-restaurante | description | Cómo armar tu menú de fiestas patrias: platillos rentables, costeo con números reales, compra de insumos y calendario. |
| negociacion-proveedores-restaurante | title | Negociación con proveedores: 10 tácticas que sí funcionan |
| negociacion-proveedores-restaurante | description | Cómo negociar con proveedores de alimentos en México: 10 tácticas para bajar costos, conseguir mejores precios y mejorar tu food cost. |
| plan-marketing-restaurante-plantilla | title | Plan de marketing para restaurantes: plantilla mensual |
| planificador-pedidos-restaurante | title | Planificador de pedidos: cómo funciona y a quién le ahorra |
| precios-mayoreo-restaurantes | title | Precios de mayoreo para restaurantes: ahorra hasta 30% |
| precios-mayoreo-restaurantes | description | Cómo acceder a precios de mayoreo reales sin pedidos mínimos gigantes: proveedores, estrategias de compra y comparativa de ahorros. |
| proveeduria-abc-insumos | title | Proveeduría ABC: prioriza los insumos que mueven tu margen |
| rentabilidad-panel-calculadora | title | Calcula la rentabilidad de tu restaurante en 15 minutos |
| rotacion-inventario-restaurante | title | Rotación de inventario: fórmula y meta por categoría |
| salarios-personal-restaurantes | title | Salarios en restaurantes México 2026: guía de costos |
| subir-precios-menu-restaurante | title | Cómo subir precios de menú sin perder clientes |
| temporada-alta-restaurante | description | Estrategias probadas para llenar tu restaurante en temporada alta: prep, reservas, promociones, marketing local y gestión de pico. |
| tendencias-consumo-restaurantes | title | Tendencias de consumo en restaurantes de México: 3 datos |
| tendencias-consumo-restaurantes | description | Los datos de consumo clave para restaurantes en México: ticket promedio, hábitos de pago, delivery vs local y cómo usarlos en tu menú. |
| turnos-costo-laboral-restaurante | title | Turnos y personal: costo laboral vs productividad |

---

*Metodología: curl/HTML de producción, análisis estático del código (Next.js 16 App Router), medición de TTFB/peso, revisión de robots/sitemap/schema/OG/canonicals en home, ciudad, categoría, blog y post. PageSpeed Insights quedó pendiente por cuota de API — correr manual tras el deploy.*
