import type { Prospect, ProspectStatus } from "../types"

/**
 * Escapa caracteres especiales para interpolar texto de usuario en
 * patrones `ilike` / filtros `or()` de PostgREST (%, _, comas, paréntesis,
 * comillas, backslash). Sin esto, una búsqueda como "50%" o "a,b" rompe
 * la sintaxis del filtro o altera los resultados.
 */
export function escapeIlike(raw: string): string {
  return raw.replace(/[\\%_,()."]/g, (c) => `\\${c}`)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function digitsOf(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "")
}

export function validateProspectContact(input: {
  name?: string | null
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
}) {
  if (input.name !== undefined && input.name !== null && !input.name.trim()) {
    throw new Error("El nombre del contacto es obligatorio")
  }
  if (input.email && !EMAIL_RE.test(input.email.trim())) {
    throw new Error("El correo no tiene un formato válido")
  }
  for (const [label, value] of [
    ["teléfono", input.phone],
    ["WhatsApp", input.whatsapp],
  ] as const) {
    if (value) {
      const digits = value.replace(/\D/g, "")
      if (digits.length < 8 || digits.length > 15) {
        throw new Error(`El ${label} debe tener entre 8 y 15 dígitos`)
      }
    }
  }
}

export function mapProspect(row: Record<string, unknown>): Prospect {
  return {
    id: Number(row.id),
    seller_id: String(row.seller_id),
    name: String(row.name),
    restaurant_name: (row.restaurant_name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    whatsapp: (row.whatsapp as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    city_id: row.city_id != null ? Number(row.city_id) : null,
    city_name: (row.city_name as string | null) ?? null,
    tier: row.tier != null ? Number(row.tier) : null,
    zone: (row.zone as string | null) ?? null,
    status: row.status as ProspectStatus,
    user_id: (row.user_id as string | null) ?? null,
    referral_code: (row.referral_code as string | null) ?? null,
    last_contact_at: (row.last_contact_at as string | null) ?? null,
    next_follow_up_at: (row.next_follow_up_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    source: (row.source as string) ?? "manual",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

