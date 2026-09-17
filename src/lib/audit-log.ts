/**
 * Fase 15 — bitácora de auditoría admin: catálogo de acciones, helper de
 * escritura best-effort y lógica pura de filtros para la página.
 */

export const AUDIT_ACTIONS = [
  "order_status",
  "order_payment",
  "product_update",
  "product_bulk_update",
  "product_city_availability",
  "product_create",
  "product_duplicate",
  "product_delete",
  "product_restore",
  "product_purge",
  "category_create",
  "coupon_create",
  "coupon_update",
  "coupon_delete",
  "stock_adjust",
  "user_role",
  "lead_convert",
  "lead_discard",
  "lead_restore",
  "crm_prospect_status",
  "crm_prospect_assign",
  "crm_prospect_notes",
  "crm_prospect_follow_up",
  "crm_prospect_activity",
  "crm_prospect_message",
  "crm_prospect_tags",
  "crm_prospect_bulk_assign",
  "crm_quick_reply_save",
  "crm_quick_reply_delete",
  "crm_sequence_enroll",
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  order_status: "Estado de pedido",
  order_payment: "Confirmación de pago",
  product_update: "Edición de producto",
  product_bulk_update: "Edición masiva de productos",
  product_city_availability: "Disponibilidad por ciudad",
  product_create: "Producto creado",
  product_duplicate: "Producto duplicado",
  product_delete: "Producto eliminado",
  product_restore: "Producto restaurado",
  product_purge: "Papelera vaciada",
  category_create: "Categoría creada",
  coupon_create: "Cupón creado",
  coupon_update: "Cupón editado",
  coupon_delete: "Cupón eliminado",
  stock_adjust: "Ajuste de stock",
  user_role: "Cambio de rol",
  lead_convert: "Lead convertido a prospecto",
  lead_discard: "Lead descartado",
  lead_restore: "Lead restaurado a la bandeja",
  crm_prospect_status: "Estado de prospecto",
  crm_prospect_assign: "Asignación de prospecto",
  crm_prospect_notes: "Notas de prospecto",
  crm_prospect_follow_up: "Seguimiento de prospecto",
  crm_prospect_activity: "Actividad de prospecto",
  crm_prospect_message: "Mensaje enviado al prospecto",
  crm_prospect_tags: "Etiquetas de prospecto",
  crm_prospect_bulk_assign: "Reparto masivo de prospectos",
  crm_quick_reply_save: "Respuesta rápida guardada",
  crm_quick_reply_delete: "Respuesta rápida eliminada",
  crm_sequence_enroll: "Prospecto inscrito en secuencia",
}

function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value)
}

/** Límite duro de filas por consulta de la bitácora. */
export const AUDIT_LOG_PAGE_SIZE = 100

export interface AuditLogFilters {
  action?: string
  /** ISO date YYYY-MM-DD inclusive */
  from?: string
  to?: string
}

/** Normaliza filtros de la UI: acción válida o undefined; fechas saneadas. */
export function normalizeAuditFilters(filters: AuditLogFilters): {
  action?: AuditAction
  from?: string
  to?: string
} {
  const out: { action?: AuditAction; from?: string; to?: string } = {}
  if (filters.action && isAuditAction(filters.action)) {
    out.action = filters.action
  }
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  if (filters.from && ISO_DATE_RE.test(filters.from)) out.from = filters.from
  if (filters.to && ISO_DATE_RE.test(filters.to)) out.to = filters.to
  return out
}

interface SupabaseLike {
  // El builder de PostgREST es thenable (PromiseLike), no Promise nativo.
  from(table: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: unknown }> }
}

/**
 * Inserta un evento en admin_audit_log con service_role. Best-effort:
 * nunca lanza (la bitácora no debe romper la acción que registra, p.ej.
 * si la migración 00078 aún no está aplicada en el entorno).
 */
export async function logAdminAction(
  supabase: SupabaseLike,
  entry: {
    actorId: string | null
    actorEmail: string | null
    action: AuditAction
    entity: string
    entityId?: string | number | null
    detail?: Record<string, unknown>
  }
): Promise<void> {
  try {
    await supabase.from("admin_audit_log").insert({
      actor_id: entry.actorId,
      actor_email: entry.actorEmail,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId != null ? String(entry.entityId) : null,
      detail: entry.detail ?? {},
    })
  } catch {
    // silencioso por diseño
  }
}
