import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { KieAiError, getTaskStatus, isKieAiConfigured } from "@/lib/ai/kie-ai"

/**
 * GET /api/admin/kie-ai/status?taskId=...
 * Consulta el estado/resultado actual de una tarea asíncrona (imagen, video o
 * música) previamente creada en POST /api/admin/kie-ai/{image,video,music}.
 */
export async function GET(request: Request) {
  try {
    // Solo administradores pueden usar el piloto de Kie.ai.
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    if (!isKieAiConfigured()) {
      return NextResponse.json(
        {
          error:
            "KIE_AI_API_KEY no está configurada. Ver .env.local.example / docs/KIE_AI.md.",
        },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get("taskId")
    if (!taskId || taskId.trim() === "") {
      return NextResponse.json({ error: "Se requiere taskId" }, { status: 400 })
    }

    const record = await getTaskStatus(taskId)
    return NextResponse.json({ record })
  } catch (error) {
    if (error instanceof KieAiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[GET /api/admin/kie-ai/status]", error)
    return NextResponse.json(
      { error: "No se pudo consultar el estado de la tarea" },
      { status: 500 }
    )
  }
}
