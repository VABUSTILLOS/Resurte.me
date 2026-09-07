import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import {
  KieAiError,
  createMusicTask,
  isKieAiConfigured,
} from "@/lib/ai/kie-ai"

// Modelos válidos para música (Suno) — validado contra docs.kie.ai.
const ALLOWED_MODELS = ["V3_5", "V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5", "V5_5"]
const DEFAULT_MODEL = "V4_5"

/**
 * POST /api/admin/kie-ai/music
 * Inicia una tarea de generación de música asíncrona en Kie.ai (Suno).
 * Body: { prompt, customMode?, instrumental?, model?, style?, title?, callBackUrl? }
 * → responde { taskId }.
 *
 * Endpoint real: POST /api/v1/generate (NO /api/v1/suno/generate → 404). El schema
 * requiere { prompt, customMode, instrumental, model, callBackUrl }; sin esos
 * campos la API responde 422. `callBackUrl` se toma del body o, si no viene, de
 * la variable de entorno KIEAI_CALLBACK_URL. Si ninguna existe → 400.
 * En customMode: true la API además requiere style/title.
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

    // callBackUrl: body → env KIEAI_CALLBACK_URL → 400 (la API lo exige).
    const bodyCallBackUrl = (json as { callBackUrl?: unknown }).callBackUrl
    const callBackUrl =
      typeof bodyCallBackUrl === "string" && bodyCallBackUrl.trim() !== ""
        ? bodyCallBackUrl
        : process.env.KIEAI_CALLBACK_URL
    if (!callBackUrl || callBackUrl.trim() === "") {
      return NextResponse.json(
        {
          error:
            "Se requiere callBackUrl (URL a la que Kie.ai notificará la tarea). Envíalo en el body o define KIEAI_CALLBACK_URL en el entorno.",
        },
        { status: 400 }
      )
    }

    const customMode = (json as { customMode?: unknown }).customMode
    const instrumental = (json as { instrumental?: unknown }).instrumental
    const style = (json as { style?: unknown }).style
    const title = (json as { title?: unknown }).title

    const payload = {
      prompt,
      model,
      callBackUrl,
      customMode: typeof customMode === "boolean" ? customMode : false,
      instrumental: typeof instrumental === "boolean" ? instrumental : false,
      ...(typeof style === "string" && style !== "" ? { style } : {}),
      ...(typeof title === "string" && title !== "" ? { title } : {}),
    }
    if (payload.customMode === true) {
      if (typeof payload.style !== "string" || typeof payload.title !== "string") {
        return NextResponse.json(
          {
            error:
              "Con customMode: true se requieren también style (descripción musical) y title (nombre de la canción).",
          },
          { status: 400 }
        )
      }
    }

    const task = await createMusicTask(payload)
    return NextResponse.json({ taskId: task.taskId })
  } catch (error) {
    if (error instanceof KieAiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[POST /api/admin/kie-ai/music]", error)
    return NextResponse.json(
      { error: "No se pudo iniciar la generación de música" },
      { status: 500 }
    )
  }
}
