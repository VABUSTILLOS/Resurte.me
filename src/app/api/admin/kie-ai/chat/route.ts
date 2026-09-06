import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import {
  KieAiChatMessage,
  KieAiError,
  chatCompletion,
  isKieAiConfigured,
} from "@/lib/ai/kie-ai"

const ALLOWED_ROLES: KieAiChatMessage["role"][] = ["system", "user", "assistant"]
const MAX_MESSAGES = 50
const MAX_MESSAGE_LENGTH = 16000

/**
 * POST /api/admin/kie-ai/chat
 * Chat/LLM síncrono (compatible OpenAI) a través de Kie.ai.
 * Body: { messages, model?, temperature? } → responde { content, raw }.
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
    const messages = (json as { messages?: unknown }).messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Se requiere messages" }, { status: 400 })
    }
    if (messages.length > MAX_MESSAGES) {
      return NextResponse.json(
        { error: `messages no puede superar ${MAX_MESSAGES} entradas` },
        { status: 400 }
      )
    }

    const sanitized: KieAiChatMessage[] = []
    for (const message of messages) {
      const msg = message as { role?: unknown; content?: unknown }
      if (
        typeof msg !== "object" ||
        msg === null ||
        !ALLOWED_ROLES.includes(msg.role as KieAiChatMessage["role"]) ||
        typeof msg.content !== "string"
      ) {
        return NextResponse.json(
          {
            error: "Cada mensaje debe tener role (system|user|assistant) y content (string)",
          },
          { status: 400 }
        )
      }
      if (msg.content.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json(
          { error: `content no puede superar ${MAX_MESSAGE_LENGTH} caracteres` },
          { status: 400 }
        )
      }
      sanitized.push({ role: msg.role as KieAiChatMessage["role"], content: msg.content })
    }

    const model =
      typeof (json as { model?: unknown }).model === "string"
        ? (json as { model: string }).model
        : ""
    const temperature = (json as { temperature?: unknown }).temperature
    const result = await chatCompletion({
      model,
      messages: sanitized,
      ...(typeof temperature === "number" ? { temperature } : {}),
    })
    return NextResponse.json({ content: result.content, raw: result.raw })
  } catch (error) {
    if (error instanceof KieAiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[POST /api/admin/kie-ai/chat]", error)
    return NextResponse.json(
      { error: "No se pudo completar la llamada de chat" },
      { status: 500 }
    )
  }
}
