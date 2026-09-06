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

// ─── Modelos ───────────────────────────────────────────────────────────────

export interface KieAiModel {
  id: string
  name?: string
  type?: string
  [key: string]: unknown
}

/** GET /api/v1/models — lista los modelos disponibles (imagen/video/música/LLM). */
export async function listModels(): Promise<KieAiModel[]> {
  const data = await kieFetch<{ data?: KieAiModel[]; models?: KieAiModel[] }>("/api/v1/models")
  return data.data ?? data.models ?? []
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

/** Inicia una tarea de generación de imagen. `modelPath` apunta al endpoint de imagen por defecto. */
export function createImageTask(
  input: { prompt: string; model?: string; [key: string]: unknown },
  modelPath = "/api/v1/gpt4o-image/generate"
) {
  return createGenerationTask(modelPath, input)
}

/** Inicia una tarea de generación de video. `modelPath` apunta al endpoint de video por defecto. */
export function createVideoTask(
  input: { prompt: string; model?: string; [key: string]: unknown },
  modelPath = "/api/v1/veo/generate"
) {
  return createGenerationTask(modelPath, input)
}

/** Inicia una tarea de generación de música. `modelPath` apunta al endpoint de música por defecto. */
export function createMusicTask(
  input: { prompt: string; model?: string; [key: string]: unknown },
  modelPath = "/api/v1/suno/generate"
) {
  return createGenerationTask(modelPath, input)
}

export type KieAiTaskState = "waiting" | "queuing" | "generating" | "success" | "fail" | string

export interface KieAiTaskRecord {
  taskId: string
  state: KieAiTaskState
  resultJson?: string
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

/** POST /api/v1/chat/completions — llamada síncrona compatible con OpenAI Chat Completions. */
export async function chatCompletion(params: {
  model: string
  messages: KieAiChatMessage[]
  temperature?: number
}): Promise<KieAiChatResult> {
  const data = await kieFetch<{
    choices?: { message?: { content?: string } }[]
  }>("/api/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify(params),
  })
  const content = data.choices?.[0]?.message?.content ?? ""
  return { content, raw: data }
}
