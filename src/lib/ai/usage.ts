// ============================================================
// Consumo de IA del restaurante (observabilidad del asistente)
// ============================================================
// La migración 00121 lleva la cuenta de tokens por restaurante y día
// (`foodos_ai_usage`) y `foodos_ai_reserve` corta la generación cuando se
// agota el tope. Eso protege el costo, pero deja al dueño sin explicación:
// su asistente "se queda mudo" y no hay nada en el panel que lo diga.
//
// Este módulo cierra esa brecha. Decisiones:
//
// 1. Se lee la TABLA, no las RPC. `foodos_ai_reserve`/`foodos_ai_settle`
//    están `REVOKE` de `authenticated` (solo `service_role`), así que el
//    panel no puede llamarlas. La política RLS "Owner reads own ai usage" ya
//    deja al dueño leer su propio consumo, que es justo lo que necesita.
//
// 2. El día es LOCAL del restaurante (America/Mexico_City), porque así lo
//    agrupa la migración. Se usa `dayKeyOf` de `local-date` en vez de repetir
//    el cálculo: dos implementaciones de "día de México" acabarían divergiendo
//    y la tarjeta mostraría ceros con la IA trabajando.
//
// 3. El tope es el mismo que aplica `budget.ts` (`dailyTokenCap()`), no una
//    constante propia: si el tope real y el que pinta el panel difieren, el
//    aviso al 80 % miente.
//
// 4. Leer nunca lanza. Sin Supabase o con error de PostgREST devuelve `null` y
//    la tarjeta no se pinta (invariante 18).
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"

import { DEFAULT_DAILY_TOKEN_CAP } from "@/lib/ai/budget"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import { logger } from "@/lib/logger"

type Client = SupabaseClient

/** Al 80 % del tope diario el dueño debe enterarse, no al 100 %. */
export const NEAR_CAP_RATIO = 0.8

/** Días de histórico que devuelve el lector. */
export const USAGE_HISTORY_DAYS = 7

/** Fila cruda de `foodos_ai_usage` (migración 00121). */
export interface AiUsageRow {
  day: string
  tokens_used: number | null
  calls: number | null
  fallbacks: number | null
}

/** Un día de consumo ya normalizado. */
export interface AiUsageDay {
  day: string
  tokensUsed: number
  calls: number
  fallbacks: number
}

export interface AiUsageSnapshot {
  /** Día en curso en hora de México, el mismo que agrupa la migración. */
  day: string
  /** Tokens consumidos hoy (0 si no hubo llamadas). */
  tokensUsed: number
  /** Llamadas a la IA hoy. */
  calls: number
  /** De esas llamadas, cuántas cayeron al respaldo por tope o por error. */
  fallbacks: number
  /** Tope diario vigente (el mismo que aplica `reserveAiBudget`). */
  cap: number
  /** Tokens que quedan hoy. */
  remaining: number
  /** Fracción del tope consumida (0..1, sin recortar). */
  ratio: number
  /** true cuando el consumo alcanzó NEAR_CAP_RATIO del tope. */
  nearCap: boolean
  /** Historial descendente por día, solo los días con registro. */
  history: AiUsageDay[]
}

/** Contadores de Postgres llegan como número, pero se normalizan por si acaso. */
function toCount(value: number | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * Resume el consumo de IA. Puro y determinista: recibe las filas y el día.
 *
 * Un restaurante sin llamadas hoy simplemente no tiene fila, así que el
 * resumen de hoy es ceros — no es un error ni un dato faltante.
 */
export function summarizeAiUsage(
  rows: readonly AiUsageRow[],
  options: { cap?: number; today?: string; days?: number } = {}
): AiUsageSnapshot {
  const cap = options.cap ?? DEFAULT_DAILY_TOKEN_CAP
  const today = options.today ?? dayKeyOf(DEFAULT_TIMEZONE)
  const days = Math.max(1, options.days ?? USAGE_HISTORY_DAYS)

  const byDay = new Map<string, AiUsageDay>()
  for (const row of rows) {
    if (typeof row?.day !== "string" || row.day.length === 0) continue
    byDay.set(row.day, {
      day: row.day,
      tokensUsed: toCount(row.tokens_used),
      calls: toCount(row.calls),
      fallbacks: toCount(row.fallbacks),
    })
  }

  const history = [...byDay.values()]
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .slice(0, days)

  const current = byDay.get(today) ?? { day: today, tokensUsed: 0, calls: 0, fallbacks: 0 }
  const ratio = cap > 0 ? current.tokensUsed / cap : 0

  return {
    day: today,
    tokensUsed: current.tokensUsed,
    calls: current.calls,
    fallbacks: current.fallbacks,
    cap,
    remaining: Math.max(0, cap - current.tokensUsed),
    ratio,
    nearCap: cap > 0 && ratio >= NEAR_CAP_RATIO,
    history,
  }
}

/**
 * Lee y resume el consumo de IA del restaurante.
 *
 * **Nunca lanza.** Sin filas devuelve el resumen en ceros (hay restaurante,
 * simplemente no usó la IA); con error de lectura devuelve `null` para que la
 * tarjeta no se pinte y el tablero siga funcionando.
 */
export async function loadAiUsage(
  supabase: Client,
  restaurantId: string,
  options: { cap?: number; today?: string; days?: number } = {}
): Promise<AiUsageSnapshot | null> {
  const days = Math.max(1, options.days ?? USAGE_HISTORY_DAYS)
  try {
    const { data, error } = await supabase
      .from("foodos_ai_usage")
      .select("day, tokens_used, calls, fallbacks")
      .eq("restaurant_id", restaurantId)
      .order("day", { ascending: false })
      .limit(days)
    if (error) throw new Error(error.message)
    return summarizeAiUsage((data as AiUsageRow[] | null) ?? [], options)
  } catch (error) {
    logger.warn("ai-usage.read", {
      restaurantId,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
