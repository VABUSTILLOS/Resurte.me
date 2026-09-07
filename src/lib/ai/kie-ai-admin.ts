/**
 * Cliente server-side para las rutas admin de Kie.ai.
 *
 * SERVER-ONLY: usa `cookies()` de `next/headers`, así que solo puede
 * importarse desde Server Actions, Route Handlers y Server Components.
 * NUNCA lo importes desde un componente cliente: aquí no se maneja la
 * KIE_AI_API_KEY (queda en el servidor, en `src/lib/ai/kie-ai.ts`), solo se
 * reenvía la cookie de sesión admin a las rutas existentes
 * `/api/admin/kie-ai/*` (que validan con `requireAdmin()`).
 *
 * Uso típico: una Server Action valida inputs y llama a estas funciones; el
 * fetch de esta capa incluye automáticamente la cookie del usuario que
 * disparó la acción, por lo que las rutas admin responden 200 si es admin.
 */

import { cookies } from "next/headers"
import type { KieAiChatMessage, KieAiTaskRecord } from "./kie-ai"

/** URL base del propio sitio. El cliente llama a las rutas admin locales. */
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

interface KieAdminErrorBody {
  error?: string
}

/** Forma estándar de las respuestas de generación asíncrona de las rutas admin. */
export interface KieTaskResponse {
  taskId: string
}

/** Forma estándar de la respuesta de `GET /api/admin/kie-ai/status`. */
export interface KieStatusResponse {
  record: KieAiTaskRecord
}

/**
 * Fetch de bajo nivel contra una ruta admin de Kie.ai reenviando la cookie de
 * sesión. Lanza `Error` (mensaje en español) si la ruta responde con error.
 */
async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieHeader = (await cookies()).toString()

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...init?.headers,
    },
    // Nunca cachear respuestas admin.
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
    const apiError =
      json && typeof json === "object" && "error" in json
        ? (json as KieAdminErrorBody).error
        : undefined
    const message =
      typeof apiError === "string" && apiError.trim() !== ""
        ? apiError
        : `La ruta admin de Kie.ai respondió con el estado HTTP ${res.status}`
    throw new Error(message)
  }

  return json as T
}

// ─── Chat (síncrono) ──────────────────────────────────────────────────────

/** Respuesta de `POST /api/admin/kie-ai/chat`. */
export interface KieAdminChatResponse {
  content: string
  raw: unknown
}

/** Chat/LLM síncrono vía la ruta admin. `model` opcional (default de la ruta). */
export async function kieChat(
  messages: KieAiChatMessage[],
  model?: string
): Promise<KieAdminChatResponse> {
  return adminFetch<KieAdminChatResponse>("/api/admin/kie-ai/chat", {
    method: "POST",
    body: JSON.stringify({
      messages,
      ...(typeof model === "string" && model.trim() !== "" ? { model } : {}),
    }),
  })
}

// ─── Tareas de generación asíncronas (imagen / video / música) ───────────

/** Tamaños de imagen válidos (whitelist de la ruta admin). */
export type KieImageSize = "1:1" | "3:2" | "2:3"

/** Inicia una generación de imagen (GPT-4o Image). Devuelve el `taskId`. */
export async function kieImage(
  prompt: string,
  size: KieImageSize = "1:1"
): Promise<KieTaskResponse> {
  return adminFetch<KieTaskResponse>("/api/admin/kie-ai/image", {
    method: "POST",
    body: JSON.stringify({ prompt, size }),
  })
}

/** Modelos de video válidos (whitelist de la ruta admin). */
export type KieVideoModel = "veo3" | "veo3_fast" | "veo3_lite"

/** Razones de aspecto de video válidas (whitelist de la ruta admin). */
export type KieVideoAspectRatio = "16:9" | "9:16" | "Auto"

/**
 * Inicia una generación de video (Veo). Devuelve el `taskId`.
 * OJO: el campo wire de la API/ruta es `aspect_ratio`, no `aspectRatio`.
 */
export async function kieVideo(
  prompt: string,
  model: KieVideoModel = "veo3_fast",
  aspectRatio: KieVideoAspectRatio = "16:9"
): Promise<KieTaskResponse> {
  return adminFetch<KieTaskResponse>("/api/admin/kie-ai/video", {
    method: "POST",
    body: JSON.stringify({ prompt, model, aspect_ratio: aspectRatio }),
  })
}

/** Opciones para `kieMusic`. `callBackUrl` obligatorio (body o env). */
export interface KieMusicOptions {
  model?: string
  callBackUrl?: string
  customMode?: boolean
  instrumental?: boolean
  style?: string
  title?: string
}

/**
 * Inicia una generación de música (Suno). Devuelve el `taskId`.
 * `callBackUrl` es obligatorio: envíalo aquí o define `KIEAI_CALLBACK_URL` en
 * el entorno (si ninguno existe, la ruta responde 400 con mensaje en español).
 */
export async function kieMusic(
  prompt: string,
  opts: KieMusicOptions = {}
): Promise<KieTaskResponse> {
  return adminFetch<KieTaskResponse>("/api/admin/kie-ai/music", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.callBackUrl !== undefined ? { callBackUrl: opts.callBackUrl } : {}),
      ...(opts.customMode !== undefined ? { customMode: opts.customMode } : {}),
      ...(opts.instrumental !== undefined ? { instrumental: opts.instrumental } : {}),
      ...(opts.style !== undefined ? { style: opts.style } : {}),
      ...(opts.title !== undefined ? { title: opts.title } : {}),
    }),
  })
}

// ─── Estado de tareas (status + polling) ──────────────────────────────────

/** Consulta el estado/resultado actual de una tarea asíncrona. */
export async function kieStatus(taskId: string): Promise<KieStatusResponse> {
  return adminFetch<KieStatusResponse>(
    `/api/admin/kie-ai/status?taskId=${encodeURIComponent(taskId)}`
  )
}

/** Estados terminales (case-insensitive; la API real reporta success/fail). */
const TERMINAL_STATES = new Set(["success", "fail", "failed", "error"])

/**
 * Consulta `status` cada 2 s hasta que la tarea llega a un estado terminal
 * (success/fail/failed/error) o se agota el timeout (default 120 s). Lanza un
 * `Error` claro en español si se agota el tiempo.
 */
export async function kieWaitForTask(
  taskId: string,
  timeoutMs = 120_000
): Promise<KieAiTaskRecord> {
  const intervalMs = 2000
  const start = Date.now()

  for (;;) {
    const { record } = await kieStatus(taskId)
    if (TERMINAL_STATES.has(record.state.toLowerCase())) {
      return record
    }
    if (Date.now() - start >= timeoutMs) {
      throw new Error(
        `Se agotó el tiempo de espera (${timeoutMs} ms) para la tarea de Kie.ai ${taskId}`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
