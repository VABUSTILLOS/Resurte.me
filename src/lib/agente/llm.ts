/**
 * Cliente mínimo para cualquier API compatible con OpenAI Chat Completions.
 *
 * Prioridad de configuración (variables de entorno, solo servidor):
 *   1. OmniRoute local: OMNIROUTE_BASE_URL + OMNIROUTE_API_KEY
 *   2. OpenAI (u otro gateway): OPENAI_BASE_URL (opcional) + OPENAI_API_KEY
 * Modelo: AGENT_MODEL u OPENAI_MODEL (default "gpt-4o-mini").
 *
 * Temperatura: NO se envía por defecto. Los modelos de razonamiento
 * (p.ej. kimi-k2-thinking, o1, gpt-5) rechazan cualquier temperature ≠ 1
 * con 400 ("invalid temperature: only 1 is allowed for this model"), así
 * que omitirla deja el default del proveedor y funciona con todos. Si el
 * modelo configurado sí la admite y quieres ajustarla, define
 * AGENT_TEMPERATURE (número, p.ej. "0.7").
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

  // Solo incluir `temperature` cuando AGENT_TEMPERATURE esté definida y sea
  // un número válido; si no, se omite del body para no romper modelos que
  // solo aceptan temperature = 1.
  const temperatureEnv = process.env.AGENT_TEMPERATURE?.trim()
  const temperature =
    temperatureEnv && !Number.isNaN(Number(temperatureEnv))
      ? Number(temperatureEnv)
      : undefined

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        ...(temperature !== undefined ? { temperature } : {}),
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
