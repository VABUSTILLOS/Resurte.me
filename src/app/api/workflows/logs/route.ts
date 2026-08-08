/**
 * GET /api/workflows/logs
 * 
 * Returns recent workflow execution logs from the whatsapp_messages table.
 * Query params: ?orderId=123&workflowType=new_order_staff&limit=50
 */

import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"

export async function GET(req: NextRequest) {
  try {
    // Los logs de workflows contienen teléfonos y contenido de mensajes: solo admins.
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const supabase = await createServiceClient()
    const url = req.nextUrl
    const orderId = url.searchParams.get("orderId")
    const workflowType = url.searchParams.get("workflowType")
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200)

    let query = supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("direction", "outbound")
      .like("message_type", "workflow:%")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (orderId) {
      query = query.eq("order_id", parseInt(orderId))
    }

    if (workflowType) {
      query = query.eq("message_type", `workflow:${workflowType}`)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

interface ParsedContent {
  status?: string
  message_id?: string | null
  error?: string | null
}

// ... (inside the map callback)

    // Parse the JSON content for each log entry
    const logs = (data || []).map((entry) => {
      let parsed: ParsedContent = {}
      try {
        parsed = JSON.parse(entry.content || "{}")
      } catch { /* keep raw */ }
      return {
        id: entry.id,
        workflow_type: entry.message_type?.replace("workflow:", ""),
        order_id: entry.order_id,
        recipient: entry.from_number,
        status: parsed.status || "unknown",
        message_id: parsed.message_id || null,
        error: parsed.error || null,
        created_at: entry.created_at,
      }
    })

    return NextResponse.json({
      success: true,
      total: logs.length,
      logs,
    })
  } catch (err) {
    console.error("[API] Error fetching workflow logs:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
