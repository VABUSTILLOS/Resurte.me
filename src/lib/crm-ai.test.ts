import { describe, expect, it } from "vitest"
import {
  MAX_EVENT_CHARS,
  MAX_REPLY_CONTEXT_CHARS,
  MAX_REPLY_CONTEXT_EVENTS,
  MAX_REPLY_DRAFT_CHARS,
  buildFallbackReply,
  buildReplyPromptContext,
  buildReplySystemPrompt,
  maskEmail,
  maskPhone,
  redactFreeText,
  sanitizeReplyDraft,
  type ReplyEvent,
  type ReplyProspectInput,
} from "./crm-ai"

const NOW = new Date("2026-03-10T18:00:00.000Z")

function prospect(overrides: Partial<ReplyProspectInput> = {}): ReplyProspectInput {
  return {
    name: "Ana Ruiz",
    restaurantName: "Taquería El Fogón",
    status: "contactado",
    tags: ["vip"],
    phone: "525512345678",
    email: "ana.ruiz@elfogon.mx",
    ...overrides,
  }
}

function events(...items: Array<[ReplyEvent["kind"], string, string]>): ReplyEvent[] {
  return items.map(([kind, at, text]) => ({ kind, at, text }))
}

const OPTIONS = { windowOpen: true, bucket: "sin_responder" as const, now: NOW }

describe("redacción de PII", () => {
  it("deja el teléfono en dos dígitos", () => {
    expect(maskPhone("+52 55 1234 5678")).toBe("••••••78")
  })

  it("no inventa un teléfono cuando no hay dígitos suficientes", () => {
    expect(maskPhone("sin teléfono")).toBeNull()
    expect(maskPhone("12")).toBeNull()
    expect(maskPhone(null)).toBeNull()
    expect(maskPhone("")).toBeNull()
  })

  it("conserva el dominio del correo y tapa la parte local", () => {
    expect(maskEmail("ana.ruiz@elfogon.mx")).toBe("a•••@elfogon.mx")
    expect(maskEmail("  x@y.io ")).toBe("x•••@y.io")
  })

  it("degrada a puntos suspensivos si el correo no tiene forma de correo", () => {
    expect(maskEmail("no-es-un-correo")).toBe("•••")
    expect(maskEmail("@solo-arroba")).toBe("•••")
    expect(maskEmail(null)).toBeNull()
  })

  it("tapa teléfonos y correos dentro de texto libre", () => {
    const redacted = redactFreeText("Márcame al 55 1234 5678 o a ana@elfogon.mx")
    expect(redacted).not.toContain("5678")
    expect(redacted).not.toContain("1234")
    expect(redacted).toContain("••••••78")
    expect(redacted).toContain("a•••@elfogon.mx")
  })

  it("no toca cifras cortas como precios o cantidades", () => {
    expect(redactFreeText("Son 250 pesos por 3 cajas")).toBe("Son 250 pesos por 3 cajas")
  })
})

describe("buildReplyPromptContext", () => {
  it("nunca imprime el teléfono ni el correo completos", () => {
    const ctx = buildReplyPromptContext(
      prospect(),
      events(["inbound", "2026-03-10T17:00:00.000Z", "Hola, ¿me pasas precios?"]),
      OPTIONS,
    )
    expect(ctx.text).not.toContain("525512345678")
    expect(ctx.text).not.toContain("ana.ruiz@")
    expect(ctx.text).toContain("••••••78")
    expect(ctx.text).toContain("a•••@elfogon.mx")
  })

  it("redacta el texto que el cliente escribió", () => {
    const ctx = buildReplyPromptContext(
      prospect(),
      events(["inbound", "2026-03-10T17:00:00.000Z", "Mi cel es 5512345678, escríbeme"]),
      OPTIONS,
    )
    expect(ctx.text).not.toContain("5512345678")
    expect(ctx.text).toContain("••••••78")
  })

  it("marca que toca responder cuando el último mensaje es del cliente", () => {
    const ctx = buildReplyPromptContext(
      prospect(),
      events(
        ["outbound", "2026-03-10T10:00:00.000Z", "Te mando la lista"],
        ["inbound", "2026-03-10T17:00:00.000Z", "Va, gracias"],
      ),
      OPTIONS,
    )
    expect(ctx.signals.needsReply).toBe(true)
    expect(ctx.signals.waitingHours).toBe(1)
  })

  it("no marca pendiente cuando el último mensaje es nuestro", () => {
    const ctx = buildReplyPromptContext(
      prospect(),
      events(
        ["inbound", "2026-03-10T10:00:00.000Z", "¿Precios?"],
        ["outbound", "2026-03-10T11:00:00.000Z", "Te los mando"],
      ),
      OPTIONS,
    )
    expect(ctx.signals.needsReply).toBe(false)
    // La espera se mide sobre el último entrante, no sobre el último evento.
    expect(ctx.signals.waitingHours).toBe(8)
  })

  it("sin mensajes entrantes la espera es null, no cero", () => {
    const ctx = buildReplyPromptContext(
      prospect(),
      events(["outbound", "2026-03-10T10:00:00.000Z", "Hola"]),
      OPTIONS,
    )
    expect(ctx.signals.waitingHours).toBeNull()
    expect(ctx.text).toContain("No hay mensajes entrantes registrados")
  })

  it("sin eventos lo dice explícitamente en vez de dejar el bloque vacío", () => {
    const ctx = buildReplyPromptContext(prospect(), [], OPTIONS)
    expect(ctx.text).toContain("(sin mensajes todavía)")
    expect(ctx.events).toBe(0)
    expect(ctx.truncated).toBe(false)
  })

  it("ordena los eventos del más viejo al más nuevo aunque lleguen al revés", () => {
    const ctx = buildReplyPromptContext(
      prospect(),
      events(
        ["inbound", "2026-03-10T17:00:00.000Z", "SEGUNDO"],
        ["outbound", "2026-03-10T10:00:00.000Z", "PRIMERO"],
      ),
      OPTIONS,
    )
    expect(ctx.text.indexOf("PRIMERO")).toBeLessThan(ctx.text.indexOf("SEGUNDO"))
  })

  it("recorta por número de eventos y lo declara", () => {
    const many = Array.from({ length: MAX_REPLY_CONTEXT_EVENTS + 5 }, (_, i) => ({
      kind: "inbound" as const,
      at: new Date(NOW.getTime() - (30 - i) * 60_000).toISOString(),
      text: `mensaje ${i}`,
    }))
    const ctx = buildReplyPromptContext(prospect(), many, OPTIONS)
    expect(ctx.events).toBe(MAX_REPLY_CONTEXT_EVENTS)
    expect(ctx.truncated).toBe(true)
    // Se conservan los recientes: el último mensaje siempre entra.
    expect(ctx.text).toContain(`mensaje ${MAX_REPLY_CONTEXT_EVENTS + 4}`)
    expect(ctx.text).not.toContain("mensaje 0")
  })

  it("recorta eventos larguísimos a un solo renglón acotado", () => {
    const ctx = buildReplyPromptContext(
      prospect(),
      events(["inbound", "2026-03-10T17:00:00.000Z", "a".repeat(5_000)]),
      OPTIONS,
    )
    expect(ctx.text).toContain("a".repeat(MAX_EVENT_CHARS))
    expect(ctx.text).not.toContain("a".repeat(MAX_EVENT_CHARS + 1))
  })

  it("respeta el presupuesto total de caracteres", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      kind: "inbound" as const,
      at: new Date(NOW.getTime() - (60 - i) * 60_000).toISOString(),
      text: "b".repeat(MAX_EVENT_CHARS),
    }))
    const ctx = buildReplyPromptContext(prospect(), many, OPTIONS)
    expect(ctx.text.length).toBeLessThanOrEqual(MAX_REPLY_CONTEXT_CHARS + 400)
    expect(ctx.truncated).toBe(true)
  })

  it("declara el estado de la ventana de 24 h", () => {
    const open = buildReplyPromptContext(prospect(), [], OPTIONS)
    expect(open.text).toContain("texto libre")
    const closed = buildReplyPromptContext(prospect(), [], { ...OPTIONS, windowOpen: false })
    expect(closed.text).toContain("plantilla aprobada")
  })

  it("colapsa los espacios de un mensaje multilínea", () => {
    const ctx = buildReplyPromptContext(
      prospect(),
      events(["inbound", "2026-03-10T17:00:00.000Z", "Hola\n\n   ¿precios?   "]),
      OPTIONS,
    )
    expect(ctx.text).toContain("Cliente: Hola ¿precios?")
  })

  it("omite las etiquetas vacías y marca la falta de vendedor", () => {
    const ctx = buildReplyPromptContext(
      prospect({ tags: ["", "  ", "mayoreo"], sellerName: null }),
      [],
      OPTIONS,
    )
    expect(ctx.text).toContain("Etiquetas: mayoreo")
    expect(ctx.text).toContain("Sin vendedor asignado")
  })

  it("no muta la lista de eventos que recibe", () => {
    const input = events(
      ["inbound", "2026-03-10T17:00:00.000Z", "b"],
      ["outbound", "2026-03-10T10:00:00.000Z", "a"],
    )
    const snapshot = input.map((e) => e.text)
    buildReplyPromptContext(prospect(), input, OPTIONS)
    expect(input.map((e) => e.text)).toEqual(snapshot)
  })
})

describe("buildReplySystemPrompt", () => {
  it("prohíbe inventar datos y prometer cosas", () => {
    const prompt = buildReplySystemPrompt()
    expect(prompt).toContain("No inventes precios")
    expect(prompt).toContain("No prometas")
    expect(prompt).toContain("Español de México")
  })
})

describe("buildFallbackReply", () => {
  const signals = {
    needsReply: true,
    waitingHours: 1,
    windowOpen: true,
    bucket: "sin_responder" as const,
    followUpScheduled: false,
  }

  it("arma un mensaje usable sin IA", () => {
    const draft = buildFallbackReply(prospect(), signals)
    expect(draft).toContain("Hola Ana")
    expect(draft).toContain("El Fogón")
    expect(draft.endsWith("?")).toBe(true)
  })

  it("no incluye teléfonos ni correos", () => {
    const draft = buildFallbackReply(prospect(), signals)
    expect(draft).not.toContain("525512345678")
    expect(draft).not.toContain("elfogon.mx")
  })

  it("menciona el seguimiento cuando ya hay uno agendado", () => {
    const draft = buildFallbackReply(prospect(), { ...signals, followUpScheduled: true })
    expect(draft).toContain("seguimiento")
  })

  it("cambia de tono cuando el cliente no ha contestado", () => {
    const draft = buildFallbackReply(prospect(), { ...signals, needsReply: false })
    expect(draft).toContain("¿Seguimos con lo de Taquería El Fogón?")
  })

  it("funciona sin nombre, sin negocio y sin vendedor", () => {
    const draft = buildFallbackReply(
      { name: "  ", status: "nuevo" },
      { ...signals, needsReply: false },
    )
    expect(draft).toContain("Hola buenas")
    expect(draft).toContain("el equipo")
    expect(draft).toContain("¿Seguimos con lo que platicamos?")
  })
})

describe("sanitizeReplyDraft", () => {
  it("quita comillas y encabezados de envoltura", () => {
    expect(sanitizeReplyDraft('Borrador: "Hola Ana, te mando precios."')).toBe(
      "Hola Ana, te mando precios.",
    )
    expect(sanitizeReplyDraft("«Hola»")).toBe("Hola")
  })

  it("acota el largo", () => {
    const clean = sanitizeReplyDraft("x".repeat(MAX_REPLY_DRAFT_CHARS + 500))
    expect(clean).toHaveLength(MAX_REPLY_DRAFT_CHARS)
  })

  it("devuelve null cuando no queda nada utilizable", () => {
    expect(sanitizeReplyDraft("")).toBeNull()
    expect(sanitizeReplyDraft("   ")).toBeNull()
    expect(sanitizeReplyDraft('""')).toBeNull()
  })
})
