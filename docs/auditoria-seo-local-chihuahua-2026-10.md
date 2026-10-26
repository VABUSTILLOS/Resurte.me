# Auditoría SEO local — Resurte.me opera en Chihuahua (2026-10-25)

**Alcance:** señales de localización (geo/NAP), marcado estructurado, metadatos, canibalización de URLs y contenido local. Verifica que el sitio declare de forma consistente que opera en **Chihuahua, Chihuahua, México**, y corrige lo que lo contradecía.

**Pregunta que responde esta auditoría:** si un buscador o un motor de respuesta (ChatGPT, Perplexity, AI Overviews) tuviera que decir *dónde opera Resurte.me*, ¿podría responder "Chihuahua" con evidencia del propio sitio?

**Respuesta antes de los cambios:** no con confianza. El sitio decía "México" en todas sus superficies principales y **Ciudad de México** en cuatro páginas legales e institucionales. La ciudad aparecía en el selector y en la URL, no en la entidad.

**Respuesta después:** sí. La ciudad está en el H1, en el `<title>` de la portada, en el NAP del pie de página, en el `Organization`, en el `WholesaleStore` de la ciudad, en un `LocalBusiness` dedicado, en un `FAQPage` local, en una página de cobertura que declara **toda la ciudad**, en tres guías locales, en `llms.txt` y en el manifiesto PWA.

---

## 1. Resumen ejecutivo

**Puntaje de señal local antes: 48/100. Después: 88/100** (ponderado: entidad y NAP pesan más que contenido).

| Dimensión | Antes | Después | Qué lo movió |
|---|---|---|---|
| Entidad y NAP | 20 | 95 | `src/lib/business.ts` como fuente única; NAP en el pie; `LocalBusiness` en `/contact` y `/soporte` |
| Marcado estructurado | 55 | 90 | `Organization` con dirección/teléfono/horario; `WholesaleStore` con NAP completo; `FAQPage` local |
| Metadatos | 40 | 85 | Chihuahua en `<title>`/description de portada y de 9 páginas secundarias |
| Contenido local | 30 | 88 | Sección "Central de abastos digital en Chihuahua" con cobertura de toda la ciudad, 7 preguntas locales, página `/chihuahua/zonas-de-entrega` y 3 guías locales |
| Coherencia legal | 25 | 100 | Cero referencias a CDMX; jurisdicción y domicilio en Chihuahua |
| Canibalización / rastreo | 60 | 90 | Canónica corregida, sitemap alineado con el routing real, `lastmod` honesto |

**Los tres hallazgos que más costaban:**

1. **El sitio decía operar en CDMX.** `/faq` prometía "ruta exprés en CDMX", `/about` declaraba base en Ciudad de México, `/careers` publicaba vacantes "CDMX / MTY / GDL" y `/terms` fijaba jurisdicción en Ciudad de México. Para un negocio local esto es una contradicción de entidad: Google resuelve la ubicación por consenso entre superficies, y cuatro páginas legales en contra pesan más que un selector de ciudad.
2. **No había NAP en ninguna parte visible.** Ni dirección, ni teléfono, ni horario en el pie de página. El `Organization` del JSON-LD no tenía `address` ni `telephone`. Sin NAP no hay forma de resolver la entidad contra un Google Business Profile.
3. **La portada no mencionaba Chihuahua.** El `<title>` era "Resurte.me — Central de Abastos Digital" y el H1 no incluía la ciudad. La señal local más fuerte del sitio (la URL `/chihuahua` y su landing) colgaba de una portada que no la respaldaba.

---

## 2. Inventario de señales locales (estado final)

### 2.1 Fuente única de NAP — `src/lib/business.ts`

Todo dato de contacto del sitio sale de aquí. Antes estaba repetido en 14 archivos con el teléfono hardcodeado como `"5216145337486"`.

| Dato | Valor | Exportado como |
|---|---|---|
| Nombre | Resurte.me | `SITE_NAME` (`author.ts`) |
| Localidad | Chihuahua | `BUSINESS_ADDRESS.addressLocality` |
| Estado | Chihuahua | `BUSINESS_ADDRESS.addressRegion` |
| País | MX | `BUSINESS_ADDRESS.addressCountry` |
| Teléfono | +52 614 533 7486 | `PHONE_E164` / `PHONE_DISPLAY` |
| WhatsApp | +52 1 614 533 7486 | `WHATSAPP_NUMBER` / `WHATSAPP_HREF` |
| Correo | hola@resurte.me | `BUSINESS_EMAIL` |
| Horario | Lun–Vie 8:00–18:00 · Sáb 8:00–14:00 | `BUSINESS_HOURS` / `BUSINESS_HOURS_SUMMARY` |
| Geo | 28.6353, -106.0889 | `BUSINESS_GEO` |
| Etiqueta completa | Chihuahua, Chihuahua, México | `BUSINESS_LOCATION_LABEL` |

**Calle y código postal** se leen de `NEXT_PUBLIC_BUSINESS_STREET` y `NEXT_PUBLIC_BUSINESS_POSTAL_CODE`. Mientras no estén configurados, el schema declara localidad + estado + país, que es válido para un negocio de área de servicio. **Pendiente de negocio:** confirmar si existe una dirección física publicable (ver §5).

### 2.2 Dónde aparece la ciudad ahora

| Superficie | Señal |
|---|---|
| `<title>` portada | "Resurte.me — Central de Abastos Digital en Chihuahua" |
| H1 portada | "Central de abastos digital en Chihuahua" |
| `<title>` ciudad | "Resurte.me — Central de Abastos Digital en Chihuahua" |
| Pie de página | `<address>` con ciudad, `tel:` y horario |
| `Organization` | `address`, `telephone`, `email`, `foundingLocation`, `openingHoursSpecification` |
| `WholesaleStore` (`/chihuahua`) | NAP completo + `areaServed` con la ciudad y 18 colonias de ejemplo |
| `LocalBusiness` (`/contact`, `/soporte`) | NAP completo + `hasMap` + `potentialAction` a WhatsApp |
| `FAQPage` (`/chihuahua`) | 7 preguntas locales, la primera "¿Dónde opera Resurte.me?" |
| `/chihuahua/zonas-de-entrega` | H1 con la ciudad, cobertura de toda la ciudad, 18 colonias de ejemplo, `Service` con `areaServed` de 19 entidades, `FAQPage` |
| `/contact` | Tarjeta de oficina con `BUSINESS_LOCATION_LABEL` |
| `/privacy` | Domicilio del responsable |
| `/terms` | Jurisdicción: Chihuahua, Chihuahua |
| `/careers` | "Chihuahua / Remoto" |
| `/about` | Cobertura de entrega en Chihuahua |
| `/faq` | Cobertura de entrega en Chihuahua |
| `llms.txt` / `llms-full.txt` | "Base de operaciones: Chihuahua, Chihuahua, México" |
| `manifest.json` | Nombre y descripción con Chihuahua |
| `opengraph-image` | Alt y texto con Chihuahua |
| `/blog/central-de-abastos-chihuahua` | Guía local: la consulta literal, con `FAQPage` de 5 preguntas |
| `/blog/proveedores-abarrotes-mayoreo-chihuahua` | Guía local de intención comercial |
| `/blog/cuanto-cuesta-surtir-restaurante-chihuahua` | Guía local de costos, enlaza al índice de precios |

### 2.3 Contenido local nuevo

- **Sección "Central de abastos digital en Chihuahua"** en la landing (`src/components/city/landing/local-coverage.tsx`): dos párrafos de posicionamiento, la declaración de cobertura de toda la ciudad, 18 colonias de ejemplo y 7 preguntas frecuentes locales. El texto visible y el `FAQPage` salen de la misma fuente (`src/lib/local-content.ts`), así que no pueden desincronizarse.
- **Página `/chihuahua/zonas-de-entrega`** (`src/app/[slug]/zonas-de-entrega/page.tsx`): la URL dedicada que responde "¿entregan en mi colonia?". Lleva H1 con la ciudad, la cobertura de toda la ciudad, las 18 colonias de ejemplo, el modelo de reparto, el horario y las 7 preguntas. Marcado: `BreadcrumbList` + `Service` con `areaServed` de 19 entidades (la ciudad primero, luego 18 colonias) + `FAQPage`. Las ciudades sin cobertura conservan la URL con `noindex, follow` y sin colonias: anunciar reparto donde no operamos sería inventar cobertura.
- **`areaServed` con colonias** en el `WholesaleStore`: la ciudad como alcance real más 18 `Place` de ejemplo con las colonias que la página lista de forma visible. Ciudades sin operación no reciben colonias inventadas.
- **Tres guías locales** en `src/content/blog/`: la consulta literal ("central de abastos en Chihuahua"), la intención comercial ("proveedores de abarrotes al mayoreo en Chihuahua") y la de costos ("cuánto cuesta surtir un restaurante en Chihuahua"). Cada una enlaza a las categorías de Chihuahua y al índice de precios, para que el PageRank local fluya a las páginas que convierten. Ver §4.1.

---

## 3. Hallazgos corregidos

### 3.1 Contradicciones de ubicación — CRÍTICO

| Archivo | Antes | Ahora |
|---|---|---|
| `src/app/faq/page.tsx` | "ruta exprés en CDMX" | `DELIVERY_COVERAGE_PROSE` (Chihuahua) |
| `src/app/about/page.tsx` | "base en Ciudad de México" | `DELIVERY_COVERAGE_PROSE` |
| `src/app/careers/page.tsx` | "CDMX / MTY / GDL", "CDMX" | "Chihuahua / Remoto", "Chihuahua" |
| `src/app/terms/page.tsx` | Jurisdicción CDMX | "Chihuahua, Chihuahua" |
| `src/components/city/city-landing.tsx` | Fallback `"Ciudad de México"` / `"CDMX"` | `HOME_CITY.name` / `HOME_CITY.state` |

### 3.2 NAP ausente — CRÍTICO

- **Pie de página:** bloque `<address>` con ciudad, teléfono (`tel:`) y horario. Es la superficie que Google usa para validar el NAP contra el GBP.
- **`Organization`:** ahora lleva `address`, `telephone`, `email`, `foundingLocation` y `openingHoursSpecification`. Antes solo tenía nombre, logo y `sameAs`.
- **`/contact` y `/soporte`:** `LocalBusiness` con `@id` estable (`https://resurte.me/#localbusiness`), NAP, `hasMap` y `potentialAction` a WhatsApp.

### 3.3 Teléfono hardcodeado en 14 archivos — ALTO

`"5216145337486"` estaba repetido en `layout.tsx`, `cart`, `checkout`, `tracking`, `product-detail`, `not-found`, `r/not-found`, `restaurantes`, `negocio/cotizaciones`, `negocio/credito`, `aliado-negocio`, `newsletter-cta`, `payment-instructions` y `workflows.ts`. Un cambio de número obligaba a tocar 14 archivos y garantizaba que alguno quedara viejo. Todos consumen ahora `WHATSAPP_NUMBER` / `WHATSAPP_HREF` de `business.ts`.

### 3.4 Canibalización `/` vs `/chihuahua` — ALTO (corregido dos veces)

**Primer intento (incorrecto):** declarar `/chihuahua` alias de `/` con canónica a la portada. **Por qué estaba mal:** `src/proxy.ts` resuelve `/` por IP y responde **307** hacia la ciudad activa. Googlebot entra a `/`, recibe un 307 a `/chihuahua`, y ahí encuentra una canónica que apunta a `/` — que redirige de vuelta. Google descarta esa canónica y la señal queda en conflicto.

**Corrección final:** cada ciudad es canónica de sí misma. La landing indexable es `/chihuahua`; la portada `/` es un router geográfico y **no se anuncia en el sitemap**. `/chihuahua` entra al sitemap con prioridad 1.0.

### 3.5 `lastmod` falso en el sitemap — MEDIO

`generateSitemapXml()` emitía `lastmod` con la fecha del día en **todas** las entradas, incluidas `/privacy`, `/terms` y `/careers`, que no cambian. Un `lastmod` que siempre es "hoy" entrena a Google a ignorar la etiqueta. Ahora solo se emite cuando existe una fecha real: las páginas de catálogo llevan el día del catálogo (`dayKeyOf(DEFAULT_TIMEZONE)`, día de negocio, no UTC); las institucionales no llevan.

### 3.6 `WebSite` duplicado en `/blog` — MEDIO

`/blog` emitía un segundo nodo `WebSite` con su propio `SearchAction`, compitiendo con el de la portada por el mismo `@id` conceptual. Reemplazado por `CollectionPage` (`@id: /blog#collectionpage`, `isPartOf: /#website`, `about: /#organization`).

### 3.7 `"chihuahua"` hardcodeado en `generateStaticParams` — MEDIO

Tres rutas (`categoria`, `coleccion`, `producto`) tenían el slug literal. Si mañana se activa otra ciudad, esas rutas no la generarían. Ahora usan `DEFAULT_CITY_SLUG`.

### 3.8 `ACTIVE_ZONES` hardcodeado en `/ciudades` — MEDIO

La página declaraba zonas de entrega en una constante propia, desconectada de `ACTIVE_CITIES`. Ahora se deriva, y la página lleva `BreadcrumbList` + `WholesaleStore` JSON-LD.

### 3.9 Metadatos sin ciudad — MEDIO

Nueve páginas tenían `<title>`/description genéricos sin Chihuahua: `/precios`, `/preguntas`, `/about`, `/contact`, `/ciudades`, `/negocio/cotizaciones`, `/negocio/credito`, `/negocio/facturacion` y la portada. Todas localizadas, con `alternates.canonical` explícita.

### 3.10 Beneficio de envío del nivel Oro peor que la línea base — MEDIO

Al confirmar el umbral de envío gratis ($500), quedó expuesto que `/recompensas` prometía en el nivel **Oro** "Envío gratis en pedidos desde $1,500" — un umbral **tres veces más alto** que el que ya tiene cualquier cliente. El cliente pagaba por subir de nivel para recibir menos. Corregido a una escalera monótona:

| Nivel | Antes | Ahora |
|---|---|---|
| Oro | Envío gratis desde $1,500 | Envío gratis sin mínimo |
| Diamante | Envío gratis sin mínimo | Envío prioritario sin mínimo |

`src/app/recompensas/_components/types.test.ts` fija el invariante: ningún nivel puede prometer un umbral de envío mayor a `FREE_SHIPPING_MXN`, y el beneficio no se repite dentro de un nivel. Es el mismo patrón de guard que protege los datos comerciales en el resto del sitio: una contradicción verificable es un riesgo de E-E-A-T que los motores de respuesta amplifican.

---

## 4. Plan de mejoras

### Fase 0 — Verificación de datos (bloqueante) ✅ parcial

- [x] Confirmar ciudad y estado: Chihuahua, Chihuahua, MX.
- [x] Confirmar teléfono, correo y horario.
- [ ] **Confirmar dirección física publicable** (calle + CP). Sin ella el schema queda en localidad/estado/país, que es válido pero más débil para el Local Pack.
- [ ] **Confirmar si "5,000+ negocios" y "98%" son verificables.** Siguen publicados sin respaldo; si no lo son, hay que bajarlos.

### Fase 1 — Entidad y NAP ✅

- [x] `src/lib/business.ts` como fuente única.
- [x] `Organization` con NAP, `foundingLocation` y horario.
- [x] `WholesaleStore` con NAP completo y `areaServed` con la ciudad y colonias de ejemplo.
- [x] `LocalBusiness` en `/contact` y `/soporte`.
- [x] NAP visible en el pie de página.
- [x] Migrar los 14 teléfonos hardcodeados.

### Fase 2 — Metadatos y coherencia ✅

- [x] Chihuahua en `<title>`, description, keywords y Open Graph de la portada.
- [x] Chihuahua en el H1 de la landing.
- [x] Cero referencias a CDMX.
- [x] Jurisdicción y domicilio legal en Chihuahua.
- [x] Metadatos localizados en 9 páginas secundarias.
- [x] `manifest.json` y `opengraph-image` con Chihuahua.

### Fase 3 — Contenido local ✅

- [x] Sección "Central de abastos digital en Chihuahua" con cobertura de toda la ciudad, colonias de ejemplo y CTA de confirmación de horario.
- [x] `FAQPage` local con 7 preguntas (visible + marcado).
- [x] Página `/chihuahua/zonas-de-entrega` con `Service` + `areaServed` (ciudad primero, colonias de ejemplo), en el sitemap con prioridad 0.8.
- [x] `llms.txt` y `llms-full.txt` con base de operaciones explícita.
- [x] **Guías locales** (ver §4.1): 3 publicadas, con `FAQPage`, `BlogPosting` y enlaces a las categorías de Chihuahua.

### Fase 4 — Canibalización y rastreo ✅

- [x] Canónica de ciudad corregida (self-canonical).
- [x] Sitemap alineado con el routing real: `/chihuahua` dentro, `/` fuera.
- [x] `lastmod` honesto.
- [x] `WebSite` duplicado de `/blog` reemplazado por `CollectionPage`.
- [x] `DEFAULT_CITY_SLUG` en los tres `generateStaticParams`.

### Fase 5 — Google Business Profile y citaciones 🔜 (requiere acción externa)

No se puede hacer desde el repositorio. Orden recomendado:

1. **Crear/reclamar el GBP** en `business.google.com` con el NAP exacto de `business.ts`. Categoría primaria: *Wholesale grocer*. Categorías secundarias: *Food products supplier*, *Restaurant supply store*.
2. **Configurar el área de servicio** con Chihuahua capital (no una dirección si no hay local publicable).
3. **Subir 10+ fotos** reales: almacén, producto, flota, equipo.
4. **Publicar el primer post** del GBP con la propuesta de valor (sin membresía, envío gratis desde $500).
5. **Citaciones consistentes** (NAP idéntico, carácter por carácter) en: Facebook, Instagram, LinkedIn, Google Maps, Apple Maps, Bing Places, Waze, Yelp México, Páginas Amarillas, Cámara Nacional de la Industria Restaurante (CANIRAC) Chihuahua, COPARMEX Chihuahua.
6. **Configurar `NEXT_PUBLIC_GOOGLE_BUSINESS_URL`** en Vercel. En cuanto exista, entra automáticamente al `sameAs` y al `hasMap` del schema.

### Fase 6 — Medición 🔜

1. **Google Search Console:** verificar la propiedad, enviar `sitemap.xml`, revisar *Rendimiento → Consultas* filtrando por "chihuahua".
2. **Línea base** (guardar antes de la primera semana post-deploy): impresiones y clics de consultas con "chihuahua", posición media, CTR.
3. **Bing Webmaster Tools:** importar desde GSC.
4. **Rich Results Test** sobre `/`, `/chihuahua`, `/contact` y `/soporte` para confirmar que `LocalBusiness`, `WholesaleStore` y `FAQPage` son válidos.
5. **Monitoreo mensual:** consultas locales nuevas, apariciones en Local Pack, clics desde GBP.

### 4.1 Backlog de contenido local

| Prioridad | Pieza | Intención que cubre | Estado |
|---|---|---|---|
| Alta | "Central de abastos en Chihuahua: qué es y cómo comprar por mayoreo" | Informacional — la consulta literal | ✅ `/blog/central-de-abastos-chihuahua` |
| Alta | "Proveedores de abarrotes al mayoreo en Chihuahua" | Comercial — alta intención | ✅ `/blog/proveedores-abarrotes-mayoreo-chihuahua` |
| Alta | "Zonas de entrega de insumos en Chihuahua capital" | Navegacional-local | ✅ página dedicada `/chihuahua/zonas-de-entrega` |
| Media | "Cuánto cuesta surtir un restaurante en Chihuahua" | Informacional — usa el índice de precios | ✅ `/blog/cuanto-cuesta-surtir-restaurante-chihuahua` |
| Media | "Mercado de abastos de Chihuahua vs. proveedor en línea" | Comparativa — captura tráfico del mercado físico | 🔜 |
| Media | "Trámites para abrir un restaurante en Chihuahua" | Informacional — atrae al segmento objetivo | 🔜 |
| Baja | "Los 10 insumos que más suben de precio en Chihuahua" | Recurrente — se apoya en el índice semanal | 🔜 |

Cada guía enlaza a `/chihuahua/categoria/{slug}` y cita el índice de precios, para que el PageRank local fluya a las páginas que convierten. Las tres publicadas cumplen el contrato de contenido del blog (`respuestaRapida` ≤50 palabras, texto plano, distinta de `description`), emiten `BlogPosting` + `BreadcrumbList` + `FAQPage` y aparecen en el sitemap.

**Diferenciación deliberada:** la guía de costos es local (flete, distancia a centros de distribución, mezcla de canales en la capital) y enlaza a la pieza nacional `/blog/cuanto-cuesta-surtir-restaurante-mes` para no canibalizarla. La de proveedores es comercial y no repite el marco de food cost. La de central de abastos ataca la consulta literal y desemboca en la comparativa ya existente `/blog/central-de-abastos-vs-comprar-en-linea`.

---

## 5. Supuestos y pendientes de negocio

Estos puntos **no se pueden resolver desde el código** y quedan documentados para que no se confundan con trabajo terminado:

1. **Dirección física.** No hay calle ni código postal en el repositorio. El schema declara localidad, estado y país (válido para negocio de área de servicio). Si existe una dirección publicable, configurar `NEXT_PUBLIC_BUSINESS_STREET` y `NEXT_PUBLIC_BUSINESS_POSTAL_CODE` y el NAP se completa solo en las 6 superficies que lo consumen.
2. **Google Business Profile.** No existe URL configurada. `NEXT_PUBLIC_GOOGLE_BUSINESS_URL` está vacío, así que `sameAs` y `hasMap` caen a una búsqueda por coordenadas. Al configurarla, el schema mejora sin tocar código.
3. **Cifras sin respaldo.** "5,000+ negocios" y "98% de satisfacción" siguen publicados. Si no son verificables, hay que bajarlos: una cifra inflada es un riesgo de E-E-A-T que la IA amplifica.

### 5.1 Decisiones de negocio confirmadas

- **Envío gratis desde $500 MXN** (confirmado 2026-10-25). `FREE_SHIPPING_MXN = 500` en `src/lib/commercial-facts.ts` es la fuente única y el checkout deriva de ella (`FREE_SHIPPING_THRESHOLD` en `src/lib/checkout-config.ts`), así que sitio y cobro coinciden. Al ser igual al pedido mínimo (`MIN_ORDER_MXN = 500`), la tarifa de $125 MXN solo alcanza a carritos que un cupón deje por debajo del mínimo. Las referencias a $2,500 en `docs/auditoria-seo-2026-09.md` quedan como registro histórico del diagnóstico, no como configuración vigente. Confirmar el umbral destapó el hallazgo §3.10 (beneficio de Oro peor que la línea base), ya corregido.
- **Cobertura: toda la ciudad de Chihuahua** (confirmado 2026-10-25). Se atiende la ciudad completa, no una lista cerrada de colonias. `LOCAL_COVERAGE_SCOPE` en `src/lib/local-content.ts` es la frase canónica ("no hay colonias excluidas dentro del municipio") y la consumen la landing, `/chihuahua/zonas-de-entrega` y el `Service` del JSON-LD. Las 18 colonias de `CHIHUAHUA_DELIVERY_ZONES` quedan como **rutas de alta frecuencia**, no como límite del servicio: se publican como ejemplo para que un buscador pueda emparejar una colonia concreta, y el CTA de WhatsApp pide confirmar el **horario** de reparto, no la cobertura. El `areaServed` mantiene el `City` primero y las colonias como `Place` después, así el marcado declara la ciudad como alcance real. `src/lib/local-content.test.ts` fija el invariante: la prosa y el FAQ deben decir "toda la ciudad" y negar explícitamente las colonias excluidas.

---

## 6. Verificación

```bash
npm run typecheck   # ✅
npx eslint --max-warnings 0 src/   # ✅
npm test            # ✅ 401 archivos, 6,891 pruebas
npm run knip        # ✅
npm run build       # ✅ /[slug]/zonas-de-entrega prerenderizada para las 20 ciudades
```

Salida del build verificada a mano:

- `sitemap.xml` → **282 URLs**, sin `/`, con `/chihuahua` (prioridad 1.0), `/chihuahua/zonas-de-entrega` (0.8) y las 3 guías locales.
- `/blog/central-de-abastos-chihuahua`, `/blog/proveedores-abarrotes-mayoreo-chihuahua` y `/blog/cuanto-cuesta-surtir-restaurante-chihuahua` → `index, follow`, canónica propia, `BlogPosting` + `BreadcrumbList` + `FAQPage` (5 preguntas cada una).
- `/chihuahua/zonas-de-entrega` → `index, follow`, `Service` con 19 `areaServed` (la ciudad primero) y 2 `hoursAvailable`, `FAQPage` con 7 preguntas, cobertura de toda la ciudad declarada en el H1 y 18 colonias de ejemplo visibles.
- `/guadalajara/zonas-de-entrega` y `/cdmx/zonas-de-entrega` → `noindex, follow`, sin colonias.

Pruebas nuevas que fijan los invariantes locales:

- `src/lib/local-content.test.ts` — la ciudad es Chihuahua, la prosa cita la cobertura real, **la cobertura declarada es toda la ciudad y el FAQ niega colonias excluidas**, las colonias no se duplican, cada respuesta del FAQ es autocontenida y el `FAQPage` emite una `Question` por respuesta.
- `src/lib/structured-data.test.ts` — el `WholesaleStore` declara el NAP completo de Chihuahua, suma las colonias al `areaServed` de la ciudad sede, **no inventa colonias** para ciudades sin operación, y el `Service` de zonas de entrega publica las 19 áreas, el alcance de toda la ciudad y el horario.
- `src/app/recompensas/_components/types.test.ts` — ningún nivel de recompensas promete un umbral de envío gratis mayor al universal ($500).

---

## 7. Archivos tocados

**Nuevos**

- `src/lib/business.ts` — fuente única de NAP.
- `src/lib/local-content.ts` — alcance de cobertura, colonias de ejemplo, prosa local y FAQ local.
- `src/lib/local-content.test.ts`
- `src/app/recompensas/_components/types.test.ts` — contrato de beneficios de nivel.
- `src/components/city/landing/local-coverage.tsx`
- `src/app/[slug]/zonas-de-entrega/page.tsx` — página de cobertura local.
- `src/content/blog/central-de-abastos-chihuahua.mdx` — guía local, consulta literal.
- `src/content/blog/proveedores-abarrotes-mayoreo-chihuahua.mdx` — guía local, intención comercial.
- `src/content/blog/cuanto-cuesta-surtir-restaurante-chihuahua.mdx` — guía local de costos.

**Modificados (superficie SEO)**

- `src/lib/structured-data.ts` — `Organization`, `WholesaleStore`, `LocalBusiness`, `getDeliveryZonesSchema`, `generateSitemapXml`.
- `src/app/page.tsx`, `src/app/[slug]/page.tsx`, `src/app/sitemap.xml/route.ts`, `src/app/blog/page.tsx`, `src/app/ciudades/page.tsx`, `src/app/contact/page.tsx`, `src/app/soporte/page.tsx`, `src/app/about/page.tsx`, `src/app/faq/page.tsx`, `src/app/careers/page.tsx`, `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/app/precios/page.tsx`, `src/app/preguntas/page.tsx`, `src/app/negocio/{cotizaciones,credito,facturacion}/page.tsx`, `src/app/llms.txt/route.ts`, `src/app/llms-full.txt/route.ts`, `src/app/opengraph-image.tsx`.
- `src/components/layout/footer.tsx`, `src/components/city/city-landing.tsx`, `src/components/city/landing/hero.tsx`, `src/components/city/landing/delivery-zones.tsx`, `src/components/city/landing/local-coverage.tsx`.
- `public/manifest.json`.
- 14 archivos con el teléfono hardcodeado migrados a `business.ts`.
