// ============================================================
// Lectura de reglas de descuento automático (solo servidor)
// ============================================================
// La evaluación vive en coupon-rules.ts (pura, compartida). Aquí
// solo está la lectura de `automatic_discount_rules` con el
// cliente de servicio, que consumen la cotización del carrito
// (POST /api/discounts/automatic) y la creación del pedido
// (POST /api/orders, que recalcula y nunca confía en el cliente).
//
// Degradación: si la migración 00231 aún no se aplica, la tabla no
// existe (42P01) y se devuelve «sin reglas» — el checkout sigue
// funcionando exactamente como antes.

import { logger } from "@/lib/logger"
import { isMissingRelationError } from "@/lib/sale-window"
import type { AutomaticDiscountRuleRow } from "@/lib/coupon-rules"
import type { createServiceClient } from "@/lib/supabase/service"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/** Reglas activas, en orden de creación (el orden de evaluación). */
export async function fetchActiveAutomaticDiscountRules(
  supabase: ServiceClient
): Promise<AutomaticDiscountRuleRow[]> {
  const { data, error } = await supabase
    .from("automatic_discount_rules")
    .select("id, name, rule_type, is_active, config")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
  if (error) {
    if (!isMissingRelationError(error)) {
      logger.error("[automatic-discounts] error leyendo reglas; se vende sin automáticos", error)
    }
    return []
  }
  return (data ?? []) as unknown as AutomaticDiscountRuleRow[]
}
