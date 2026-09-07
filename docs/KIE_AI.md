# Piloto Kie.ai — guía de integración

Kie.ai es un agregador de modelos (imagen, video, música y LLM/chat) que se
consume con **un solo API key**. Este repo replica el piloto de
`hustlealliance` (ver `KIE_AI_PILOT.md` de su PR #14) adaptado a la estructura
de Resurte.me: rutas bajo `/api/admin`, cliente en `src/lib`, validación manual
(sin zod), errores en español y cero dependencias nuevas.

- Documentación oficial: <https://docs.kie.ai/>
- Base URL: `https://api.kie.ai`
- Header de auth: `Authorization: Bearer <KIE_AI_API_KEY>`

> ⚠️ **Server-only.** El cliente (`src/lib/ai/kie-ai.ts`) solo se importa desde
> route handlers. La API key se lee exclusivamente de `process.env` en el
> servidor y **jamás se expone al navegador**.

## Setup

1. Añade tu API key de Kie.ai a tu entorno local (`.env.local`) copiando el
   bloque del ejemplo en `.env.local.example`:

   ```bash
   # .env.local
   KIE_AI_API_KEY=kie-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   # Solo necesario para música (Suno): la API exige un callBackUrl.
   # Si no lo envías en el body, se usa esta variable; sin ninguna → 400.
   KIEAI_CALLBACK_URL=https://tu-dominio.com/api/webhooks/kie-ai
   ```

2. Reinicia el dev server para que tome la variable (`npm run dev`).
3. Sin la variable, las rutas responden `500` con
   `"KIE_AI_API_KEY no está configurada"` — el fallo es rápido y explícito.

## Rutas disponibles (admin-only)

Todas viven bajo `/api/admin` y exigen sesión admin
(`requireAdmin()` de `src/lib/admin-auth`). Sin sesión → `401`; sin rol admin →
`403`.

| Método | Ruta                             | Body / query                    | Respuesta                                  |
| ------ | -------------------------------- | ------------------------------- | ------------------------------------------ |
| POST   | `/api/admin/kie-ai/image`        | `{ prompt, size? }`             | `{ taskId }` (generación asíncrona)        |
| POST   | `/api/admin/kie-ai/video`        | `{ prompt, model?, aspect_ratio? }` | `{ taskId }` (generación asíncrona)    |
| POST   | `/api/admin/kie-ai/music`        | `{ prompt, callBackUrl?, customMode?, instrumental?, model?, style?, title? }` | `{ taskId }` (generación asíncrona) |
| POST   | `/api/admin/kie-ai/chat`         | `{ messages, model?, temperature? }` | `{ content, raw }` (síncrono)          |
| GET    | `/api/admin/kie-ai/status`       | `?taskId=<id>`                  | `{ record }` (estado/resultado de la tarea) |

Los campos con `?` son opcionales y las rutas aplican defaults válidos para la
API real (validados contra docs.kie.ai / api.kie.ai):

- **Imagen (GPT-4o Image):** `size` default `"1:1"` (valores válidos
  `1:1` | `3:2` | `2:3`). `model` NO forma parte del schema y se ignora.
- **Video (Veo):** `model` default `"veo3_fast"` (válidos `veo3` | `veo3_fast`
  | `veo3_lite`; se envía siempre) y `aspect_ratio` default `"16:9"`
  (válidos `16:9` | `9:16` | `Auto`).
- **Música (Suno):** `model` default `"V4_5"` (válidos `V3_5` | `V4` | `V4_5` |
  `V4_5PLUS` | `V4_5ALL` | `V5` | `V5_5`); `customMode`/`instrumental` default
  `false`. Con `customMode: true` la API además requiere `style` y `title`.
  `callBackUrl` se resuelve así: body → `KIEAI_CALLBACK_URL` (env) → si ninguna
  existe la ruta responde `400` en español.
- **Chat:** endpoint síncrono compatible OpenAI; escribe un `model` válido
  (p. ej. `gpt-4o-mini`) en el body.

### Flujo asíncrono (imagen / video / música)

1. `POST` con tu `prompt` → obtén `{ taskId }`.
2. Consulta `GET /api/admin/kie-ai/status?taskId=...` hasta que el estado sea
   terminal (`success` | `fail`). El resultado llega en `record.resultJson` /
   `record.resultUrls` (depende del tipo de asset; el record trae los URLs
   reales al completar).

```bash
# 1) Crear tarea de imagen (size opcional; default "1:1")
curl -X POST http://localhost:3000/api/admin/kie-ai/image \
  -H "Content-Type: application/json" \
  -H "Cookie: <tu cookie de sesión admin>" \
  -d '{"prompt":"Un atardecer minimalista en la playa, estilo flat design","size":"1:1"}'
# → {"taskId":"..."}

# 1b) Crear tarea de video (model y aspect_ratio opcionales con default)
curl -X POST http://localhost:3000/api/admin/kie-ai/video \
  -H "Content-Type: application/json" \
  -H "Cookie: <tu cookie de sesión admin>" \
  -d '{"prompt":"Dron sobre la costa al amanecer","model":"veo3_fast","aspect_ratio":"16:9"}'

# 1c) Crear tarea de música (callBackUrl obligatorio: body o KIEAI_CALLBACK_URL)
curl -X POST http://localhost:3000/api/admin/kie-ai/music \
  -H "Content-Type: application/json" \
  -H "Cookie: <tu cookie de sesión admin>" \
  -d '{"prompt":"Chill lo-fi para estudiar, 90 bpm","callBackUrl":"https://tu-dominio.com/api/webhooks/kie-ai"}'
# → {"taskId":"..."}  (si no hay callBackUrl → 400)

# 2) Consultar estado (repite hasta success/fail)
curl "http://localhost:3000/api/admin/kie-ai/status?taskId=<taskId>" \
  -H "Cookie: <tu cookie de sesión admin>"
# → {"record":{"state":"success","resultJson":"...","resultUrls":[...]}}
```

### Chat (síncrono)

```bash
curl -X POST http://localhost:3000/api/admin/kie-ai/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: <tu cookie de sesión admin>" \
  -d '{"messages":[{"role":"user","content":"Hola, ¿quién eres?"}],"model":"gpt-4o-mini"}'
# → {"content":"...","raw":{...}}
```

`model` es opcional en las rutas de generación/chat: cada ruta aplica un
default válido y una whitelist (ver tabla). Endpoints reales usados (validados
en vivo contra la API, los paths que no están aquí devuelven 404):

- Imagen: `POST /api/v1/gpt4o-image/generate`
- Video: `POST /api/v1/veo/generate`
- Música: `POST /api/v1/generate` (NO `/api/v1/suno/generate`)
- Chat: `POST /v1/chat/completions` (OpenAI-compatible; el `model` va en el body)
- Status: `GET /api/v1/jobs/recordInfo?taskId=...`

Los helpers de creación aceptan un `modelPath` alternativo si el agregador
publica otros (revisa `docs.kie.ai`).

## Cliente (API de TypeScript)

`src/lib/ai/kie-ai.ts` — fetch nativo, **cero dependencias**, funciones:

- `isKieAiConfigured(): boolean` — ¿está `KIE_AI_API_KEY` en el entorno?
- `createImageTask(input, modelPath?)` → `{ taskId }` (input: `{ prompt, size? }`)
- `createVideoTask(input, modelPath?)` → `{ taskId }` (input: `{ prompt, model?, aspect_ratio? }`)
- `createMusicTask(input, modelPath?)` → `{ taskId }` (input: `{ prompt, model?, callBackUrl?, customMode?, instrumental?, ... }`)
- `getTaskStatus(taskId)` → `{ state, resultJson?, resultUrls?, ... }`
- `pollTaskUntilComplete(taskId, { intervalMs?, timeoutMs? })` → estado terminal
- `chatCompletion({ model, messages, temperature? })` → `{ content, raw }`
- `KieAiError` — error tipado con `status` HTTP de Kie.ai (`{ message, status, body }`)

> No existe `listModels`: la API de Kie.ai no publica un endpoint público de
> listado (`GET /api/v1/models` → 404), así que el cliente no lo expone. Si
> necesitas el catálogo, usa los valores documentados en docs.kie.ai y las
> whitelists de las rutas.

Ejemplo de uso en un route handler (los defaults/whitelists los aplica la ruta,
no el helper del cliente):

```ts
import { createImageTask, isKieAiConfigured, KieAiError } from "@/lib/ai/kie-ai"

const { response: adminDenied } = await requireAdmin()
if (adminDenied) return adminDenied
if (!isKieAiConfigured()) return NextResponse.json({ error: "no configurado" }, { status: 500 })

try {
  const task = await createImageTask({ prompt, size: "1:1" })
  return NextResponse.json({ taskId: task.taskId })
} catch (error) {
  if (error instanceof KieAiError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  throw error
}
```

Para música, resuelve primero el `callBackUrl` (body o `process.env.KIEAI_CALLBACK_URL`)
y responde `400` con mensaje claro si no hay ninguno — así lo hace la ruta
`/api/admin/kie-ai/music`.

## Notas

- **Por qué polling y no webhook:** para este piloto el route `status` expone
  `getTaskStatus` (una sola consulta). `pollTaskUntilComplete` es un helper de
  lado servidor útil para flujos síncronos de corta duración (timeout por
  defecto 120 s); para video/música en producción prefiere los webhooks de
  Kie.ai (state: `success` | `fail`).
- **Sin dependencias nuevas:** validación manual en las rutas, sin `zod` ni
  `server-only` (el cliente es server-only de facto por solo importarse desde
  route handlers; las llamadas usan `fetch(..., { cache: "no-store" })`).
- **Integración de IA preexistente:** `src/lib/agente/llm.ts` (agente de
  ventas) también hace `chatCompletion`, pero con firma y env vars propias
  (`OMNIROUTE_*` / `OPENAI_*`). No hay conflicto de nombres: Kie.ai vive en el
  namespace `src/lib/ai/`, se configura con `KIE_AI_API_KEY` y no modifica el
  comportamiento del agente.
