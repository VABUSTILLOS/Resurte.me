// ============================================================
// Control por conversación de WhatsApp (Ola 6)
// ============================================================
// La pausa del bot por conversación vive en
// `whatsapp_conversation_controls` (migración 00235), una fila
// por teléfono con la llave phoneKey (últimos 10 dígitos: el
// mismo criterio con el que la bandeja agrupa mensajes).
//
// Qué significa la pausa — y qué NO:
// - Pausado: el webhook deja de responder lo CONVERSACIONAL
//   (palabras clave, asistente con IA, menú de bienvenida)
//   porque una persona del equipo está atendiendo ese chat
//   desde la bandeja. El bot pisando al humano es peor que el
//   bot callado.
// - NUNCA se pausa lo transaccional: pedidos del catálogo,
//   pasos del flujo post-pedido (pago/horario), captura de
//   dirección y ligado de comprobantes siguen su curso con o
//   sin pausa; pausarlos rompería pedidos en marcha.
//
// Degradación: sin la migración 00235 la tabla no existe y todo
// este módulo se comporta como «sin pausa» al leer, y como
// «no se pudo» al escribir (la bandeja lo declara; el webhook
// ni se entera). Nada de aquí lanza.

import { logger } from "@/lib/logger"
import { phoneKey } from "@/lib/crm-core"
import { isMissingRelationError } from "@/lib/sale-window"
import type { createServiceClient } from "@/lib/supabase/service"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

const CONTROLS_TABLE = "whatsapp_conversation_controls"

/** Llave de la conversación: últimos 10 dígitos del número. */
export function conversationKey(phone: string | null | undefined): string | null {
  return phoneKey(phone)
}

/**
 * ¿Está pausado el bot para este teléfono? Best-effort: cualquier
 * fallo de lectura (incluida la tabla ausente sin 00235) se lee
 * como «no pausado», que es el comportamiento histórico.
 */
export async function getBotPaused(
  supabase: ServiceClient,
  phone: string
): Promise<boolean> {
  const key = conversationKey(phone)
  if (!key) return false
  try {
    const { data, error } = await supabase
      .from(CONTROLS_TABLE)
      .select("bot_paused")
      .eq("phone", key)
      .maybeSingle()
    if (error) {
      if (!isMissingRelationError(error)) {
        logger.warn("whatsapp.controls: no se pudo leer la pausa", {
          error: error.message,
        })
      }
      return false
    }
    return Boolean((data as { bot_paused?: boolean } | null)?.bot_paused)
  } catch (err) {
    logger.warn("whatsapp.controls: excepción leyendo la pausa", {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

export type SetBotPausedResult =
  | { ok: true }
  /** La migración 00235 no está aplicada: la pausa no existe todavía. */
  | { ok: false; reason: "missing_schema" | "error" }

/**
 * Enciende o apaga la pausa del bot para un teléfono.
 * `updatedBy` es el admin que la movió desde la bandeja, o null
 * cuando la enciende el propio asistente al derivar a un humano.
 */
export async function setBotPaused(
  supabase: ServiceClient,
  phone: string,
  paused: boolean,
  updatedBy: string | null
): Promise<SetBotPausedResult> {
  const key = conversationKey(phone)
  if (!key) return { ok: false, reason: "error" }
  try {
    const { error } = await supabase.from(CONTROLS_TABLE).upsert(
      {
        phone: key,
        bot_paused: paused,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone" }
    )
    if (error) {
      if (isMissingRelationError(error)) return { ok: false, reason: "missing_schema" }
      logger.error("whatsapp.controls: no se pudo guardar la pausa", {
        error: error.message,
      })
      return { ok: false, reason: "error" }
    }
    return { ok: true }
  } catch (err) {
    logger.error("whatsapp.controls: excepción guardando la pausa", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, reason: "error" }
  }
}

/**
 * Lee el estado de pausa de MUCHAS conversaciones en una sola
 * consulta (para la lista de la bandeja). Devuelve el conjunto
 * de llaves pausadas; sin la tabla, conjunto vacío.
 */
export async function getPausedConversationKeys(
  supabase: ServiceClient,
  keys: readonly string[]
): Promise<Set<string>> {
  const paused = new Set<string>()
  if (keys.length === 0) return paused
  try {
    const { data, error } = await supabase
      .from(CONTROLS_TABLE)
      .select("phone")
      .in("phone", [...keys])
      .eq("bot_paused", true)
    if (error) {
      if (!isMissingRelationError(error)) {
        logger.warn("whatsapp.controls: no se pudo leer el lote de pausas", {
          error: error.message,
        })
      }
      return paused
    }
    for (const row of (data ?? []) as Array<{ phone?: string }>) {
      if (row.phone) paused.add(row.phone)
    }
    return paused
  } catch (err) {
    logger.warn("whatsapp.controls: excepción leyendo el lote de pausas", {
      error: err instanceof Error ? err.message : String(err),
    })
    return paused
  }
}
