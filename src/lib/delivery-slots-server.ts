// ============================================================
// Configuración de franjas de entrega — lado servidor (Ola 7)
// ============================================================
// La configuración vive en `delivery_slots_config` (migración
// 00236): una sola fila (id = 1) con el JSON de
// `DeliverySlotsConfig`. Acceso solo con service_role (ver el
// registro en rls-declared.contract.test.ts).
//
// Degradación (patrón del repo): sin la migración la tabla no
// existe y todo este módulo se comporta como «la configuración
// histórica» al leer —el checkout, WhatsApp y los recurrentes
// venden como siempre— y como «no se pudo» al escribir (el
// panel lo declara). Nada de aquí lanza hacia el checkout.

import { logger } from "@/lib/logger"
import { DEFAULT_TIMEZONE, dayKeyOf, localDateParts, minutesWithinHour } from "@/lib/local-date"
import {
  DEFAULT_DELIVERY_SLOTS_CONFIG,
  DELIVERY_SLOTS,
  slotTakenKey,
  type DeliverySlot,
  type DeliverySlotsConfig,
  normalizeDeliverySlotsConfig,
} from "@/lib/delivery-slots"
import { isMissingRelationError } from "@/lib/sale-window"
import type { createServiceClient } from "@/lib/supabase/service"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

const CONFIG_TABLE = "delivery_slots_config"

export interface LoadedDeliverySlotsConfig {
  config: DeliverySlotsConfig
  /** `false` si la tabla no existe (migración 00236 sin correr). */
  available: boolean
}

/**
 * Lee la configuración vigente. Cualquier fallo —tabla ausente
 * incluida— degrada a la configuración histórica con
 * `available: false` solo cuando la causa es la tabla ausente;
 * un error de lectura transitorio degrada igual pero se lee
 * como disponible (el panel no debe declarar «corre la
 * migración» por un tropiezo de red).
 */
export async function loadDeliverySlotsConfig(
  supabase: ServiceClient
): Promise<LoadedDeliverySlotsConfig> {
  try {
    const { data, error } = await supabase
      .from(CONFIG_TABLE)
      .select("config")
      .eq("id", 1)
      .maybeSingle()
    if (error) {
      if (isMissingRelationError(error)) {
        return { config: structuredClone(DEFAULT_DELIVERY_SLOTS_CONFIG), available: false }
      }
      logger.warn("delivery-slots: no se pudo leer la configuración", { error: error.message })
      return { config: structuredClone(DEFAULT_DELIVERY_SLOTS_CONFIG), available: true }
    }
    if (!data) return { config: structuredClone(DEFAULT_DELIVERY_SLOTS_CONFIG), available: true }
    return {
      config: normalizeDeliverySlotsConfig((data as { config: unknown }).config),
      available: true,
    }
  } catch (err) {
    logger.warn("delivery-slots: lectura de configuración falló", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { config: structuredClone(DEFAULT_DELIVERY_SLOTS_CONFIG), available: true }
  }
}

/**
 * Guarda la configuración (upsert de la fila única). Devuelve
 * `false` si la tabla no existe: el panel lo declara en vez de
 * fingir que guardó.
 */
export async function saveDeliverySlotsConfig(
  supabase: ServiceClient,
  config: DeliverySlotsConfig,
  userId: string | null
): Promise<boolean> {
  const { error } = await supabase.from(CONFIG_TABLE).upsert(
    { id: 1, config, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  )
  if (error) {
    if (isMissingRelationError(error)) return false
    logger.error("delivery-slots: no se pudo guardar la configuración", error)
    return false
  }
  return true
}

/**
 * Ocupación de las franjas: cuántos pedidos no cancelados ya
 * ocupan cada (día, franja). Solo se consulta cuando la
 * configuración trae capacidad —sin capacidad nadie la lee y
 * el checkout no paga consultas de más—.
 *
 * La franja de un pedido se deriva de su `scheduled_for` en hora
 * local (día local + minutos de inicio), la misma convención
 * con la que se escribió.
 */
export async function fetchSlotTakenCounts(
  supabase: ServiceClient,
  dayKeys: readonly string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (dayKeys.length === 0) return counts

  const firstDay = dayKeys[0] ?? ""
  const lastDay = dayKeys[dayKeys.length - 1] ?? firstDay
  const from = new Date(`${firstDay}T00:00:00-06:00`).toISOString()
  const to = new Date(`${lastDay}T23:59:59-06:00`).toISOString()

  const { data, error } = await supabase
    .from("orders")
    .select("scheduled_for")
    .gte("scheduled_for", from)
    .lte("scheduled_for", to)
    .neq("status", "cancelled")
    .not("scheduled_for", "is", null)
    .limit(5000)

  if (error) {
    // Sin conteo fiable no se inventa ocupación: se devuelve el
    // mapa vacío y la capacidad no bloquea (degradación segura
    // hacia vender, registrada en el log).
    logger.warn("delivery-slots: no se pudo contar la ocupación de franjas", {
      error: error.message,
    })
    return counts
  }

  for (const row of data ?? []) {
    const raw = (row as { scheduled_for: string | null }).scheduled_for
    if (!raw) continue
    const at = new Date(raw)
    if (Number.isNaN(at.getTime())) continue
    const dayKey = dayKeyOf(DEFAULT_TIMEZONE, at)
    if (!dayKeys.includes(dayKey)) continue
    const parts = localDateParts(DEFAULT_TIMEZONE, at)
    const startMinutes = parts.hour * 60 + minutesWithinHour(DEFAULT_TIMEZONE, at)
    const slot = SLOT_BY_START_MINUTES.get(startMinutes)
    if (!slot) continue
    const key = slotTakenKey(dayKey, slot.id)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** Franja según sus minutos de inicio en hora local. */
const SLOT_BY_START_MINUTES = new Map<number, DeliverySlot>(
  DELIVERY_SLOTS.map((s) => [s.startMinutes, s])
)

/** Conteo de pedidos de UNA franja y día (validación de un pedido). */
export async function countOrdersInSlot(
  supabase: ServiceClient,
  dayKey: string,
  slot: DeliverySlot
): Promise<number> {
  const counts = await fetchSlotTakenCounts(supabase, [dayKey])
  return counts.get(slotTakenKey(dayKey, slot.id)) ?? 0
}
