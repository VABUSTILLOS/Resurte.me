import { NextResponse } from "next/server"
import { getNextDays } from "@/lib/delivery-days"
import { buildDeliveryAvailability } from "@/lib/delivery-slots"
import { fetchSlotTakenCounts, loadDeliverySlotsConfig } from "@/lib/delivery-slots-server"
import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

/**
 * Disponibilidad de entrega para el checkout (Ola 7).
 *
 * Devuelve los próximos 7 días con las franjas tomables de cada
 * uno, según la configuración del panel (/admin/entregas,
 * migración 00236): franjas por día de semana, hora de corte y
 * capacidad. Sin configuración tocada responde exactamente lo
 * histórico: 7 días × las 6 franjas de siempre.
 *
 * Es la MISMA regla que valida POST /api/orders al crear el
 * pedido: lo que aquí no se ofrece, allá se rechaza. El cliente
 * la usa para pintar; si la petición falla, el checkout cae a
 * sus listas estáticas de siempre (y el servidor sigue siendo
 * la autoridad).
 */
export async function GET() {
  const supabase = await createServiceClient()
  const { config } = await loadDeliverySlotsConfig(supabase)

  const now = new Date()
  const dayKeys = getNextDays(undefined, now).map((d) => d.value)
  const taken =
    config.capacityPerSlot !== null ? await fetchSlotTakenCounts(supabase, dayKeys) : undefined

  const days = buildDeliveryAvailability(config, { now, taken })

  return NextResponse.json(
    {
      days: days.map((day) => ({
        value: day.value,
        label: day.label,
        slots: day.slots.map((slot) => ({ id: slot.id, label: slot.label, start: slot.start })),
      })),
      cutoffTime: config.cutoffTime,
      capacityPerSlot: config.capacityPerSlot,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}
