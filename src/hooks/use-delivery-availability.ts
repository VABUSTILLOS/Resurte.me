"use client"

import { useEffect, useState } from "react"
import { getNextDays } from "@/lib/delivery-days"
import { DELIVERY_SLOTS } from "@/lib/delivery-slots"

/**
 * Disponibilidad de entrega para el checkout (Ola 7).
 *
 * Pide a `/api/delivery-slots` los días y franjas tomables según
 * la configuración del panel (franjas por día, hora de corte,
 * capacidad). Mientras la respuesta llega —y si la petición
 * falla— se pinta el comportamiento histórico: los 7 días de
 * `getNextDays()` con las 6 franjas de siempre. El servidor
 * (POST /api/orders) es la autoridad: lo que la configuración
 * corte, allá se rechaza aunque aquí se pinte.
 *
 * La respuesta se comparte entre superficies con una promesa de
 * módulo: el drawer y la página no pagan dos consultas por la
 * misma disponibilidad.
 */

export interface DeliveryAvailabilityOption {
  /** Día local `YYYY-MM-DD`. */
  value: string
  /** Etiqueta visible del día. */
  label: string
  /** Etiquetas de las franjas tomables ese día. */
  times: string[]
}

const FALLBACK_DAYS: DeliveryAvailabilityOption[] = getNextDays().map((day) => ({
  value: day.value,
  label: day.label,
  times: DELIVERY_SLOTS.map((slot) => slot.label),
}))

let sharedRequest: Promise<DeliveryAvailabilityOption[] | null> | null = null

function requestAvailability(): Promise<DeliveryAvailabilityOption[] | null> {
  sharedRequest ??= fetch("/api/delivery-slots")
    .then(async (res) => {
      if (!res.ok) return null
      const body = (await res.json()) as {
        days?: Array<{ value: string; label: string; slots?: Array<{ label: string }> }>
      }
      if (!Array.isArray(body.days)) return null
      return body.days.map((day) => ({
        value: day.value,
        label: day.label,
        times: (day.slots ?? []).map((slot) => slot.label),
      }))
    })
    .catch(() => null)
  return sharedRequest
}

export function useDeliveryAvailability(): DeliveryAvailabilityOption[] {
  const [days, setDays] = useState<DeliveryAvailabilityOption[]>(FALLBACK_DAYS)

  useEffect(() => {
    let alive = true
    void requestAvailability().then((loaded) => {
      if (alive && loaded) setDays(loaded)
    })
    return () => {
      alive = false
    }
  }, [])

  return days
}

/**
 * Ajusta una selección (día, franja) a la disponibilidad: si el
 * día ya no se ofrece, cae al primer día ofrecido; si la franja
 * ya no se ofrece ese día, cae a la primera franja del día.
 * Devuelve la misma referencia si la selección sigue válida
 * (para no disparar efectos en bucle).
 */
export function snapScheduleToAvailability(
  days: readonly DeliveryAvailabilityOption[],
  schedule: { date: string; time: string }
): { date: string; time: string } {
  const day = days.find((d) => d.value === schedule.date) ?? days[0]
  if (!day) return schedule
  if (day.value === schedule.date && day.times.includes(schedule.time)) return schedule
  return { date: day.value, time: day.times[0] ?? schedule.time }
}
