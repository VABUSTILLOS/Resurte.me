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
| POST   | `/api/admin/kie-ai/image`        | `{ prompt, model? }`            | `{ taskId }` (generación asíncrona)        |
| POST   | `/api/admin/kie-ai/video`        | `{ prompt, model? }`            | `{ taskId }` (generación asíncrona)        |
| POST   | `/api/admin/kie-ai/music`        | `{ prompt, model? }`            | `{ taskId }` (generación asíncrona)        |
| POST   | `/api/admin/kie-ai/chat`         | `{ messages, model?, temperature? }` | `{ content, raw }` (síncrono)          |
| GET    | `/api/admin/kie-ai/status`       | `?taskId=<id>`                  | `{ record }` (estado/resultado de la tarea) |

### Flujo asíncrono (imagen / video / música)

1. `POST` con tu `prompt` → obtén `{ taskId }`.
2. Consulta `GET /api/admin/kie-ai/status?taskId=...` hasta que el estado sea
   terminal (`success` | `fail`). El resultado llega en `record.resultJson`.

```bash
# 1) Crear tarea de imagen
curl -X POST http://localhost:3000/api/admin/kie-ai/image \
  -H "Content-Type: application/json" \
  -H "Cookie: <tu cookie de sesión admin>" \
  -d '{"prompt":"Un atardecer minimalista en la playa, estilo flat design"}'
# → {"taskId":"..."}

# 2) Consultar estado (repite hasta success/fail)
curl "http://localhost:3000/api/admin/kie-ai/status?taskId=<taskId>" \
  -H "Cookie: <tu cookie de sesión admin>"
# → {"record":{"state":"success","resultJson":"..."}}
```

### Chat (síncrono)

```bash
curl -X POST http://localhost:3000/api/admin/kie-ai/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: <tu cookie de sesión admin>" \
  -d '{"messages":[{"role":"user","content":"Hola, ¿quién eres?"}],"model":"gpt-4o-mini"}'
# → {"content":"...","raw":{...}}
```

`model` es opcional: si se omite en las llamadas de generación/chat, Kie.ai usa
su modelo por defecto del endpoint. En el código los endpoints por defecto son:
`/api/v1/gpt4o-image/generate`, `/api/v1/veo/generate`, `/api/v1/suno/generate`
y `/api/v1/chat/completions` — cada helper acepta un `modelPath` alternativo si
el agregador publica otros (revisa `docs.kie.ai`).

## Cliente (API de TypeScript)

`src/lib/ai/kie-ai.ts` — fetch nativo, **cero dependencias**, funciones:

- `isKieAiConfigured(): boolean` — ¿está `KIE_AI_API_KEY` en el entorno?
- `listModels(): Promise<KieAiModel[]>` — `GET /api/v1/models`
- `createImageTask(input, modelPath?)` → `{ taskId }`
- `createVideoTask(input, modelPath?)` → `{ taskId }`
- `createMusicTask(input, modelPath?)` → `{ taskId }`
- `getTaskStatus(taskId)` → `{ state, resultJson?, ... }`
- `pollTaskUntilComplete(taskId, { intervalMs?, timeoutMs? })` → estado terminal
- `chatCompletion({ model, messages, temperature? })` → `{ content, raw }`
- `KieAiError` — error tipado con `status` HTTP de Kie.ai (`{ message, status, body }`)

Ejemplo de uso en un route handler:

```ts
import { createImageTask, isKieAiConfigured, KieAiError } from "@/lib/ai/kie-ai"

const { response: adminDenied } = await requireAdmin()
if (adminDenied) return adminDenied
if (!isKieAiConfigured()) return NextResponse.json({ error: "no configurado" }, { status: 500 })

try {
  const task = await createImageTask({ prompt })
  return NextResponse.json({ taskId: task.taskId })
} catch (error) {
  if (error instanceof KieAiError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  throw error
}
```

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
