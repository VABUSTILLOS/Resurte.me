import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { isCurrentUserAdmin } from "@/lib/foodos-admin"
import { getOperatingPickerState } from "@/lib/foodos-operating"
import { getAdminFoodosRestaurants } from "../actions"
import { OperatingPicker, type OperatingPickerRow } from "./operating-picker"

export const metadata: Metadata = {
  title: "Operar como restaurante | Resurte",
  robots: { index: false, follow: false },
}

// El listado y la sesión de soporte son datos vivos: nada que prerenderizar.
export const dynamic = "force-dynamic"

/**
 * Selector de restaurante para la sesión de soporte (P14).
 *
 * Es la puerta de entrada a la impersonación: el admin elige un restaurante y
 * el panel pasa a operar con sus datos. El layout de `/admin` ya exige rol, pero
 * el guard se repite aquí porque esta página es la que entrega el listado
 * completo de restaurantes — la única superficie donde un fallo de gate
 * expondría datos de todos los clientes a la vez.
 *
 * El listado se reutiliza de `/admin/restaurantes` (`getAdminFoodosRestaurants`)
 * en vez de leer la tabla otra vez: ya trae el nivel efectivo de cada uno, que es
 * justo lo que el admin necesita saber antes de entrar (el nivel real del
 * restaurante es el que va a ver mientras dure la sesión).
 */
export default async function AdminOperateAsPage() {
  if (!(await isCurrentUserAdmin())) {
    redirect("/")
  }

  // El estado de la sesión no puede tumbar la página: si falla, el selector se
  // pinta sin saber cuál está activo en vez de mostrar el error boundary.
  const state = await getOperatingPickerState().catch(() => ({
    operatingRestaurantId: null,
    ownRestaurantId: null,
  }))

  let rows: OperatingPickerRow[] = []
  let error: string | null = null
  try {
    const restaurants = await getAdminFoodosRestaurants()
    rows = restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      tier: r.tier,
      ownerEmail: r.ownerEmail,
    }))
  } catch {
    error = "No se pudieron cargar los restaurantes. Intenta de nuevo."
  }

  return (
    <OperatingPicker
      rows={rows}
      error={error}
      ownRestaurantId={state.ownRestaurantId}
      operatingRestaurantId={state.operatingRestaurantId}
    />
  )
}
