import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { notifyUser } from "@/lib/notifications"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * /api/admin/facturas — revisión de facturas/tickets subidos por usuarios.
 *
 * GET  → lista de envíos (más recientes primero) con URL firmada (1h) de la
 *        imagen del bucket privado `facturas`.
 * POST → { id, action: "approve" | "reject" | "revoke", credits?, reason? }
 *        approve: abona créditos y marca aprobada en UNA transacción
 *        (approve_invoice_submission, migración 00144), con default del 5%
 *        del total capturado. Idempotente: reintentar no vuelve a abonar.
 *        reject: marca rechazada y notifica.
 *        revoke: deshace una aprobación y debita los créditos abonados
 *        (revoke_invoice_submission). Antes un envío aprobado por error o
 *        fraude quedaba atrapado en 409 y los créditos eran irrecuperables.
 */

/** Rechazos de las RPC de 00144 traducidos a HTTP. */
const REVIEW_ERRORS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: "Envío no encontrado" },
  invalid_credits: { status: 400, error: "Indica los créditos a otorgar" },
  already_reviewed: { status: 409, error: "Este envío ya fue revisado" },
  already_revoked: { status: 409, error: "Esta aprobación ya fue revocada" },
  not_approved: { status: 409, error: "Solo se puede revocar un envío aprobado" },
}

type RpcOutcome = {
  ok?: boolean
  reason?: string
  credits?: number
  reversed?: number
  shortfall?: number
}

function rpcFailure(outcome: RpcOutcome) {
  const mapped = REVIEW_ERRORS[outcome.reason ?? ""] ?? {
    status: 500,
    error: "No se pudo revisar el envío",
  }
  return NextResponse.json({ error: mapped.error, reason: outcome.reason }, { status: mapped.status })
}

export async function GET() {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("invoice_submissions")
      .select(
        "id, user_id, image_path, total_amount, notes, status, credits_granted, created_at, reviewed_at, revoked_at, revoked_credits, revoke_reason"
      )
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      logger.error("[ADMIN FACTURAS] list error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Resolver emails de los autores para identificar al usuario.
    const userIds = [...new Set((data ?? []).map((s) => s.user_id as string))]
    const emailById = new Map<string, string>()
    for (const uid of userIds) {
      const { data: u } = await supabase.auth.admin.getUserById(uid)
      if (u?.user?.email) emailById.set(uid, u.user.email)
    }

    // URLs firmadas (1h) del bucket privado.
    const submissions = await Promise.all(
      (data ?? []).map(async (s) => {
        const { data: signed } = await supabase.storage
          .from("facturas")
          .createSignedUrl(s.image_path as string, 3600)
        return {
          ...s,
          user_email: emailById.get(s.user_id as string) ?? null,
          signed_url: signed?.signedUrl ?? null,
        }
      })
    )

    return NextResponse.json({ submissions })
  } catch (err) {
    logger.error("[ADMIN FACTURAS] GET unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: adminUser, response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    const action = body?.action
    if (
      !Number.isInteger(id) ||
      (action !== "approve" && action !== "reject" && action !== "revoke")
    ) {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const { data: submission, error: fetchErr } = await supabase
      .from("invoice_submissions")
      .select("*")
      .eq("id", id)
      .single()
    if (fetchErr || !submission) {
      return NextResponse.json({ error: "Envío no encontrado" }, { status: 404 })
    }

    // ── Revocar una aprobación: única vía para recuperar créditos ──
    if (action === "revoke") {
      const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : null
      const { data: outcome, error: rpcErr } = await supabase.rpc("revoke_invoice_submission", {
        p_id: id,
        p_admin: adminUser?.id ?? null,
        p_reason: reason,
      })
      if (rpcErr) {
        logger.error("[ADMIN FACTURAS] revoke error:", rpcErr)
        return NextResponse.json({ error: rpcErr.message }, { status: 500 })
      }
      const result = (outcome ?? {}) as RpcOutcome
      if (!result.ok) return rpcFailure(result)

      const reversed = Number(result.reversed ?? 0)
      void notifyUser({
        userId: submission.user_id,
        type: "invoice_revoked",
        title: "Se revocó una factura aprobada",
        body:
          reversed > 0
            ? `Se retiraron $${reversed.toLocaleString("es-MX")} créditos de tu cartera.`
            : "Tu aprobación fue revocada.",
        actionUrl: "/recompensas",
      })
      return NextResponse.json({
        ok: true,
        status: "revoked",
        credits_reversed: reversed,
        shortfall: Number(result.shortfall ?? 0),
      })
    }

    if (submission.status !== "pending") {
      return NextResponse.json({ error: "Este envío ya fue revisado" }, { status: 409 })
    }

    if (action === "reject") {
      const { error } = await supabase
        .from("invoice_submissions")
        .update({ status: "rejected", reviewed_by: adminUser?.id ?? null, reviewed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "pending")
      if (error) {
        logger.error("[ADMIN FACTURAS] reject error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      void notifyUser({
        userId: submission.user_id,
        type: "invoice_rejected",
        title: "Tu factura no pudo validarse",
        body: "Revisa que la imagen sea legible y el folio visible, y vuelve a subirla.",
        actionUrl: "/recompensas",
      })
      return NextResponse.json({ ok: true, status: "rejected" })
    }

    // approve: créditos = 5% del total capturado (o el valor explícito).
    const defaultCredits =
      submission.total_amount != null
        ? Math.round(Number(submission.total_amount) * 0.05 * 100) / 100
        : null
    const credits =
      typeof body?.credits === "number" && body.credits > 0
        ? Math.round(body.credits * 100) / 100
        : defaultCredits
    if (!credits || credits <= 0) {
      return NextResponse.json(
        { error: "Indica los créditos a otorgar (no hay total capturado)" },
        { status: 400 }
      )
    }

    // Abono + marcado en una sola transacción: si algo falla, no queda el
    // monedero abonado con el envío aún pendiente (doble abono al reintentar).
    const { data: outcome, error: rpcErr } = await supabase.rpc("approve_invoice_submission", {
      p_id: id,
      p_credits: credits,
      p_admin: adminUser?.id ?? null,
    })
    if (rpcErr) {
      logger.error("[ADMIN FACTURAS] approve error:", rpcErr)
      return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    }
    const result = (outcome ?? {}) as RpcOutcome
    if (!result.ok) return rpcFailure(result)

    const granted = Number(result.credits ?? credits)
    void notifyUser({
      userId: submission.user_id,
      type: "invoice_approved",
      title: `Factura aprobada: +$${granted.toLocaleString("es-MX")} créditos`,
      body: "Ya están en tu Cartera de Crecimiento.",
      actionUrl: "/recompensas",
    })

    return NextResponse.json({ ok: true, status: "approved", credits_granted: granted })
  } catch (err) {
    logger.error("[ADMIN FACTURAS] POST unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
