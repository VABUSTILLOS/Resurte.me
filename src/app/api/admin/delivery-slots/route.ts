import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { readJsonBody } from "@/lib/api-body"
import { logAdminAction } from "@/lib/audit-log"
import {
  isDefaultDeliverySlotsConfig,
  normalizeDeliverySlotsConfig,
} from "@/lib/delivery-slots"
import { loadDeliverySlotsConfig, saveDeliverySlotsConfig } from "@/lib/delivery-slots-server"
import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

/**
 * Configuración de franjas de entrega (Ola 7, migración 00236).
 *
 * GET — la configuración vigente para /admin/entregas. Sin la
 *       migración responde `available: false` con la
 *       configuración histórica (la tienda vende como siempre;
 *       solo no se puede guardar otra).
 * PUT — guarda la configuración completa (se normaliza con las
 *       reglas puras de src/lib/delivery-slots.ts) y deja
 *       bitácora `delivery_slots_config_update`. Sin la tabla
 *       responde 409: el panel lo declara en vez de fingir.
 */

export async function GET() {
  const { response: adminDenied } = await requireAdmin({ permission: "pedidos" })
  if (adminDenied) return adminDenied

  const supabase = await createServiceClient()
  const { config, available } = await loadDeliverySlotsConfig(supabase)
  return NextResponse.json({ available, config, isDefault: isDefaultDeliverySlotsConfig(config) })
}

export async function PUT(request: Request) {
  const { user, response: adminDenied } = await requireAdmin({ permission: "pedidos" })
  if (adminDenied) return adminDenied

  const parsed = await readJsonBody<{ config?: unknown }>(request)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  }

  const config = normalizeDeliverySlotsConfig(parsed.data.config ?? parsed.data)

  const supabase = await createServiceClient()
  const saved = await saveDeliverySlotsConfig(supabase, config, user?.id ?? null)
  if (!saved) {
    return NextResponse.json(
      {
        error:
          "No se pudo guardar: falta la migración 00236 (tabla delivery_slots_config) o hubo un error de base de datos.",
        code: "delivery_slots_unavailable",
      },
      { status: 409 }
    )
  }

  await logAdminAction(supabase, {
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: "delivery_slots_config_update",
    entity: "delivery_slots_config",
    entityId: 1,
    detail: {
      cutoffTime: config.cutoffTime,
      capacityPerSlot: config.capacityPerSlot,
      week: config.week,
    },
  })

  return NextResponse.json({ config, isDefault: isDefaultDeliverySlotsConfig(config) })
}
