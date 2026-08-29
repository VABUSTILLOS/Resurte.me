/**
 * Cliente mínimo para cualquier API compatible con OpenAI Chat Completions.
 *
 * Prioridad de configuración (variables de entorno, solo servidor):
 *   1. OmniRoute local: OMNIROUTE_BASE_URL + OMNIROUTE_API_KEY
 *   2. OpenAI (u otro gateway): OPENAI_BASE_URL (opcional) + OPENAI_API_KEY
 * Modelo: AGENT_MODEL u OPENAI_MODEL (default "gpt-4o-mini").
 *
 * Si no hay API key configurada devuelve null y el agente usa las
 * plantillas deterministas del plan (templates.ts).
 */

import { logger } from "@/lib/logger"

export interface ChatResult {
  text: string
  model: string
}

export async function chatCompletion(
  system: string,
  user: string
): Promise<ChatResult | null> {
  const apiKey = process.env.OMNIROUTE_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const baseUrl = (
    process.env.OMNIROUTE_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1"
  ).replace(/\/+$/, "")
  const model =
    process.env.AGENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini"

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 600,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      cache: "no-store",
    })

    if (!res.ok) {
      logger.error(`[AgenteIA] LLM respondió ${res.status}: ${await res.text()}`)
      return null
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = data.choices?.[0]?.message?.content?.trim()
    return text ? { text, model } : null
  } catch (err) {
    logger.error("[AgenteIA] Error llamando al LLM:", err)
    return null
  }
}
