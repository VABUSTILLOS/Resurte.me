import type { PostgrestError } from "@supabase/supabase-js"
import type { createServiceClient } from "@/lib/supabase/service"

export type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/**
 * Payload de inserción para `public.addresses`.
 *
 * `city_id` es opcional a propósito: la columna (migración 00050) puede no
 * existir aún en el esquema desplegado, y este helper se encarga de degradar
 * de forma retrocompatible sin romper la creación de órdenes estándar.
 */
export interface AddressInsertInput {
  user_id: string | null
  guest_token: string | null
  label?: string
  street: string
  number: string
  interior?: string | null
  neighborhood: string
  city: string
  state: string
  zip_code: string
  references?: string | null
  /** Migración 00050. Null/undefined ⇒ se omite la columna en el INSERT. */
  city_id?: number | null
}

export interface AddressInsertResult {
  id: number
}

export interface AddressInsertOutcome {
  data: AddressInsertResult | null
  error: PostgrestError | null
}

/**
 * ¿El error de PostgREST indica que la columna `city_id` no existe aún?
 *
 * PostgREST expone la columna desconocida de dos formas:
 *  - código SQLSTATE `42703` (undefined_column) cuando el esquema del cache
 *    coincide con la base, o
 *  - `PGRST205` ("Could not find the ... column ... in the schema cache")
 *    cuando el cache de esquema de PostgREST aún no detectó el ALTER.
 * Ambas significan lo mismo: el esquema desplegado no tiene `city_id`.
 */
function isMissingCityIdColumn(error: PostgrestError | null): boolean {
  if (!error) return false
  if (error.code === "42703" || error.code === "PGRST205") return true
  return `${error.code ?? ""} ${error.message ?? ""}`
    .toLowerCase()
    .includes("city_id")
}

/**
 * Inserta una dirección en `public.addresses` tolerando esquemas sin la
 * columna `city_id` (migración 00050 no aplicada en el entorno objetivo).
 *
 * Primer intento con `city_id` (schema actualizado). Si el INSERT falla por
 * columna desconocida, se reintenta con el payload mínimo (sin `city_id`),
 * exactamente como se insertaba antes de la migración 00050. Si el segundo
 * intento también falla, se devuelve el error REAL del reintento (p. ej. una
 * violación de NOT NULL o RLS), no el error de schema.
 *
 * Retrocompatible y fail-open: una base sin `city_id` NO bloquea el checkout.
 */
export async function insertAddressResilient(
  supabase: ServiceClient,
  input: AddressInsertInput
): Promise<AddressInsertOutcome> {
  const base = {
    user_id: input.user_id,
    guest_token: input.guest_token,
    label: input.label ?? "Casa",
    street: input.street,
    number: input.number,
    interior: input.interior ?? null,
    neighborhood: input.neighborhood,
    city: input.city,
    state: input.state,
    zip_code: input.zip_code,
    references: input.references ?? null,
  }

  const attempt = async (withCityId: boolean) => {
    const payload = withCityId && input.city_id != null ? { ...base, city_id: input.city_id } : base
    const { data, error } = await supabase
      .from("addresses")
      .insert(payload)
      .select("id")
      .single()
    return { data, error }
  }

  const first = await attempt(true)
  if (!first.error) {
    return { data: (first.data as AddressInsertResult | null) ?? null, error: null }
  }
  if (!isMissingCityIdColumn(first.error)) {
    return { data: null, error: first.error }
  }

  // Esquema desplegado sin `city_id` (00050 no aplicada): reintento compatible.
  const retry = await attempt(false)
  if (retry.error) {
    return { data: null, error: retry.error }
  }
  return { data: (retry.data as AddressInsertResult | null) ?? null, error: null }
}
