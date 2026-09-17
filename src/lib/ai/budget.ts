/**
 * Presupuesto diario de tokens de IA por restaurante (migración 00121).
 *
 * No es una cuota de negocio: es un cortafuegos. Sin él, un bucle de
 * reintentos o un cliente abusivo pueden quemar el presupuesto de la
 * plataforma. Cuando se agota, `src/lib/ai/llm.ts` degrada a plantillas y
 * el producto sigue funcionando.
 *
 * Todo aquí es best-effort: si Supabase no responde, se permite la llamada.
 * Preferimos gastar unos tokens de más antes que dejar sin respuesta a un
 * comensal que está escribiendo por WhatsApp.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

/** Tope diario por restaurante. Configurable por si hay que subirlo un día. */
export const DEFAULT_DAILY_TOKEN_CAP = 60_000

/** Estimado conservador de una respuesta corta de restaurante (entrada + salida). */
export const DEFAULT_TOKEN_ESTIMATE = 1_200

export function dailyTokenCap(): number {
  const raw = Number(process.env.AI_DAILY_TOKEN_CAP)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_TOKEN_CAP
}

export interface BudgetDecision {
  allowed: boolean
  /** `false` cuando ni siquiera se pudo consultar el contador. */
  enforced: boolean
}

/**
 * Reserva presupuesto antes de llamar al modelo. Atómico en base de datos
 * (ver `foodos_ai_reserve`), así que dos peticiones simultáneas no rebasan
 * el tope.
 */
export async function reserveAiBudget(
  restaurantId: string | null | undefined,
  estimate: number = DEFAULT_TOKEN_ESTIMATE
): Promise<BudgetDecision> {
  // Sin restaurante no hay a quién cobrarle: pasa sin contador.
  if (!restaurantId) return { allowed: true, enforced: false }

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc("foodos_ai_reserve", {
      p_restaurant_id: restaurantId,
      p_estimate: Math.max(Math.trunc(estimate), 0),
      p_cap: dailyTokenCap(),
    })
    if (error) throw new Error(error.message)
    return { allowed: data === true, enforced: true }
  } catch (err) {
    logger.error("[AiBudget] No se pudo reservar presupuesto", err, { restaurantId })
    return { allowed: true, enforced: false }
  }
}

/**
 * Ajusta el estimado al consumo real y registra los fallbacks. Se llama
 * después de la respuesta del modelo (o de degradar a plantilla).
 */
export async function settleAiBudget(
  restaurantId: string | null | undefined,
  actualTokens: number | null,
  options: { estimate?: number; fallback?: boolean } = {}
): Promise<void> {
  if (!restaurantId) return

  const estimate = options.estimate ?? DEFAULT_TOKEN_ESTIMATE
  // `actualTokens === null` significa que el proveedor no reportó consumo:
  // dejamos el estimado tal cual.
  const delta = actualTokens === null ? 0 : Math.trunc(actualTokens) - estimate

  if (delta === 0 && !options.fallback) return

  try {
    const supabase = await createServiceClient()
    const { error } = await supabase.rpc("foodos_ai_settle", {
      p_restaurant_id: restaurantId,
      p_delta: delta,
      p_fallback: options.fallback === true,
    })
    if (error) throw new Error(error.message)
  } catch (err) {
    logger.error("[AiBudget] No se pudo liquidar el consumo", err, { restaurantId })
  }
}
