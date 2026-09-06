import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import {
  KieAiError,
  createImageTask,
  isKieAiConfigured,
} from "@/lib/ai/kie-ai"

/**
 * POST /api/admin/kie-ai/image
 * Inicia una tarea de generación de imagen asíncrona en Kie.ai.
 * Body: { prompt, model? } → responde { taskId }.
 * Consulta el resultado en GET /api/admin/kie-ai/status?taskId=...
 */
export async function POST(request: Request) {
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

    const json = await request.json()
    const prompt = (json as { prompt?: unknown }).prompt
    if (typeof prompt !== "string" || prompt.trim() === "") {
      return NextResponse.json({ error: "Se requiere prompt" }, { status: 400 })
    }
    if (prompt.length > 4000) {
      return NextResponse.json(
        { error: "prompt no puede superar los 4000 caracteres" },
        { status: 400 }
      )
    }
    const model =
      typeof (json as { model?: unknown }).model === "string"
        ? (json as { model: string }).model
        : undefined

    const task = await createImageTask({ prompt, ...(model ? { model } : {}) })
    return NextResponse.json({ taskId: task.taskId })
  } catch (error) {
    if (error instanceof KieAiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[POST /api/admin/kie-ai/image]", error)
    return NextResponse.json(
      { error: "No se pudo iniciar la generación de imagen" },
      { status: 500 }
    )
  }
}
