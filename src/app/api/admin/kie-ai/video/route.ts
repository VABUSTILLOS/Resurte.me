import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import {
  KieAiError,
  createVideoTask,
  isKieAiConfigured,
} from "@/lib/ai/kie-ai"

const ALLOWED_MODELS = ["veo3", "veo3_fast", "veo3_lite"]
const DEFAULT_MODEL = "veo3_fast"
const ALLOWED_ASPECT_RATIOS = ["16:9", "9:16", "Auto"]
const DEFAULT_ASPECT_RATIO = "16:9"

/**
 * POST /api/admin/kie-ai/video
 * Inicia una tarea de generación de video asíncrona en Kie.ai (Veo).
 * Body: { prompt, model?, aspect_ratio? } → responde { taskId }.
 * El schema de /veo/generate requiere `model` (default "veo3_fast") y admite
 * `aspect_ratio` (default "16:9"). `model` se envía SIEMPRE.
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
        : DEFAULT_MODEL
    if (!ALLOWED_MODELS.includes(model)) {
      return NextResponse.json(
        {
          error: `model debe ser uno de: ${ALLOWED_MODELS.join(", ")} (default "${DEFAULT_MODEL}")`,
        },
        { status: 400 }
      )
    }

    const aspectRatio =
      typeof (json as { aspect_ratio?: unknown }).aspect_ratio === "string"
        ? (json as { aspect_ratio: string }).aspect_ratio
        : DEFAULT_ASPECT_RATIO
    if (!ALLOWED_ASPECT_RATIOS.includes(aspectRatio)) {
      return NextResponse.json(
        {
          error: `aspect_ratio debe ser uno de: ${ALLOWED_ASPECT_RATIOS.join(", ")} (default "${DEFAULT_ASPECT_RATIO}")`,
        },
        { status: 400 }
      )
    }

    const task = await createVideoTask({ prompt, model, aspect_ratio: aspectRatio })
    return NextResponse.json({ taskId: task.taskId })
  } catch (error) {
    if (error instanceof KieAiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[POST /api/admin/kie-ai/video]", error)
    return NextResponse.json(
      { error: "No se pudo iniciar la generación de video" },
      { status: 500 }
    )
  }
}
