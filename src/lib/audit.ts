/**
 * Bitácora de acciones administrativas (C5, ligera).
 *
 * Sin tabla dedicada: cada acción admin se registra en dos canales
 * existentes, ambos best-effort (nunca bloquean la operación):
 *
 * 1. `logger.info("[AUDIT] ...")` → log estructurado en la plataforma
 *    (Vercel logs / pipeline de alertas), con actor y detalle.
 * 2. Notificación `type = 'admin_audit'` a TODOS los admins
 *    (profiles.role = 'admin') → feed visible en el dashboard /admin.
 *
 * Una migración futura puede mover el feed a una tabla `admin_audit_logs`
 * con filtros por acción/actor; este módulo es la única puerta de entrada,
 * así el cambio de storage es interno.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

export type AdminAuditAction =
  | "order_status_changed"
  | "order_payment_confirmed"
  | "order_driver_assigned"
  | "order_driver_unassigned"

export interface AdminAuditInput {
  /** ID del admin que ejecutó la acción. */
  actorId: string
  action: AdminAuditAction
  orderId: number
  /** Detalle legible, p.ej. "pending → confirmed" o "driver_id=3". */
  detail: string
}

const ACTION_LABEL: Record<AdminAuditAction, string> = {
  order_status_changed: "cambió el estado",
  order_payment_confirmed: "confirmó el pago",
  order_driver_assigned: "asignó repartidor",
  order_driver_unassigned: "quitó el repartidor",
}

export function auditTitle(input: AdminAuditInput): string {
  return `Pedido #${input.orderId}: ${ACTION_LABEL[input.action]}`
}

export function auditBody(input: AdminAuditInput): string {
  return `Admin ${input.actorId.slice(0, 8)} — ${input.detail}`
}

/**
 * Registra la acción: log estructurado + notificación a cada admin.
 * Nunca lanza; los errores quedan en el log.
 */
export async function logAdminAction(input: AdminAuditInput): Promise<void> {
  logger.info("[AUDIT]", {
    actor: input.actorId.slice(0, 8),
    action: input.action,
    order: input.orderId,
    detail: input.detail,
  })

  try {
    const supabase = await createServiceClient()
    const { data: admins, error: adminsErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")

    if (adminsErr) {
      logger.warn("audit.admins_query", { message: adminsErr.message })
      return
    }

    const title = auditTitle(input)
    const body = auditBody(input)
    const rows = (admins ?? []).map((a) => ({
      user_id: a.id,
      type: "admin_audit",
      title,
      body,
      action_url: "/admin/pedidos",
      // Sin order_id: el índice único (order_id, type) deduplicaría
      // acciones distintas sobre el mismo pedido.
    }))

    if (rows.length > 0) {
      const { error } = await supabase.from("notifications").insert(rows)
      if (error) {
        logger.warn("audit.insert", { message: error.message })
      }
    }
  } catch (err) {
    logger.error("audit.error", err)
  }
}
