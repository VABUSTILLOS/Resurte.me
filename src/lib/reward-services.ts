/**
 * Catálogo de servicios canjeables (Tienda de Crecimiento).
 *
 * Fuente de verdad: tabla `reward_services` (migración 00075,
 * administrable desde /admin/recompensas). Si la tabla aún no existe o
 * está vacía, se usa el catálogo estático SERVICES como fallback — así la
 * tienda nunca se rompe aunque la migración no se haya aplicado.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { SERVICES } from "@/app/recompensas/_components/services-data"
import { logger } from "@/lib/logger"
import type { ServiceItem } from "@/app/recompensas/_components/types"

interface RewardServiceRow {
  id: string
  name: string
  tier: string
  cost: number
  category: string
  description: string | null
  deliverables: unknown
  estimated_impact: string | null
  testimonial: string | null
  icon: string | null
  is_active: boolean
  display_order: number
}

function rowToService(row: RewardServiceRow): ServiceItem {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier as ServiceItem["tier"],
    cost: Number(row.cost),
    category: row.category as ServiceItem["category"],
    description: row.description ?? "",
    deliverables: Array.isArray(row.deliverables) ? (row.deliverables as string[]) : [],
    estimatedImpact: row.estimated_impact ?? "",
    testimonials: row.testimonial ?? undefined,
    icon: row.icon ?? "🎁",
  }
}

/** Servicios activos ordenados (DB-first, fallback al catálogo estático). */
export async function getRewardServices(): Promise<ServiceItem[]> {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("reward_services")
      .select("*")
      .eq("is_active", true)
      .order("display_order")

    if (error) {
      // 42P01 = tabla inexistente (migración 00075 sin aplicar)
      logger.warn("reward-services.fallback", { message: error.message, code: error.code })
      return SERVICES
    }
    const rows = (data as RewardServiceRow[] | null) ?? []
    if (rows.length === 0) return SERVICES
    return rows.map(rowToService)
  } catch (err) {
    logger.warn("reward-services.fallback", { message: err instanceof Error ? err.message : String(err) })
    return SERVICES
  }
}
