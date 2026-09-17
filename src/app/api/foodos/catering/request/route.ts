import { NextResponse, type NextRequest } from "next/server"

import { createCateringRequest } from "@/lib/foodos-catering-data"
import { logger } from "@/lib/logger"
import { clientIp, rateLimitResponse, rateLimited } from "@/lib/rate-limit"
import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Una solicitud de catering es un acto deliberado, no un clic accidental: el
// límite es holgado pero suficiente para frenar un formulario automatizado.
const RATE_LIMIT_MAX = 6
const RATE_LIMIT_WINDOW_SECONDS = 300

interface CateringRequestBody {
  slug?: unknown
  package_id?: unknown
  headcount?: unknown
  event_date?: unknown
  customer_name?: unknown
  customer_phone?: unknown
  customer_email?: unknown
  notes?: unknown
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * POST /api/foodos/catering/request
 *
 * Registra una solicitud de cotización desde `/r/[slug]/catering`, sin
 * autenticación (service role: la política anónima de escritura se dejó fuera a
 * propósito, para que nadie pueda inventarse un `headcount` ni un total).
 *
 * El total lo calcula `createCateringRequest` en el servidor a partir del
 * paquete real. Lo que llega del navegador son datos del evento, nunca un
 * precio.
 *
 * Una solicitud NO es un pedido: esto no escribe en `foodos_orders`.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(
      supabase,
      `foodos_catering:${clientIp(request)}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_SECONDS
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    const body = (await request.json()) as CateringRequestBody
    const slug = text(body.slug)
    const packageId = text(body.package_id)
    if (!slug || !packageId) {
      return NextResponse.json({ error: "Solicitud incompleta" }, { status: 400 })
    }

    // El restaurante se resuelve aquí, no se confía en un id del navegador:
    // si no, se podría cotizar contra el catálogo de otro restaurante.
    const { data: restaurant, error } = await supabase
      .from("foodos_restaurants")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle()

    if (error || !restaurant) {
      return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 })
    }

    const result = await createCateringRequest(
      supabase,
      (restaurant as { id: string }).id,
      packageId,
      {
        customerName: text(body.customer_name),
        customerPhone: text(body.customer_phone),
        customerEmail: text(body.customer_email) || null,
        eventDate: text(body.event_date),
        headcount: Number(body.headcount),
        notes: text(body.notes) || null,
      }
    )

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, errors: result.errors ?? [] },
        { status: 400 }
      )
    }

    return NextResponse.json({ requestId: result.id ?? null, total: result.total ?? null })
  } catch (error) {
    logger.error("[foodos-catering] no se pudo registrar la solicitud", error)
    return NextResponse.json({ error: "Error interno al enviar la solicitud" }, { status: 500 })
  }
}
