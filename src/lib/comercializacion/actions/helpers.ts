import { mapCrmProspect } from "@/lib/crm-core"

/**
 * Ronda 7: el mapeo de fila → prospecto vive en `crm-core.ts` y es el mismo que
 * usa el panel admin. Se reexporta para no tocar a sus consumidores.
 */
export { mapCrmProspect as mapProspect }

/**
 * Escapa caracteres especiales para interpolar texto de usuario en
 * patrones `ilike` / filtros `or()` de PostgREST (%, _, comas, paréntesis,
 * comillas, backslash). Sin esto, una búsqueda como "50%" o "a,b" rompe
 * la sintaxis del filtro o altera los resultados.
 */
export function escapeIlike(raw: string): string {
  return raw.replace(/[\\%_,()."]/g, (c) => `\\${c}`)
}

/**
 * Prepara un término de búsqueda para interpolarlo dentro de un `.or()` de
 * PostgREST, donde el valor se envuelve en comillas dobles:
 *   .or(`name.ilike."%${escapeOrTerm(q)}%"`)
 *
 * El backslash NO es un escape reconocido por el parser de filtros de
 * PostgREST: los caracteres reservados (`,()`) solo son seguros dentro de
 * un valor entre comillas dobles. La comilla doble no puede representarse
 * dentro de un valor citado, así que se elimina (un término de búsqueda
 * nunca la necesita). Los comodines LIKE (% _) siguen escapados con
 * backslash, que sí es el escape de LIKE en PostgreSQL.
 */
export function escapeOrTerm(raw: string): string {
  return escapeIlike(raw.replace(/"/g, ""))
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

/**
 * Valida los números del prospecto antes de tocar la base.
 *
 * La base ya tiene `CHECK (estimated_value >= 0)` (00184), pero un error de
 * constraint llega al usuario como «Error al crear el prospecto», sin decir qué
 * campo está mal. Y el rango de volumen invertido **no lo rechaza la base**: lo
 * rechaza aquí, porque el agente IA razona sobre ese intervalo y uno invertido
 * es un intervalo vacío — el agente leería «entre 500 y 200» como una ficha sin
 * mercado.
 *
 * En una edición parcial la comparación del rango solo se aplica cuando llegan
 * los dos extremos; el formulario compartido siempre los manda juntos.
 */
export function validateProspectSegmentation(input: {
  estimated_value?: number | null
  employees?: number | null
  weekly_volume_min?: number | null
  weekly_volume_max?: number | null
}) {
  for (const [label, value] of [
    ["El valor previsto", input.estimated_value],
    ["El número de empleados", input.employees],
    ["El volumen semanal mínimo", input.weekly_volume_min],
    ["El volumen semanal máximo", input.weekly_volume_max],
  ] as const) {
    if (value === undefined || value === null) continue
    if (!Number.isFinite(value)) throw new Error(`${label} no es un número válido`)
    if (value < 0) throw new Error(`${label} no puede ser negativo`)
  }
  const min = input.weekly_volume_min
  const max = input.weekly_volume_max
  if (min != null && max != null && min > max) {
    throw new Error("El volumen semanal mínimo no puede superar al máximo")
  }
}
