import { describe, expect, it } from "vitest"
import {
  buildConversationSummaries,
  classifyMessageAuthor,
  messageDisplayText,
} from "./whatsapp-inbox"
import type { InboxMessage } from "./crm-inbox"

const msg = (partial: Partial<InboxMessage>): InboxMessage => ({
  id: 1,
  direction: "inbound",
  content: "hola",
  created_at: "2026-11-25T10:00:00.000Z",
  message_type: "incoming:text",
  from_number: "5216141261296",
  ...partial,
})

describe("classifyMessageAuthor", () => {
  it("todo entrante es del cliente", () => {
    expect(classifyMessageAuthor(msg({ direction: "inbound" }))).toBe("cliente")
  })

  it("distingue IA, bot, automático y equipo en los salientes", () => {
    expect(classifyMessageAuthor(msg({ direction: "outbound", message_type: "bot:ai" }))).toBe("ia")
    expect(classifyMessageAuthor(msg({ direction: "outbound", message_type: "bot:handoff" }))).toBe("ia")
    expect(classifyMessageAuthor(msg({ direction: "outbound", message_type: "bot:menu" }))).toBe("bot")
    expect(classifyMessageAuthor(msg({ direction: "outbound", message_type: "bot:flow" }))).toBe("bot")
    expect(classifyMessageAuthor(msg({ direction: "outbound", message_type: "template:promocion_semanal_resurte" }))).toBe("automatico")
    expect(classifyMessageAuthor(msg({ direction: "outbound", message_type: "workflow:order_confirmation" }))).toBe("automatico")
    expect(classifyMessageAuthor(msg({ direction: "outbound", message_type: "automation:birthday" }))).toBe("automatico")
    expect(classifyMessageAuthor(msg({ direction: "outbound", message_type: "text" }))).toBe("equipo")
  })
})

describe("messageDisplayText", () => {
  it("el texto libre pasa tal cual", () => {
    expect(messageDisplayText(msg({ content: "¿cuánto cuesta?" }))).toBe("¿cuánto cuesta?")
    expect(
      messageDisplayText(msg({ direction: "outbound", message_type: "bot:ai", content: "Cuesta $32" }))
    ).toBe("Cuesta $32")
  })

  it("los JSON se muestran como etiqueta, no crudos", () => {
    expect(
      messageDisplayText(msg({ message_type: "incoming:order", content: '{"product_items":[]}' }))
    ).toBe("🛒 Pedido enviado desde el catálogo")
    expect(
      messageDisplayText(msg({ message_type: "incoming:image", content: '{"media_id":"1"}' }))
    ).toBe("📷 Imagen recibida")
    expect(
      messageDisplayText(
        msg({ direction: "outbound", message_type: "template:recordatorio_pago_resurte", content: "{}" })
      )
    ).toBe("📋 Plantilla: recordatorio_pago_resurte")
    expect(
      messageDisplayText(
        msg({ direction: "outbound", message_type: "workflow:new_order_customer", content: "{}" })
      )
    ).toContain("Confirmar pedido al cliente")
  })
})

describe("buildConversationSummaries", () => {
  const now = new Date("2026-11-25T12:00:00.000Z")
  const rows = [
    {
      id: 3,
      from_number: "5216141261296",
      message_type: "bot:ai",
      content: "Cuesta $32 MXN",
      direction: "outbound",
      created_at: "2026-11-25T11:30:00.000Z",
    },
    {
      id: 2,
      from_number: "6141261296",
      message_type: "incoming:text",
      content: "¿cuánto cuesta el arroz?",
      direction: "inbound",
      created_at: "2026-11-25T11:00:00.000Z",
    },
    {
      id: 1,
      from_number: "5216145550000",
      message_type: "incoming:text",
      content: "buenas tardes",
      direction: "inbound",
      created_at: "2026-11-25T09:00:00.000Z",
    },
  ]

  it("agrupa por phoneKey y ordena por el mensaje más reciente", () => {
    const summaries = buildConversationSummaries(rows, new Set(), new Map(), now)
    expect(summaries).toHaveLength(2)
    expect(summaries[0]?.key).toBe("6141261296")
    expect(summaries[0]?.lastText).toBe("Cuesta $32 MXN")
    expect(summaries[0]?.lastAuthor).toBe("ia")
    expect(summaries[1]?.key).toBe("6145550000")
  })

  it("marca quién espera respuesta y la ventana", () => {
    const summaries = buildConversationSummaries(rows, new Set(), new Map(), now)
    const answered = summaries.find((s) => s.key === "6141261296")
    const waiting = summaries.find((s) => s.key === "6145550000")
    expect(answered?.needsReply).toBe(false)
    expect(answered?.windowOpen).toBe(true)
    expect(waiting?.needsReply).toBe(true)
  })

  it("refleja la pausa y el nombre del perfil", () => {
    const summaries = buildConversationSummaries(
      rows,
      new Set(["6145550000"]),
      new Map([["6145550000", "María López"]]),
      now
    )
    const paused = summaries.find((s) => s.key === "6145550000")
    expect(paused?.botPaused).toBe(true)
    expect(paused?.name).toBe("María López")
    expect(summaries.find((s) => s.key === "6141261296")?.botPaused).toBe(false)
  })
})
