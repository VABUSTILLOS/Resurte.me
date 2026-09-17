/**
 * Pertenencia del restaurante.
 *
 * Vive en `lib` y no en el módulo de server actions porque lo usan varios
 * módulos de acciones (`actions.ts`, `caja-actions.ts`, …) y un archivo
 * `"use server"` no puede exportar helpers: todo lo que exporta se convierte
 * en una acción invocable desde el navegador.
 *
 * RLS ya filtra por dueño; esta comprobación existe para poder devolver un
 * error claro en lugar de un "0 filas" silencioso cuando alguien manda el
 * `restaurant_id` de otro.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export async function assertOwnRestaurant(
  supabase: SupabaseClient,
  userId: string,
  restaurantId: string
): Promise<void> {
  const { data } = await supabase
    .from("foodos_restaurants")
    .select("id")
    .eq("id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!data) throw new Error("Restaurante no encontrado")
}
