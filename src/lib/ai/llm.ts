/**
 * Capa de IA compartida de FoodOS (Fase 1 del roadmap de paridad).
 *
 * La consumen Mesero IA (Fase 2), Marketing IA (Fase 3) y el sitio IA
 * (Fase 6). Es un solo lugar donde viven: los adaptadores de proveedor, los
 * guardarraíles y —lo más importante— la degradación a plantillas.
 *
 * Regla de oro: **`generateText` nunca lanza**. Si no hay credenciales, si
 * se agotó el presupuesto del día, si el proveedor tarda o si responde 500,
 * devuelve copy determinista generado con `fallbackTemplates`. El producto
 * completo tiene que funcionar sin ninguna variable de IA configurada.
 *
 * Prioridad de proveedores (el primero configurado gana):
 *   1. OmniRoute local — `OMNIROUTE_BASE_URL` + `OMNIROUTE_API_KEY`
 *   2. OpenAI o cualquier gateway compatible — `OPENAI_API_KEY` (+ `OPENAI_BASE_URL`)
 *   3. Kie.ai — `KIE_AI_API_KEY` (+ `KIE_AI_BASE_URL`, `KIE_AI_MODEL`)
 *
 * Nota: esto NO reemplaza a `src/lib/ai/kie-ai.ts`. Ese módulo es el cliente
 * crudo de administración (generación de imagen/video/música y SEO masivo):
 * lanza `KieAiError` y el llamador decide. Aquí el contrato es el opuesto —
 * el cliente final nunca ve un error de IA.
 *
 * Variables de control:
 *   - `AI_ENABLED=false` apaga la IA sin borrar credenciales (kill switch).
 *   - `AI_TIMEOUT_MS` (default 12000), `AI_MAX_RETRIES` (default 1).
 *   - `AI_DAILY_TOKEN_CAP` (ver `budget.ts`).
 */

import { logger } from "@/lib/logger"
import { reportServerError } from "@/lib/error-log"
import {
  DEFAULT_TOKEN_ESTIMATE,
  reserveAiBudget,
  settleAiBudget,
  type BudgetDecision,
} from "./budget"

// ------------------------------------------------------------
// Adaptadores
// ------------------------------------------------------------

export interface AiAdapter {
  /** Identificador corto para logs y reportes. */
  name: string
  url: string
  model: string
  headers: Record<string, string>
}

export type AiEnv = Record<string, string | undefined>

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "")
}

/** Join sin duplicar la barra cuando la base ya trae subruta. */
function joinUrl(base: string, path: string): string {
  return `${trimTrailingSlashes(base)}/${path.replace(/^\/+/, "")}`
}

/**
 * Primer proveedor configurado, o `null` si no hay ninguno. Se resuelve en
 * cada llamada (no en el módulo) para que los tests puedan inyectar env y
 * para que rotar una credencial no requiera reiniciar.
 */
export function resolveAdapter(env: AiEnv = process.env): AiAdapter | null {
  const omniRouteKey = env.OMNIROUTE_API_KEY?.trim()
  if (omniRouteKey) {
    return {
      name: "omniroute",
      url: joinUrl(env.OMNIROUTE_BASE_URL || "http://localhost:20128/v1", "chat/completions"),
      model: env.AGENT_MODEL || env.OPENAI_MODEL || "gpt-4o-mini",
      headers: { Authorization: `Bearer ${omniRouteKey}` },
    }
  }

  const openAiKey = env.OPENAI_API_KEY?.trim()
  if (openAiKey) {
    return {
      name: "openai",
      url: joinUrl(env.OPENAI_BASE_URL || "https://api.openai.com/v1", "chat/completions"),
      model: env.AGENT_MODEL || env.OPENAI_MODEL || "gpt-4o-mini",
      headers: { Authorization: `Bearer ${openAiKey}` },
    }
  }

  const kieKey = env.KIE_AI_API_KEY?.trim()
  if (kieKey) {
    // OJO: el chat de Kie.ai vive en `/v1/chat/completions`, no en
    // `/api/v1/...` (eso responde 404). Ver `src/lib/ai/kie-ai.ts`, validado
    // contra docs.kie.ai. La ruta es configurable por si el proveedor la mueve.
    return {
      name: "kie",
      url: joinUrl(env.KIE_AI_BASE_URL || "https://api.kie.ai", env.KIE_AI_CHAT_PATH || "/v1/chat/completions"),
      model: env.KIE_AI_MODEL || env.AGENT_MODEL || "gpt-4o-mini",
      headers: { Authorization: `Bearer ${kieKey}` },
    }
  }

  return null
}

// ------------------------------------------------------------
// Plantillas deterministas
// ------------------------------------------------------------

export type TemplateContext = Record<string, string | number | null | undefined>

function render(template: string, ctx: TemplateContext): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = ctx[key]
    return value === null || value === undefined ? "" : String(value)
  })
}

/**
 * Copy de respaldo, sin IA. Es lo que ve el comensal cuando el modelo no
 * está disponible, así que tiene que sonar a persona y servir de verdad:
 * nada de "lo siento, soy un bot".
 */
export const fallbackTemplates = {
  /** Mesero IA respondiendo una pregunta por WhatsApp. */
  mesero_reply: (ctx: TemplateContext) =>
    render(
      "¡Gracias por escribir a {restaurant}! 🍽️\n\n{menuHighlights}\n\n" +
        "Puedes ver el menú completo y pedir aquí: {orderLink}\n" +
        "Si prefieres, un mesero te ayuda en un momento.",
      ctx
    ),

  /** Copy de una campaña de Marketing IA. */
  campaign_copy: (ctx: TemplateContext) =>
    render(
      "{restaurant}: {offer}\n\n" +
        "Es para ti, {audience}. Pide en {orderLink} y nosotros nos encargamos del resto.",
      ctx
    ),

  /** Descripción de platillo para el sitio IA / menú público. */
  menu_description: (ctx: TemplateContext) =>
    render("{dish} de {restaurant}. {notes}", ctx),

  /** "Sobre nosotros" del sitio IA cuando no hay modelo disponible. */
  seo_about: (ctx: TemplateContext) => render("{about}", ctx),

  /** Ficha de platillo para el sitio IA cuando no hay modelo disponible. */
  seo_dish: (ctx: TemplateContext) =>
    render("{dish} de {restaurant}. {notes}", ctx),
} as const

export type TemplateName = keyof typeof fallbackTemplates

// ------------------------------------------------------------
// Orquestación
// ------------------------------------------------------------

export interface AiRequest {
  /** Para logs y reportes: "mesero_ia", "marketing_ia", "sitio_ia". */
  feature: string
  /** Plantilla de respaldo cuando no se puede (o no se debe) llamar al modelo. */
  template: TemplateName
  ctx: TemplateContext
  system: string
  user: string
  /** Restaurante al que se le carga el consumo. Sin él no hay presupuesto. */
  restaurantId?: string | null
  maxTokens?: number
  temperature?: number
}

export type AiFallbackReason = "disabled" | "unconfigured" | "budget" | "error"

export interface AiResult {
  text: string
  source: "llm" | "template"
  model: string | null
  adapter: string | null
  tokensUsed: number | null
  /** Por qué se degradó, cuando `source === "template"`. */
  reason?: AiFallbackReason
}

export interface AiDeps {
  fetch: typeof fetch
  env: AiEnv
  reserve: (restaurantId: string | null | undefined, estimate: number) => Promise<BudgetDecision>
  settle: (
    restaurantId: string | null | undefined,
    actualTokens: number | null,
    options: { estimate: number; fallback: boolean }
  ) => Promise<void>
  sleep: (ms: number) => Promise<void>
}

const defaultDeps: AiDeps = {
  fetch: (...args) => globalThis.fetch(...args),
  env: process.env,
  reserve: reserveAiBudget,
  settle: settleAiBudget,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

const DEFAULT_TIMEOUT_MS = 12_000

function timeoutMs(env: AiEnv): number {
  const raw = Number(env.AI_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS
}

function maxRetries(env: AiEnv): number {
  const raw = Number(env.AI_MAX_RETRIES)
  return Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : 1
}

interface ChatResponse {
  text: string
  tokensUsed: number | null
}

interface ChatInput {
  system: string
  user: string
  maxTokens?: number
  temperature?: number
}

/** Un intento contra el proveedor. */
async function attemptChat(
  adapter: AiAdapter,
  input: ChatInput,
  feature: string,
  deps: AiDeps
): Promise<ChatResponse | { retryable: true; status?: number } | null> {
  const body: Record<string, unknown> = {
    model: adapter.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
    // Solo se envía cuando el llamador lo pide explícitamente: los modelos de
    // razonamiento rechazan cualquier temperature ≠ 1 con 400.
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
  }

  try {
    const res = await deps.fetch(adapter.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adapter.headers },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs(deps.env)),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      // 429 y 5xx sí valen un reintento; el resto (400, 401, 403) no: repetir
      // una credencial inválida solo gasta tiempo.
      const retryable = res.status === 429 || res.status >= 500
      logger.warn("[Ai] El proveedor rechazó la llamada", {
        adapter: adapter.name,
        feature,
        status: res.status,
        detail: detail.slice(0, 300),
      })
      return retryable ? { retryable: true, status: res.status } : null
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { total_tokens?: number }
    }
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return null

    return {
      text,
      tokensUsed:
        typeof data.usage?.total_tokens === "number" ? data.usage.total_tokens : null,
    }
  } catch (err) {
    // Timeout, DNS, red caída: recuperable.
    logger.warn("[Ai] Falló el intento contra el proveedor", {
      adapter: adapter.name,
      feature,
      error: err instanceof Error ? err.message : String(err),
    })
    return { retryable: true }
  }
}

type CallOutcome =
  | { ok: true; response: ChatResponse }
  | { ok: false; reason: "budget" | "error" }

/**
 * Camino compartido por todas las llamadas: presupuesto, reintentos y
 * liquidación. Lo usan `generateText` (que además degrada a plantilla) y
 * `chatCompletionRaw` (para llamadores que ya tienen su propia degradación).
 */
async function runCall(
  adapter: AiAdapter,
  input: ChatInput,
  feature: string,
  restaurantId: string | null | undefined,
  deps: AiDeps
): Promise<CallOutcome> {
  const estimate = input.maxTokens ?? DEFAULT_TOKEN_ESTIMATE

  // Contabilidad best-effort: si el contador falla, se permite la llamada.
  // Gastar unos tokens de más es mejor que dejar sin respuesta a un comensal.
  const settle = async (actualTokens: number | null, fallback: boolean) => {
    try {
      await deps.settle(restaurantId, actualTokens, { estimate, fallback })
    } catch (err) {
      logger.warn("[Ai] No se pudo liquidar el consumo", {
        feature,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  let budget: BudgetDecision
  try {
    budget = await deps.reserve(restaurantId, estimate)
  } catch (err) {
    logger.warn("[Ai] No se pudo consultar el presupuesto; se continúa", {
      feature,
      error: err instanceof Error ? err.message : String(err),
    })
    budget = { allowed: true, enforced: false }
  }
  if (!budget.allowed) {
    await settle(null, true)
    return { ok: false, reason: "budget" }
  }

  const retries = maxRetries(deps.env)
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const outcome = await attemptChat(adapter, input, feature, deps)

      if (outcome && !("retryable" in outcome)) {
        await settle(outcome.tokensUsed, false)
        logger.info("[Ai] Respuesta del modelo", {
          feature,
          adapter: adapter.name,
          model: adapter.model,
          tokens: outcome.tokensUsed,
        })
        return { ok: true, response: outcome }
      }

      const canRetry = outcome !== null && attempt < retries
      if (!canRetry) break

      // Backoff corto: el caso típico es un 429 pasajero, no una caída larga.
      await deps.sleep(400 * (attempt + 1))
    }
  } catch (err) {
    logger.error("[Ai] Fallo inesperado en el bucle de reintentos", err, { feature })
    // Traza durable: sin esto, un restaurante que pierde la IA degrada a
    // plantilla en silencio y nadie se entera hasta que se queja. El try/catch
    // es redundante con el contrato de `reportServerError` a propósito: este
    // `catch` es el último guardián de la promesa "runCall nunca lanza", y no
    // se delega en el contrato de otro módulo.
    try {
      await reportServerError({
        message: "La IA de FoodOS no pudo completar la llamada",
        context: { feature, adapter: adapter.name, model: adapter.model, restaurantId },
        url: "foodos:ia",
        error: err,
      })
    } catch {
      // Observabilidad caída: el comensal igual recibe su plantilla.
    }
  }

  await settle(null, true)
  return { ok: false, reason: "error" }
}

/**
 * Punto de entrada de toda la IA de FoodOS. Devuelve siempre texto: del
 * modelo cuando se puede, de plantilla cuando no. **Nunca lanza.**
 */
export async function generateText(
  request: AiRequest,
  overrides: Partial<AiDeps> = {}
): Promise<AiResult> {
  const deps: AiDeps = { ...defaultDeps, ...overrides }
  const templateText = fallbackTemplates[request.template](request.ctx)

  const degrade = (reason: AiFallbackReason, model: string | null = null): AiResult => {
    logger.info("[Ai] Degradando a plantilla", {
      feature: request.feature,
      template: request.template,
      reason,
    })
    return {
      text: templateText,
      source: "template",
      model,
      adapter: null,
      tokensUsed: null,
      reason,
    }
  }

  if (deps.env.AI_ENABLED === "false") return degrade("disabled")

  const adapter = resolveAdapter(deps.env)
  if (!adapter) return degrade("unconfigured")

  const outcome = await runCall(
    adapter,
    {
      system: request.system,
      user: request.user,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    },
    request.feature,
    request.restaurantId,
    deps
  )

  if (!outcome.ok) return degrade(outcome.reason, adapter.model)

  return {
    text: outcome.response.text,
    source: "llm",
    model: adapter.model,
    adapter: adapter.name,
    tokensUsed: outcome.response.tokensUsed,
  }
}

/**
 * Variante de bajo nivel para llamadores que ya tienen su propia degradación
 * (p. ej. el agente de comercialización, que cae a `templates.ts`). Mismo
 * resolutor de proveedores, mismos guardarraíles, pero devuelve `null` en
 * vez de plantilla.
 */
export async function chatCompletionRaw(
  system: string,
  user: string,
  options: {
    feature?: string
    maxTokens?: number
    temperature?: number
    restaurantId?: string | null
  } = {},
  overrides: Partial<AiDeps> = {}
): Promise<{ text: string; model: string; adapter: string; tokensUsed: number | null } | null> {
  const deps: AiDeps = { ...defaultDeps, ...overrides }
  if (deps.env.AI_ENABLED === "false") return null

  const adapter = resolveAdapter(deps.env)
  if (!adapter) return null

  const outcome = await runCall(
    adapter,
    { system, user, maxTokens: options.maxTokens, temperature: options.temperature },
    options.feature ?? "agente",
    options.restaurantId,
    deps
  )
  if (!outcome.ok) return null

  return {
    text: outcome.response.text,
    model: adapter.model,
    adapter: adapter.name,
    tokensUsed: outcome.response.tokensUsed,
  }
}
