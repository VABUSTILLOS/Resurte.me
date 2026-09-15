# Medición de SEO para IA (GEO/AEO)

Este documento describe cómo medir si los motores de IA (ChatGPT, Perplexity, Gemini,
Copilot) están citando a Resurte.me, y qué hacer cada mes.

El objetivo no es el tráfico, es la **cita**: que la IA use a Resurte.me como fuente y
enlace. La cita se mide con tres instrumentos independientes:

| Instrumento | Qué mide | Dónde se consulta |
| --- | --- | --- |
| Evento `ai_referral` en GA4 | Clics que **llegan** desde un motor de IA | GA4 → Informes → Interacción → Eventos |
| Logs de Vercel | Qué crawlers de IA **leen** el sitio y cuánto | Vercel → Logs (filtrar por user-agent) |
| Panel de prompts | Si la IA **menciona** a Resurte.me al responder | `/admin/seo-ia` (hoja de trabajo mensual) |

Los tres juntos cuentan la historia completa: el crawler lee → la IA cita → alguien hace clic.

---

## 1. Panel operativo

`/admin/seo-ia` (requiere sesión de administrador) es el punto de entrada. Muestra:

- **Activos citables**: inventario de las piezas del sitio diseñadas para ser citadas
  (respuestas rápidas, preguntas, datos clave, fuentes y metodología, precios, etc.),
  con el número de piezas de cada tipo.
- **Crawlers de IA**: los 25 user-agents autorizados en `robots.txt`, agrupados por
  familia (respuesta / entrenamiento / plataforma).
- **Motores vigilados**: los 12 dominios que disparan el evento `ai_referral`.
- **Panel de prompts**: 20 preguntas reales × 4 motores = 80 celdas para revisar cada mes.

Los datos salen de `src/lib/geo-assets.ts`, `src/lib/ai-crawlers.ts` y
`src/lib/geo-queries.ts`. Para cambiar la lista de preguntas, edita `GEO_QUERIES` en
`src/lib/geo-queries.ts`; el test `src/lib/geo-queries.test.ts` verifica que cada
`targetPath` apunte a una ruta que existe de verdad, así que una pregunta mal enlazada
rompe la suite en vez de llegar a producción.

---

## 2. Procedimiento mensual: panel de prompts

Es la medición más importante y **no se puede automatizar**: hay que preguntarle a la IA.

1. Abre `/admin/seo-ia` y localiza la tabla del panel (20 preguntas × 4 motores).
2. En una ventana de incógnito (sin historial ni personalización), lanza cada pregunta
   tal cual en ChatGPT, Perplexity, Gemini y Copilot.
3. Anota en cada celda:
   - **citado**: `Sí` / `No` — ¿aparece resurte.me entre las fuentes citadas?
   - **posición**: número de orden de la cita (1, 2, 3…), o vacío si no aparece.
   - **dato**: el dato concreto que la IA tomó de Resurte.me (una cifra, un precio,
     una condición). Si no tomó nada, déjalo vacío.
   - **exacto**: `Sí` / `No` / `Parcial` — ¿la cifra que dijo la IA coincide con la del sitio?
     Una cifra mal citada es un activo roto y se corrige.
   - **competidor**: quién fue citado en lugar de Resurte.me.
4. Guarda los resultados. La comparación mes contra mes es la señal real de progreso.

Interpretación:

- `citado = Sí` con `posición` bajando → el trabajo de contenido está funcionando.
- `citado = No` en preguntas cuyo `targetPath` sí existe y sí tiene respuesta rápida →
  el contenido existe pero no es suficientemente citable: revisa longitud, claridad y
  presencia de cifras concretas.
- `exacto = No` → **prioridad alta**: una cifra desactualizada repetida por la IA es peor
  que no ser citado. Corrige la fuente (`src/lib/commercial-facts.ts` o la pieza) y
  espera el siguiente ciclo de reindexado.

---

## 3. Procedimiento: análisis de logs de Vercel

Mide si los crawlers de IA están leyendo el sitio, y qué tan profundo llegan.

1. Vercel → proyecto → **Logs** (o el panel de Observability del proyecto).
2. Filtra por user-agent. Los que importan son los de familia **respuesta**, porque son
   los que pueden producir una cita visible:
   `OAI-SearchBot`, `ChatGPT-User`, `Claude-User`, `PerplexityBot`, `Perplexity-User`,
   `MistralAI-User`, `DuckAssistBot`, `YouBot`.
   La lista completa y etiquetada está en `src/lib/ai-crawlers.ts` y en `/admin/seo-ia`.
3. Para cada crawler, cuenta cuántas URLs **distintas** del sitemap pidió.
   El sitemap tiene ~267 URLs; se obtiene en `https://resurte.me/sitemap.xml`.
4. Calcula la cobertura: `URLs distintas pedidas / 267`.
5. Repite el conteo para la familia **entrenamiento** (`GPTBot`, `ClaudeBot`,
   `Google-Extended`, `CCBot`, …). Esa familia no produce citas directas, así que solo
   sirve como contexto: un bot de entrenamiento muy activo sin bots de respuesta activos
   indica que el sitio se indexa pero no se cita.

Señales de alarma:

- **Cobertura muy baja (< 30 %)**: los crawlers no están descubriendo el contenido.
  Revisa `robots.txt`, que las URLs del sitemap respondan `200` y que no haya rutas
  bloqueadas por error.
- **Crawler de respuesta ausente durante semanas**: el sitio no es candidato a cita.
  Prioriza conseguir enlaces externos de autoridad (Fase 8 del plan).
- **Solo la home y pocas páginas pedidas**: el enlazado interno no está distribuyendo
  autoridad hacia las piezas citables.

Nota: los logs de Vercel tienen retención limitada según el plan. Si se necesita
histórico largo, exportar periódicamente.

---

## 4. Procedimiento: Google Search Console

GSC mide búsqueda clásica, pero revela dos patrones que importan para GEO/AEO.

1. **Consultas con impresiones y cero clics.** Son consultas que la IA (o un AI Overview)
   está respondiendo directamente en la SERP. No son un problema: confirman que la
   pregunta existe y que hay que ser la fuente citada. Cruza esas consultas con las del
   panel de prompts y asegúrate de que cada una tenga una pieza con respuesta rápida.
2. **Consultas de marca + pregunta** (`resurte.me pedido mínimo`, `resurte.me envío`).
   Indican que alguien leyó la respuesta en una IA y luego buscó la marca para
   verificar. Es la señal más fuerte de que la cita está funcionando.
3. Revisa también **Rendimiento → Páginas** para las rutas de contenido citable
   (`/preguntas`, `/blog/*`, `/precios`) y confirma que se están indexando.

---

## 5. Dónde vive cada cosa

| Qué | Archivo |
| --- | --- |
| Clasificador de referrers de IA + script GA4 | `src/lib/ai-referrers.ts` |
| Evento `ai_referral` inyectado en el sitio | `src/lib/analytics.tsx` |
| Registro de los 25 crawlers de IA | `src/lib/ai-crawlers.ts` |
| User-agents autorizados | `src/app/robots.ts` |
| Preguntas del panel mensual | `src/lib/geo-queries.ts` |
| Inventario de activos citables | `src/lib/geo-assets.ts` |
| Panel `/admin/seo-ia` | `src/app/admin/seo-ia/page.tsx` |

## 6. Requisito previo

El evento `ai_referral` solo se emite si `NEXT_PUBLIC_GA_MEASUREMENT_ID` está definida.
Si el valor en Vercel trae un prefijo espurio (por ejemplo `NAME=G-XXXX`), el script no
se genera y no habrá datos. Confirma en GA4 → Admin → Flujos de datos que el ID
corresponde al flujo web correcto.
