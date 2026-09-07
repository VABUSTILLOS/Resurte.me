/**
 * Cliente genérico de Kie.ai (https://docs.kie.ai/).
 *
 * Kie.ai es un agregador de modelos con una sola API key (imagen, video,
 * música y LLM/chat). Los endpoints de generación (imagen/video/música) son
 * ASÍNCRONOS: la llamada de creación devuelve un `taskId` y el resultado se
 * obtiene consultando `GET /api/v1/jobs/recordInfo?taskId=...` (o vía webhook).
 * El chat/LLM es síncrono y compatible con OpenAI Chat Completions.
 *
 * Server-only: solo se importa desde route handlers (nunca desde el cliente).
 * Cero dependencias: usa fetch nativo. La API key solo se lee del entorno
 * (process.env.KIE_AI_API_KEY) — nunca se expone al navegador.
 *
 * Este módulo replica el piloto de hustlealliance (KIE_AI_PILOT.md) adaptado a
 * la estructura de este repo (src/lib). Ver docs/KIE_AI.md para uso.
 */

const KIE_AI_BASE_URL = "https://api.kie.ai"

export class KieAiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message)
    this.name = "KieAiError"
  }
}

/** True cuando KIE_AI_API_KEY está configurada. Revisa antes de llamar al cliente para fallar rápido y claro. */
export function isKieAiConfigured(): boolean {
  return Boolean(process.env.KIE_AI_API_KEY)
}

function getApiKey(): string {
  const key = process.env.KIE_AI_API_KEY
  if (!key) {
    throw new KieAiError(
      "KIE_AI_API_KEY no está configurada. Defínela en tu entorno (ver .env.local.example / docs/KIE_AI.md).",
      500
    )
  }
  return key
}

/** Wrapper fetch de bajo nivel: agrega auth + headers JSON, parsea la respuesta y lanza KieAiError si falla. */
async function kieFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = getApiKey()
  const res = await fetch(`${KIE_AI_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    // Los endpoints de generación/status nunca deben cachearse por el fetch de Next.js.
    cache: "no-store",
  })

  const text = await res.text()
  let json: unknown = undefined
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = text
    }
  }

  if (!res.ok) {
    const message =
      (json &&
      typeof json === "object" &&
      "message" in json &&
      typeof (json as { message?: unknown }).message === "string"
        ? (json as { message: string }).message
        : null) || `Kie.ai request failed with status ${res.status}`
    throw new KieAiError(message, res.status, json)
  }

  return json as T
}

// ─── Tareas de generación asíncronas (imagen / video / música) ─────────────

export interface CreateTaskResponse {
  taskId: string
  [key: string]: unknown
}

/**
 * Inicia una tarea de generación asíncrona en un endpoint de modelo dado (p.ej.
 * una ruta de imagen, video o música documentada en docs.kie.ai). Devuelve el
 * `taskId` que se usa para consultar `recordInfo`.
 */
export async function createGenerationTask(
  modelPath: string,
  input: Record<string, unknown>
): Promise<CreateTaskResponse> {
  const data = await kieFetch<{ data?: CreateTaskResponse; taskId?: string }>(modelPath, {
    method: "POST",
    body: JSON.stringify(input),
  })
  const taskId = data.taskId ?? data.data?.taskId
  if (!taskId) {
    throw new KieAiError("Kie.ai response did not include a taskId", 502, data)
  }
  return { ...data.data, taskId }
}

/**
 * Inicia una tarea de generación de imagen (GPT-4o Image).
 * Endpoint real: POST /api/v1/gpt4o-image/generate (validado contra docs.kie.ai).
 * El body requiere `prompt` y `size` ("1:1" | "3:2" | "2:3"); `model` NO forma
 * parte del schema y se ignora.
 */
export function createImageTask(
  input: { prompt: string; size?: string; [key: string]: unknown },
  modelPath = "/api/v1/gpt4o-image/generate"
) {
  return createGenerationTask(modelPath, input)
}

/**
 * Inicia una tarea de generación de video (Veo).
 * Endpoint real: POST /api/v1/veo/generate (validado contra docs.kie.ai).
 * El body requiere `prompt`, `model` (default "veo3_fast"; acepta veo3,
 * veo3_fast, veo3_lite) y `aspect_ratio` (default "16:9"; acepta 16:9, 9:16, Auto).
 */
export function createVideoTask(
  input: { prompt: string; model?: string; aspect_ratio?: string; [key: string]: unknown },
  modelPath = "/api/v1/veo/generate"
) {
  return createGenerationTask(modelPath, input)
}

/**
 * Inicia una tarea de generación de música (Suno).
 * Endpoint real: POST /api/v1/generate — NO /api/v1/suno/generate (404, validado).
 * El body requiere { prompt, customMode, instrumental, model, callBackUrl }; sin
 * esos campos la API responde 422. `callBackUrl` se resuelve en la ruta de API:
 * body → process.env.KIEAI_CALLBACK_URL → 400 si no hay ninguna.
 */
export function createMusicTask(
  input: { prompt: string; customMode?: boolean; instrumental?: boolean; model?: string; [key: string]: unknown },
  modelPath = "/api/v1/generate"
) {
  return createGenerationTask(modelPath, input)
}

export type KieAiTaskState = "waiting" | "queuing" | "generating" | "success" | "fail" | string

export interface KieAiTaskRecord {
  taskId: string
  state: KieAiTaskState
  /** Resultado en crudo (JSON string). Para música/imagen los URLs finales suelen venir en resultUrls/resultJson. */
  resultJson?: string
  /** Campos de resultado alternativos reportados por recordInfo (p.ej. resultUrls con URLs de assets). */
  resultUrls?: unknown
  failMsg?: string
  [key: string]: unknown
}

/** GET /api/v1/jobs/recordInfo?taskId=... — consulta el estado/resultado actual de una tarea asíncrona. */
export async function getTaskStatus(taskId: string): Promise<KieAiTaskRecord> {
  const data = await kieFetch<{ data?: KieAiTaskRecord } & Partial<KieAiTaskRecord>>(
    `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`
  )
  return (data.data ?? data) as KieAiTaskRecord
}

const TERMINAL_STATES = new Set(["success", "fail", "completed", "failed"])

/**
 * Consulta `recordInfo` hasta que la tarea llegue a un estado terminal o se
 * agote el timeout. Para video/música de larga duración prefiere webhooks en
 * producción; este helper es cómodo para usos piloto/demo de corta duración.
 */
export async function pollTaskUntilComplete(
  taskId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<KieAiTaskRecord> {
  const { intervalMs = 3000, timeoutMs = 120_000 } = options
  const start = Date.now()

  for (;;) {
    const record = await getTaskStatus(taskId)
    if (TERMINAL_STATES.has(record.state)) {
      return record
    }
    if (Date.now() - start >= timeoutMs) {
      throw new KieAiError(`Timed out waiting for Kie.ai task ${taskId} to complete`, 504, record)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

// ─── LLM / chat (síncrono, compatible OpenAI) ──────────────────────────────

export interface KieAiChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface KieAiChatResult {
  content: string
  raw: unknown
}

/**
 * POST /v1/chat/completions — llamada síncrona compatible con OpenAI Chat
 * Completions. OJO: el path real es `/v1/chat/completions` (no `/api/v1/...`,
 * que responde 404). El `model` va en el body.
 */
export async function chatCompletion(params: {
  model: string
  messages: KieAiChatMessage[]
  temperature?: number
}): Promise<KieAiChatResult> {
  const data = await kieFetch<{
    choices?: { message?: { content?: string } }[]
  }>("/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify(params),
  })
  const content = data.choices?.[0]?.message?.content ?? ""
  return { content, raw: data }
}
