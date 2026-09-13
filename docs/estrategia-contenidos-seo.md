# Estrategia de contenidos SEO + GEO — Resurte.me

**Objetivo:** posicionar #1 en Google México y ser la fuente citada por ChatGPT/Perplexity/AI Overviews en el segmento "proveeduría / insumos por mayoreo para restaurantes en México".

---

## 1. Mapa de keywords del segmento

### Money keywords (intención transaccional — las que venden)
| Keyword | Página destino | Estado |
|---|---|---|
| central de abastos en línea / central de abastos digital | `/` | ✅ Optimizada |
| proveedores de alimentos para restaurantes | `/` + hub proveeduría | 🔶 Reforzar en H2/cuerpo |
| frutas y verduras por mayoreo + [ciudad] | `/{ciudad}/categoria/frutas-verduras` | ✅ × 20 ciudades |
| abarrotes por mayoreo + [ciudad] | `/{ciudad}/categoria/abarrotes` | ✅ × 20 |
| carne por mayoreo + [ciudad] | `/{ciudad}/categoria/carnes-aves-pescados` | ✅ × 20 |
| insumos para restaurantes / proveeduría para restaurantes | `/blog/guia-proveeduria-restaurantes` | ✅ Creada (fase 3, PR #9) |
| desechables para restaurantes mayoreo | `/{ciudad}/categoria/desechables` | ✅ × 20 |
| insumos para taquería / pizzería / sushi… | `/{ciudad}/coleccion/*` | ✅ × 14 colecciones |
| precios de central de abastos | post + página de precios | ⬜ Crear (ver Índice de precios) |
| comprar por mayoreo en línea México | `/blog/como-funciona-compra-mayoreo-en-linea` | ✅ Creada (fase 5) |

### Keywords informacionales (las que atraen y construyen autoridad)
Ya cubiertas por los 108 posts: food cost, merma, inventario, NOM-251, CFDI, costeo, Google Maps para restaurantes, comisiones de apps, etc. **Brechas detectadas** (ninguna guía existente las cubre):

1. **"cuánto cuesta surtir un restaurante al mes"** — alto intent, cero competencia seria. ✅ Creada en fase 2: `cuanto-cuesta-surtir-restaurante-mes`.
2. **"lista de insumos para abrir un restaurante"** — captura negocios nuevos = clientes nuevos de Resurte. ✅ Creada en fase 3: `lista-insumos-abrir-restaurante`.
3. **"central de abastos vs proveedor digital"** — comparativa directa (ver §3). ✅ Creada en fase 2: `central-de-abastos-vs-comprar-en-linea`.
4. **"cómo funciona la compra por mayoreo en línea"** — educación de categoría. ✅ Creada en fase 5: `como-funciona-compra-mayoreo-en-linea`.
5. **"precio del kilo de [insumo] hoy"** — la keyword de mayor volumen del segmento; se ataca con el Índice de precios (§5). ⬜ Pendiente (requiere exponer datos del catálogo).
6. **"proveedores de [insumo específico] en [ciudad]"** — aguacate, tortilla, carne de cerdo… posts programáticos por insumo top. ✅ Serie por categoría COMPLETA (fases 5-6): `proveedores-frutas-verduras-restaurantes`, `proveedores-carne-mayoreo-restaurantes`, `proveedores-lacteos-huevo-restaurantes`, `proveedores-bebidas-mayoreo-restaurantes`, `abarrotes-mayoreo-restaurantes`, `desechables-mayoreo-restaurantes`. Siguiente nivel (opcional): posts por insumo específico (aguacate, tortilla) si el volumen lo justifica.

---

## 2. Arquitectura de clusters (pillar pages)

Reorganizar el blog plano en 6 hubs. Cada hub: 1 página pilar (guía madre enlazada desde el home/nav) + posts existentes enlazados hacia ella + ella enlazando a los posts.

| Hub | Página pilar | Posts existentes que alimenta |
|---|---|---|
| 💰 Costos y rentabilidad | `/blog/guia-costos-restaurante` ✅ creada (fase 3) | food cost, costeo, márgenes, punto de equilibrio, utilidad, KPIs (~25 posts) |
| 📦 Proveeduría y mayoreo | `/blog/guia-proveeduria-restaurantes` ✅ creada (fase 3) | elegir proveedor, negociación, mayoreo vs menudeo, ABC insumos, recepción (~18 posts) |
| 🍳 Operación de cocina | `/blog/guia-operacion-cocina` ✅ creada (fase 4) | mermas, inventario, mise en place, NOM-251, almacenamiento (~15 posts) |
| 📣 Marketing y clientes | `/blog/guia-marketing-restaurantes` ✅ creada (fase 4) | Google Maps, Instagram, reseñas, loyalty, delivery (~20 posts) |
| 📋 Legal y finanzas | `/blog/guia-legal-finanzas-restaurante` ✅ creada (fase 4) | CFDI, impuestos, crédito, salarios, legislación (~12 posts) |
| 🚀 Crecimiento | `/blog/guia-crecer-restaurante` ✅ creada (fase 4) | franquicias, food trucks, apertura, temporada (~12 posts) |

**Por qué:** los clusters consolidan PageRank temático — Google posiciona mejor "sitios sobre X" que "páginas sueltas sobre X". Con 108 posts ya tienen la materia prima; solo falta la estructura.

**Estado:** 6/6 pilares creadas (fases 3-4) con interlinking desde 8 posts existentes hacia las guías nuevas. Pendiente: enlazar las pilares desde home/nav (requiere cambio de UI — evaluar en el PR de mejoras de sitio).

---

## 3. Contenido de comparación (alto intent, baja competencia) — CREAR

1. **"Resurte.me vs ir a la Central de Abastos: costo real comparado"** — tiempo, transporte, merma, precio. La keyword "central de abastos" tiene volumen enorme; esta página captura a quien ya considera el canal tradicional. ✅ Creada en fase 2: `central-de-abastos-vs-comprar-en-linea`.
2. **"Las 5 formas de surtir tu restaurante en México (2026): costos y cuál conviene"** — mercado, central, distribuidor, SAM's/Costco, Resurte.me. Formato tabla = imán de citas de IA. ✅ Creada en fase 6: `formas-surtir-restaurante-mexico` (tabla maestra + decisión por etapa del negocio).
3. **"Alternativas a [principal competidor] para surtir tu restaurante"** — investigar competidores activos y crear una por cada uno con búsquedas. ✅ Creada en fase 3: `alternativas-sysco-clubes-precio` (con reglas de veracidad hedged: fuentes externas no verificables en la sesión, solo hechos verificados de Resurte.me afirmados).
4. **"Cuánto cuesta surtir un restaurante al mes en México (desglose por tamaño)"** — con datos propios de ticket promedio. E-E-A-T + citas. ✅ Creada en fase 2: `cuanto-cuesta-surtir-restaurante-mes`.

**Tips de formato para estas páginas:**
- Tabla comparativa arriba del fold (Google y las IA la extraen directo).
- Responder la pregunta en las primeras 2 líneas (snippet + cita de IA).
- Números reales propios, no genéricos.
- FAQ schema con las 5 preguntas de la keyword.

---

## 4. Tips de blog posts (aplicar a todo post nuevo y al refrescar existentes)

### Estructura que rankea y se cita
1. **Respuesta directa en el primer párrafo** (2–3 líneas en bold) — ya lo hacen, mantenerlo: es lo que Google usa para featured snippets y las IA para citar.
2. **Una tabla de datos por post mínimo** — las tablas son el formato #1 extraído por AI Overviews.
3. **Números propios en MXN** — diferenciador E-E-A-T: cualquiera escribe "reduce tu merma"; nadie más dice "de 9% a 5% son $4,800/mes en compras de $120,000".
4. **FAQ schema en todos** — ya lo hacen; validar con Rich Results Test tras cada publicación.
5. **Enlaces internos: 3–5 por post** — 1 al hub/pilar, 1–2 a posts hermanos, 1 a una página de categoría/colección transaccional (hoy enlazan al Panel pero poco al catálogo; el catálogo es el que convierte). **Avance fases 5-6:** la serie por categoría de insumo ya enlaza a las 6 categorías transaccionales (`/cdmx/categoria/*`).
6. **Actualizar > crear** — refrescar un post que ya rankeó (nueva fecha, dato nuevo, `updatedAt`) sube posiciones más rápido que publicar uno nuevo. Ritmo sugerido: 4 refreshes + 2 nuevos por mes.
7. **Título ≤60c con keyword al frente y año cuando aplique** ("…en 2026"), description 140–160c con beneficio + CTA implícito.
8. **Slug corto y estable** — nunca cambiarlo (el sitemap y los enlaces internos dependen de él).

### Calendario editorial sugerido (Q4 2026)
| Semana | Pieza | Cluster | Tipo |
|---|---|---|---|
| 1 | Resurte.me vs Central de Abastos | Proveeduría | Comparativa 💰 |
| 2 | Refresh: guia-food-cost-restaurante-2026 → 2027 | Costos | Refresh |
| 2 | Cuánto cuesta surtir un restaurante al mes | Costos | Nueva 💰 |
| 3 | Índice Resurte.me de precios de insumos (página viva) | Proveeduría | Asset 🔗 |
| 3 | Refresh: nom-251 + google-maps-2026 | Legal/Marketing | Refresh |
| 4 | Lista de insumos para abrir un restaurante (por tipo) | Crecimiento | Nueva |
| 4 | Refresh: 4 posts con más impresiones según GSC | Varios | Refresh |

---

## 5. El activo estrella: Índice Resurte.me de precios de insumos

**La jugada #1 para links y citas de IA.** Página viva (`/precios` o `/blog/indice-precios-insumos`) con el precio semanal de los 30 insumos top (aguacate, limón, pollo, res, tortilla, aceite…) por ciudad, alimentada por el propio catálogo.

**Por qué funciona:**
- "precio del aguacate hoy" y similares suman cientos de miles de búsquedas/mes en México.
- Nadie en el segmento publica datos de precios actuales → medios, blogs y IA citan al único que sí.
- Contenido programático: ya tienen los datos en Supabase; solo hay que exponerlos con schema `Dataset`/`Table`.
- Es el activo que convierte a Resurte.me de "tienda" en "fuente de datos del sector" — exactamente lo que las IA citan cuando les preguntan "¿dónde comprar insumos para restaurante?".

**MVP:** tabla de 30 insumos × precio promedio semanal, actualizada por cron desde el catálogo, con nota metodológica y fecha visible. Después: histórico con gráfica, descarga CSV, comparativo por ciudad.

---

## 6. Link building y autoridad (off-page)

| Táctica | Esfuerzo | Impacto |
|---|---|---|
| Alta en directorios B2B gastronómicos y de proveedores (MX) | Bajo | Base |
| CANIRAC y cámaras de comercio/restauranteras estatales (20 ciudades) | Medio | Alto — links locales relevantes |
| Google Business Profile (perfil de servicio B2B) | Bajo | Alto para entidad/local |
| Índice de precios (§5) → outreach a medios de economía/food | Medio | Muy alto |
| Guest posts en blogs de la industria (software POS, asociaciones) | Medio | Medio |
| Testimonios cruzados con clientes B2B (ellos enlazan "nuestro proveedor") | Bajo | Medio |
| Wikidata/Wikipedia a mediano plazo (entidad → Knowledge Graph) | Medio | Alto para GEO |

---

## 7. Medición (sin esto, nada de lo anterior se optimiza)

1. **GA4** — corregir env var (crítico, ver auditoría).
2. **Search Console** — verificar propiedad (hay `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`), reenviar sitemap tras merge del PR #9, revisar semanalmente: queries con impresiones sin clics (oportunidades de título), páginas que bajan (refresh).
3. **Metas 90 días:**
   - Top 3 en "central de abastos digital" y "proveeduría para restaurantes".
   - Top 10 en 10+ keywords "[categoría] por mayoreo [ciudad]".
   - Primera cita verificable de Resurte.me en ChatGPT/Perplexity para "proveedores de insumos para restaurantes en México".
4. **Monitoreo GEO:** preguntar mensualmente a ChatGPT, Perplexity y Gemini las 10 queries del segmento y registrar si citan resurte.me. Con `llms.txt` + crawlers abiertos + datos consistentes, las citas llegan en 4–12 semanas.
