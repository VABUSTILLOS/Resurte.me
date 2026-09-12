# Auditoría SEO completa — Resurte.me (2026-09-12)

**Alcance:** auditoría técnica, on-page, contenido y visibilidad en motores de IA (GEO) sobre el sitio en producción y el código fuente. Cambios implementados en el PR #9 (`seo/auditoria-2026-09`).

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
| 8 | 39 títulos >60c y 25 descriptions >160c en blog | Medio — truncamiento en SERP | ✅ 13 graves corregidos; 31 menores en Anexo A |
| 9 | Copy inconsistente (envío gratis $3,000 vs $2,500; 6 vs 20 ciudades) | Bajo — confianza/E-E-A-T | ✅ Corregido en /faq |
| 10 | HTML SSR pesado (396–573 KB por página) | Medio — LCP/INP en móvil | 📋 Recomendación |

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
- **Mejora sugerida:** hub pages por tema en el blog (ver estrategia de contenidos) y enlazar las páginas de colección (`/coleccion/taquerias-antojitos`) desde los artículos relacionados — hoy el blog enlaza al Panel pero poco al catálogo transaccional.

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

- **Backlog restante:** 31 casos menores (títulos 61–79c / descriptions 161–194c) con reemplazos ya redactados en el Anexo A. Google los trunca con "…" — no es penalización, pero baja el CTR.

### 3.2 Lo que está bien (no tocar)
- Títulos únicos con keyword al frente y marca al final en ciudades/categorías.
- Un H1 por página; jerarquía H2/H3 lógica.
- Canonicals auto-referenciales correctos en home, ciudades, categorías y blog.
- OG/Twitter cards con imagen 1200×630 dinámica.
- 1 sola imagen sin alt por página (decorative, aceptable).

### 3.3 Copy inconsistente — corregido
- `/faq` decía envío gratis desde $3,000 (el resto del sitio: $2,500) y listaba 6 ciudades (son 20). Inconsistencias así erosionan E-E-A-T y confunden a los motores de IA que citan el sitio.

---

## 4. Contenido y E-E-A-T

**Fortalezas:** 108 guías largas con tablas, números en MXN, FAQ schema propio por post, CTAs al producto, autor declarado ("Equipo Resurte.me — Especialistas en restaurantes"). Cobertura temática amplia: costos, proveeduría, mermas, marketing, NOM-251, CFDI.

**Brechas (ver estrategia de contenidos para el plan completo):**
1. **Sin páginas de autor** — "Equipo Resurte.me" no es una entidad verificable. Crear `/about#equipo` con autores reales, credenciales y foto; enlazar desde cada post (mejora E-E-A-T directa).
2. **Sin contenido "money" de comparación** — faltan páginas tipo "Resurte.me vs ir a la Central de Abastos", "alternativas a [competidor]", "cuánto cuesta surtir un restaurante al mes". Alto intent comercial, competencia baja.
3. **Sin páginas hub temáticas** — 108 posts planos bajo /blog. Agrupar en 6 hubs (costos, proveeduría, operaciones, marketing, legal, crecimiento) con página pilar cada uno.
4. **Fechas de actualización** — los posts tienen `updatedAt`; verificar que se muestre visible en la página (señal de frescura).

---

## 5. Visibilidad en motores de IA (GEO) — lo implementado

| Táctica | Antes | Ahora |
|---|---|---|
| Crawlers IA en robots.txt | GPTBot bloqueado | 12 permitidos: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, Meta-ExternalAgent, Amazonbot, CCBot |
| `llms.txt` | No existía | Creado: qué es Resurte.me, cobertura, URLs clave, guías top, contacto |
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
4. 🔶 Metadatos del blog: los 13 casos graves ya se aplicaron en este PR; quedan 31 menores (Anexo A — reemplazos listos).
5. ⬜ PageSpeed Insights en home, /cdmx y /blog tras el deploy; si LCP móvil > 2.5 s, atacar payload RSC y bundles.
6. ⬜ Páginas de autor reales + `/about#equipo`.
7. ⬜ 4 páginas de comparación/alternativas (ver estrategia).

### Medio (meses 2–3)
8. ⬜ 6 hubs temáticos con página pilar + interlinking.
9. ⬜ Link building: directorios B2B gastronómicos, CANIRAC, cámaras de comercio locales (20 ciudades = 20 oportunidades locales), guest posts en blogs de la industria restaurantera.
10. ⬜ Google Business Profile para Resurte.me (aunque sea B2B sin tienda: perfil de servicio).

### Largo plazo
11. ⬜ Datos propios publicados ("Índice Resurte.me de precios de insumos") — imán de enlaces y citas de IA.
12. ⬜ Programa de reseñas de clientes B2B (testimonios con nombre y negocio en home).

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

### Menores (61–79c / 161–194c) — pendientes, reemplazos listos
| Slug | Campo | Nuevo valor |
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
