import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import {
  KieAiError,
  createImageTask,
  isKieAiConfigured,
} from "@/lib/ai/kie-ai"

const ALLOWED_SIZES = ["1:1", "3:2", "2:3"]
const DEFAULT_SIZE = "1:1"

/**
 * POST /api/admin/kie-ai/image
 * Inicia una tarea de generación de imagen asíncrona en Kie.ai (GPT-4o Image).
 * Body: { prompt, size? } → responde { taskId }. `size` por defecto "1:1"
 * (valores aceptados por el schema de la API: "1:1" | "3:2" | "2:3").
 * Nota: `model` NO forma parte del schema de /gpt4o-image/generate y se ignora.
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

    const size =
      typeof (json as { size?: unknown }).size === "string"
        ? (json as { size: string }).size
        : DEFAULT_SIZE
    if (!ALLOWED_SIZES.includes(size)) {
      return NextResponse.json(
        {
          error: `size debe ser uno de: ${ALLOWED_SIZES.join(", ")} (default "${DEFAULT_SIZE}")`,
        },
        { status: 400 }
      )
    }

    const task = await createImageTask({ prompt, size })
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
