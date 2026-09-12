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
 * POST → { id, action: "approve" | "reject", credits? }
 *        approve: abona créditos vía grant_wallet_credit (default: 5% del
 *        total capturado), marca aprobada y notifica al usuario.
 *        reject: marca rechazada y notifica.
 */

export async function GET() {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("invoice_submissions")
      .select("id, user_id, image_path, total_amount, notes, status, credits_granted, created_at, reviewed_at")
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
    if (!Number.isInteger(id) || (action !== "approve" && action !== "reject")) {
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

    const { error: rpcErr } = await supabase.rpc("grant_wallet_credit", {
      p_user_id: submission.user_id,
      p_amount: credits,
      p_concept: `Factura aprobada #${id}`,
    })
    if (rpcErr) {
      logger.error("[ADMIN FACTURAS] grant error:", rpcErr)
      return NextResponse.json({ error: rpcErr.message }, { status: 500 })
    }

    const { error } = await supabase
      .from("invoice_submissions")
      .update({
        status: "approved",
        credits_granted: credits,
        reviewed_by: adminUser?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending")
    if (error) {
      logger.error("[ADMIN FACTURAS] approve-update error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    void notifyUser({
      userId: submission.user_id,
      type: "invoice_approved",
      title: `Factura aprobada: +$${credits.toLocaleString("es-MX")} créditos`,
      body: "Ya están en tu Cartera de Crecimiento.",
      actionUrl: "/recompensas",
    })

    return NextResponse.json({ ok: true, status: "approved", credits_granted: credits })
  } catch (err) {
    logger.error("[ADMIN FACTURAS] POST unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
