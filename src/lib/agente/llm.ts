/**
 * Cliente del LLM para el agente de comercialización.
 *
 * Delega en la capa compartida `src/lib/ai/llm.ts` para que exista UN solo
 * lugar donde se decide qué proveedor se usa (OmniRoute → OpenAI → Kie.ai),
 * con sus timeouts, reintentos y logs. Antes este archivo duplicaba esa
 * resolución, así que añadir un proveedor exigía tocar dos sitios.
 *
 * Diferencia de contrato con `generateText`: aquí se devuelve `null` en vez
 * de copy de respaldo, porque el agente ya tiene sus propias plantillas
 * deterministas (`src/lib/agente/templates.ts`) y decide él cuándo usarlas.
 *
 * Temperatura: NO se envía salvo que `AGENT_TEMPERATURE` esté definida. Los
 * modelos de razonamiento (kimi-k2-thinking, o1, gpt-5) rechazan cualquier
 * temperature ≠ 1 con 400 ("invalid temperature: only 1 is allowed for this
 * model"), así que omitirla deja el default del proveedor y funciona con todos.
 */

import { chatCompletionRaw } from "@/lib/ai/llm"

/** Tope de tokens de una respuesta del agente (planes y mensajes cortos). */
const AGENT_MAX_TOKENS = 600

export interface ChatResult {
  text: string
  model: string
}

export async function chatCompletion(
  system: string,
  user: string
): Promise<ChatResult | null> {
  const temperatureEnv = process.env.AGENT_TEMPERATURE?.trim()
  const temperature =
    temperatureEnv && !Number.isNaN(Number(temperatureEnv))
      ? Number(temperatureEnv)
      : undefined

  const result = await chatCompletionRaw(system, user, {
    feature: "agente_comercializacion",
    maxTokens: AGENT_MAX_TOKENS,
    temperature,
  })

  return result ? { text: result.text, model: result.model } : null
}
