import { describe, it, expect } from "vitest"
import {
  WHATSAPP_WINDOW_HOURS,
  INBOX_BUCKETS,
  INBOX_BUCKET_LABEL,
  QUICK_REPLY_VARIABLES,
  QUICK_REPLY_TITLE_MAX,
  QUICK_REPLY_BODY_MAX,
  activeQuickReplies,
  quickReplyDraftError,
  normalizeDirection,
  mergeTimeline,
  lastMessage,
  lastInboundAt,
  whatsappWindowState,
  canSendFreeForm,
  requiresTemplate,
  needsReply,
  firstResponseMinutes,
  isInboxBucket,
  inboxBucket,
  inboxDayKey,
  quickReplyVariables,
  renderQuickReply,
  unresolvedQuickReplyVariables,
  quickReplyValuesFor,
  sequenceDedupeKey,
  nextSequenceRun,
  isSequenceStepDue,
  prospectPhoneKey,
  phoneLookupVariants,
  indexMessagesByPhone,
  buildThread,
  buildThreads,
  type ConversationProspect,
  type InboxMessage,
} from "./crm-inbox"
import { crmProspect } from "./crm-fixtures"

const NOW = new Date("2026-03-10T18:00:00.000Z")

/** Un mensaje con lo mínimo, para no repetir el objeto completo en cada caso. */
function msg(
  overrides: Partial<InboxMessage> & Pick<InboxMessage, "created_at" | "direction">,
): InboxMessage {
  return {
    id: 1,
    content: "hola",
    message_type: null,
    from_number: "+52 614 123 4567",
    ...overrides,
  }
}

function prospect(overrides: Partial<ConversationProspect> = {}): ConversationProspect {
  return crmProspect({
    id: 7,
    name: "Ana",
    restaurant_name: "Taquería Ana",
    phone: "6141234567",
    whatsapp: "+52 614 123 4567",
    created_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  })
}

describe("normalizeDirection", () => {
  it("respeta el enum de la columna", () => {
    expect(normalizeDirection("inbound")).toBe("inbound")
    expect(normalizeDirection("outbound")).toBe("outbound")
  })

  it("un valor corrupto se trata como entrante", () => {
    // Conservador a propósito: un entrante exige respuesta, un saliente no.
    expect(normalizeDirection(null)).toBe("inbound")
    expect(normalizeDirection(undefined)).toBe("inbound")
    expect(normalizeDirection("cualquier-cosa")).toBe("inbound")
  })
})

describe("mergeTimeline", () => {
  it("ordena de más antiguo a más reciente", () => {
    const timeline = mergeTimeline([
      msg({ id: 2, direction: "outbound", created_at: "2026-03-10T12:00:00.000Z" }),
      msg({ id: 1, direction: "inbound", created_at: "2026-03-10T10:00:00.000Z" }),
    ])
    expect(timeline.map((m) => m.id)).toEqual([1, 2])
  })

  it("no muta el arreglo original", () => {
    const original = [
      msg({ id: 2, direction: "outbound", created_at: "2026-03-10T12:00:00.000Z" }),
      msg({ id: 1, direction: "inbound", created_at: "2026-03-10T10:00:00.000Z" }),
    ]
    mergeTimeline(original)
    expect(original.map((m) => m.id)).toEqual([2, 1])
  })

  it("los empates conservan el orden de entrada", () => {
    const same = "2026-03-10T12:00:00.000Z"
    const timeline = mergeTimeline([
      msg({ id: 1, direction: "inbound", created_at: same }),
      msg({ id: 2, direction: "outbound", created_at: same }),
    ])
    expect(timeline.map((m) => m.id)).toEqual([1, 2])
  })
})

describe("lastMessage / lastInboundAt", () => {
  it("sin mensajes no hay último", () => {
    expect(lastMessage([])).toBeNull()
    expect(lastInboundAt([])).toBeNull()
  })

  it("el último mensaje puede ser nuestro", () => {
    const last = lastMessage([
      msg({ id: 1, direction: "inbound", created_at: "2026-03-10T10:00:00.000Z" }),
      msg({ id: 2, direction: "outbound", created_at: "2026-03-10T11:00:00.000Z" }),
    ])
    expect(last?.id).toBe(2)
  })

  it("el último entrante ignora los salientes posteriores", () => {
    // Es el que abre la ventana de 24 h: contestar no la reinicia.
    const at = lastInboundAt([
      msg({ id: 1, direction: "inbound", created_at: "2026-03-10T10:00:00.000Z" }),
      msg({ id: 2, direction: "outbound", created_at: "2026-03-10T11:00:00.000Z" }),
      msg({ id: 3, direction: "outbound", created_at: "2026-03-10T12:00:00.000Z" }),
    ])
    expect(at).toBe("2026-03-10T10:00:00.000Z")
  })
})

describe("whatsappWindowState", () => {
  it("abierta justo después del mensaje del cliente", () => {
    const state = whatsappWindowState([msg({ direction: "inbound", created_at: NOW.toISOString() })], NOW)
    expect(state.open).toBe(true)
    expect(state.hoursLeft).toBeCloseTo(WHATSAPP_WINDOW_HOURS, 5)
  })

  it("abierta 23 h después", () => {
    const state = whatsappWindowState(
      [msg({ direction: "inbound", created_at: "2026-03-09T19:00:00.000Z" })],
      NOW,
    )
    expect(state.open).toBe(true)
    expect(state.hoursLeft).toBeCloseTo(1, 5)
  })

  it("cerrada pasadas 24 h", () => {
    const state = whatsappWindowState(
      [msg({ direction: "inbound", created_at: "2026-03-09T17:59:00.000Z" })],
      NOW,
    )
    expect(state.open).toBe(false)
    expect(state.hoursLeft).toBe(0)
    expect(state.expiresAt).not.toBeNull()
  })

  it("nunca reporta horas negativas", () => {
    const state = whatsappWindowState(
      [msg({ direction: "inbound", created_at: "2026-01-01T00:00:00.000Z" })],
      NOW,
    )
    expect(state.hoursLeft).toBe(0)
  })

  it("sin ningún entrante la ventana no existe, no está vencida", () => {
    const state = whatsappWindowState([], NOW)
    expect(state).toEqual({ open: false, expiresAt: null, hoursLeft: null })
  })

  it("solo salientes tampoco abren ventana", () => {
    const state = whatsappWindowState(
      [msg({ direction: "outbound", created_at: NOW.toISOString() })],
      NOW,
    )
    expect(state.open).toBe(false)
    expect(state.expiresAt).toBeNull()
    expect(state.hoursLeft).toBeNull()
  })

  it("acepta la fecha del último entrante ya calculada", () => {
    expect(whatsappWindowState("2026-03-10T17:00:00.000Z", NOW).open).toBe(true)
    expect(whatsappWindowState(null, NOW).open).toBe(false)
  })

  it("una fecha inválida no abre la ventana", () => {
    expect(whatsappWindowState("no-es-fecha", NOW)).toEqual({
      open: false,
      expiresAt: null,
      hoursLeft: null,
    })
  })

  it("canSendFreeForm y requiresTemplate son complementarios", () => {
    const abierta = whatsappWindowState([msg({ direction: "inbound", created_at: NOW.toISOString() })], NOW)
    const cerrada = whatsappWindowState([], NOW)
    expect(canSendFreeForm(abierta)).toBe(true)
    expect(requiresTemplate(abierta)).toBe(false)
    expect(canSendFreeForm(cerrada)).toBe(false)
    expect(requiresTemplate(cerrada)).toBe(true)
  })
})

describe("needsReply", () => {
  it("el cliente habló al final: hay que contestar", () => {
    expect(
      needsReply([
        msg({ id: 1, direction: "outbound", created_at: "2026-03-10T10:00:00.000Z" }),
        msg({ id: 2, direction: "inbound", created_at: "2026-03-10T11:00:00.000Z" }),
      ]),
    ).toBe(true)
  })

  it("contestamos al final: esperamos al cliente", () => {
    expect(
      needsReply([
        msg({ id: 1, direction: "inbound", created_at: "2026-03-10T10:00:00.000Z" }),
        msg({ id: 2, direction: "outbound", created_at: "2026-03-10T11:00:00.000Z" }),
      ]),
    ).toBe(false)
  })

  it("sin conversación no hay nada que contestar", () => {
    expect(needsReply([])).toBe(false)
  })
})

describe("firstResponseMinutes", () => {
  it("mide hasta nuestra primera respuesta posterior", () => {
    expect(
      firstResponseMinutes([
        msg({ id: 1, direction: "inbound", created_at: "2026-03-10T10:00:00.000Z" }),
        msg({ id: 2, direction: "outbound", created_at: "2026-03-10T10:12:00.000Z" }),
      ]),
    ).toBe(12)
  })

  it("ignora un saliente ANTERIOR al primer entrante", () => {
    // Ese mensaje no es respuesta de nada: abrimos la conversación nosotros.
    expect(
      firstResponseMinutes([
        msg({ id: 1, direction: "outbound", created_at: "2026-03-10T09:00:00.000Z" }),
        msg({ id: 2, direction: "inbound", created_at: "2026-03-10T10:00:00.000Z" }),
        msg({ id: 3, direction: "outbound", created_at: "2026-03-10T10:30:00.000Z" }),
      ]),
    ).toBe(30)
  })

  it("null cuando el cliente nunca escribió", () => {
    expect(
      firstResponseMinutes([
        msg({ direction: "outbound", created_at: "2026-03-10T10:00:00.000Z" }),
      ]),
    ).toBeNull()
    expect(firstResponseMinutes([])).toBeNull()
  })

  it("null cuando todavía no contestamos (no es 0)", () => {
    expect(
      firstResponseMinutes([msg({ direction: "inbound", created_at: "2026-03-10T10:00:00.000Z" })]),
    ).toBeNull()
  })

  it("nunca negativo", () => {
    const minutes = firstResponseMinutes([
      msg({ id: 1, direction: "inbound", created_at: "2026-03-10T10:00:00.000Z" }),
      msg({ id: 2, direction: "outbound", created_at: "2026-03-10T09:00:00.000Z" }),
      msg({ id: 3, direction: "outbound", created_at: "2026-03-10T10:05:00.000Z" }),
    ])
    expect(minutes).toBe(5)
  })
})

describe("inboxBucket", () => {
  it("sin mensajes no pertenece a ninguna bandeja", () => {
    expect(inboxBucket([], NOW)).toBeNull()
  })

  it("cliente al final: sin responder", () => {
    expect(
      inboxBucket(
        [msg({ direction: "inbound", created_at: "2026-03-10T17:00:00.000Z" })],
        NOW,
      ),
    ).toBe("sin_responder")
  })

  it("nosotros al final y ventana abierta: esperando", () => {
    expect(
      inboxBucket(
        [
          msg({ id: 1, direction: "inbound", created_at: "2026-03-10T17:00:00.000Z" }),
          msg({ id: 2, direction: "outbound", created_at: "2026-03-10T17:30:00.000Z" }),
        ],
        NOW,
      ),
    ).toBe("esperando")
  })

  it("ventana vencida sin nada pendiente: ventana cerrada", () => {
    expect(
      inboxBucket(
        [
          msg({ id: 1, direction: "inbound", created_at: "2026-03-08T10:00:00.000Z" }),
          msg({ id: 2, direction: "outbound", created_at: "2026-03-08T11:00:00.000Z" }),
        ],
        NOW,
      ),
    ).toBe("ventana_cerrada")
  })

  it("un pendiente manda sobre la ventana cerrada", () => {
    // Sigue siendo accionable (con plantilla); esconderlo perdería el aviso.
    expect(
      inboxBucket([msg({ direction: "inbound", created_at: "2026-03-01T10:00:00.000Z" })], NOW),
    ).toBe("sin_responder")
  })

  it("solo salientes: ventana cerrada", () => {
    expect(
      inboxBucket([msg({ direction: "outbound", created_at: "2026-03-10T17:00:00.000Z" })], NOW),
    ).toBe("ventana_cerrada")
  })

  it("cada bandeja tiene etiqueta en español y valida su clave", () => {
    for (const bucket of INBOX_BUCKETS) {
      expect(INBOX_BUCKET_LABEL[bucket].length).toBeGreaterThan(0)
      expect(isInboxBucket(bucket)).toBe(true)
    }
    expect(isInboxBucket("bandeja")).toBe(false)
  })
})

describe("inboxDayKey", () => {
  it("usa el día local del restaurante, no UTC", () => {
    // 2026-03-11T04:00Z es todavía 10 de marzo en CDMX (UTC-6).
    expect(inboxDayKey("2026-03-11T04:00:00.000Z")).toBe("2026-03-10")
  })

  it("acepta un Date", () => {
    expect(inboxDayKey(new Date("2026-03-10T18:00:00.000Z"))).toBe("2026-03-10")
  })
})

describe("respuestas rápidas", () => {
  it("lista las variables sin repetir y en orden", () => {
    expect(quickReplyVariables("Hola {{nombre}}, {{restaurante}} de {{ nombre }}")).toEqual([
      "nombre",
      "restaurante",
    ])
  })

  it("sin variables devuelve vacío", () => {
    expect(quickReplyVariables("Hola, ¿cómo va todo?")).toEqual([])
  })

  it("tolera espacios dentro de las llaves", () => {
    expect(renderQuickReply("Hola {{ nombre }}", { nombre: "Ana" })).toBe("Hola Ana")
  })

  it("rellena todas las variables conocidas", () => {
    const out = renderQuickReply(
      "{{nombre}} de {{restaurante}}: te habla {{vendedor}} al {{telefono}}",
      { nombre: "Ana", restaurante: "Taquería Ana", vendedor: "Luis", telefono: "6141234567" },
    )
    expect(out).toBe("Ana de Taquería Ana: te habla Luis al 6141234567")
  })

  it("una variable desconocida se queda LITERAL", () => {
    // Mandar "Hola , te escribo" es peor que mostrar el hueco: al menos se ve el
    // error de datos.
    expect(renderQuickReply("Hola {{apodo}}", { nombre: "Ana" })).toBe("Hola {{apodo}}")
  })

  it("una variable vacía o en blanco se queda literal", () => {
    expect(renderQuickReply("Hola {{nombre}}", { nombre: "" })).toBe("Hola {{nombre}}")
    expect(renderQuickReply("Hola {{nombre}}", { nombre: "   " })).toBe("Hola {{nombre}}")
    expect(renderQuickReply("Hola {{nombre}}", {})).toBe("Hola {{nombre}}")
    expect(renderQuickReply("Hola {{nombre}}", { nombre: null })).toBe("Hola {{nombre}}")
  })

  it("recorta el valor que sí viene", () => {
    expect(renderQuickReply("Hola {{nombre}}", { nombre: "  Ana  " })).toBe("Hola Ana")
  })

  it("un texto sin variables pasa intacto", () => {
    expect(renderQuickReply("¿Te mando el catálogo?", {})).toBe("¿Te mando el catálogo?")
  })

  it("reporta qué quedó sin rellenar", () => {
    expect(unresolvedQuickReplyVariables("Hola {{nombre}} de {{restaurante}}", { nombre: "Ana" })).toEqual([
      "restaurante",
    ])
    expect(
      unresolvedQuickReplyVariables("Hola {{nombre}}", { nombre: "Ana" }),
    ).toEqual([])
  })

  it("deriva los valores del prospecto, con WhatsApp antes que teléfono", () => {
    expect(quickReplyValuesFor(prospect(), "Luis")).toEqual({
      nombre: "Ana",
      restaurante: "Taquería Ana",
      telefono: "+52 614 123 4567",
      vendedor: "Luis",
    })
    expect(quickReplyValuesFor(prospect({ whatsapp: null })).telefono).toBe("6141234567")
  })

  it("las variables documentadas son las que el panel sabe rellenar", () => {
    expect([...QUICK_REPLY_VARIABLES]).toEqual(["nombre", "restaurante", "vendedor", "telefono"])
  })
})

describe("secuencias", () => {
  it("la clave incluye el paso: la misma secuencia envía varias veces", () => {
    expect(sequenceDedupeKey(3, 7, 1)).toBe("crm_sequence:3:7:1")
    expect(sequenceDedupeKey(3, 7, 1)).not.toBe(sequenceDedupeKey(3, 7, 2))
  })

  it("la clave distingue destinatario y secuencia", () => {
    expect(sequenceDedupeKey(3, 7, 1)).not.toBe(sequenceDedupeKey(3, 8, 1))
    expect(sequenceDedupeKey(3, 7, 1)).not.toBe(sequenceDedupeKey(4, 7, 1))
  })

  it("programa el siguiente paso contando las horas de espera", () => {
    expect(nextSequenceRun("2026-03-10T10:00:00.000Z", 24)).toBe("2026-03-11T10:00:00.000Z")
    expect(nextSequenceRun("2026-03-10T10:00:00.000Z", 0)).toBe("2026-03-10T10:00:00.000Z")
  })

  it("una espera inválida o negativa se trata como cero", () => {
    expect(nextSequenceRun("2026-03-10T10:00:00.000Z", -5)).toBe("2026-03-10T10:00:00.000Z")
    expect(nextSequenceRun("2026-03-10T10:00:00.000Z", Number.NaN)).toBe("2026-03-10T10:00:00.000Z")
  })

  it("vence cuando ya pasó la hora programada", () => {
    expect(isSequenceStepDue("2026-03-10T17:00:00.000Z", NOW)).toBe(true)
    expect(isSequenceStepDue("2026-03-10T19:00:00.000Z", NOW)).toBe(false)
    expect(isSequenceStepDue("2026-03-10T18:00:00.000Z", NOW)).toBe(true)
  })

  it("sin fecha programada no vence nunca", () => {
    // Una inscripción pausada no debe dispararse por accidente.
    expect(isSequenceStepDue(null, NOW)).toBe(false)
    expect(isSequenceStepDue(undefined, NOW)).toBe(false)
    expect(isSequenceStepDue("no-es-fecha", NOW)).toBe(false)
  })
})

describe("prospectPhoneKey", () => {
  it("prefiere WhatsApp y cae al teléfono", () => {
    expect(prospectPhoneKey(prospect())).toBe("6141234567")
    expect(prospectPhoneKey(prospect({ whatsapp: null }))).toBe("6141234567")
  })

  it("normaliza formatos distintos al mismo número", () => {
    const formas = ["+52 614 123 4567", "52 1 6141234567", "6141234567", "(614) 123-4567"]
    const claves = new Set(formas.map((f) => prospectPhoneKey(prospect({ whatsapp: f }))))
    expect([...claves]).toEqual(["6141234567"])
  })

  it("sin teléfono no hay clave", () => {
    expect(prospectPhoneKey(prospect({ whatsapp: null, phone: null }))).toBeNull()
    expect(prospectPhoneKey(prospect({ whatsapp: "sin número", phone: null }))).toBeNull()
  })
})

describe("phoneLookupVariants", () => {
  it("cubre las variantes con lada de país", () => {
    expect(phoneLookupVariants("+52 614 123 4567")).toEqual([
      "6141234567",
      "526141234567",
      "5216141234567",
    ])
  })

  it("acepta el teléfono alterno del prospecto", () => {
    expect(phoneLookupVariants("52 1 6141234567")).toContain("6141234567")
  })

  it("sin dígitos no hay nada que buscar", () => {
    expect(phoneLookupVariants(null)).toEqual([])
    expect(phoneLookupVariants("N/A")).toEqual([])
    expect(phoneLookupVariants("")).toEqual([])
  })
})

describe("indexMessagesByPhone", () => {
  it("agrupa por la misma clave que el prospecto", () => {
    const index = indexMessagesByPhone([
      msg({ id: 1, direction: "inbound", created_at: "2026-03-10T10:00:00.000Z" }),
      msg({
        id: 2,
        direction: "outbound",
        created_at: "2026-03-10T11:00:00.000Z",
        from_number: "526141234567",
      }),
      msg({
        id: 3,
        direction: "inbound",
        created_at: "2026-03-10T12:00:00.000Z",
        from_number: "+52 644 999 8888",
      }),
    ])
    expect([...index.keys()].sort()).toEqual(["6141234567", "6449998888"])
    expect(index.get("6141234567")?.map((m) => m.id)).toEqual([1, 2])
  })

  it("descarta los mensajes sin dígitos", () => {
    // broadcast escribe "system" y un workflow escribe "N/A": son logs, no
    // conversación.
    const index = indexMessagesByPhone([
      msg({ id: 1, direction: "outbound", created_at: "2026-03-10T10:00:00.000Z", from_number: "system" }),
      msg({ id: 2, direction: "outbound", created_at: "2026-03-10T10:00:00.000Z", from_number: "N/A" }),
      msg({ id: 3, direction: "outbound", created_at: "2026-03-10T10:00:00.000Z", from_number: null }),
    ])
    expect(index.size).toBe(0)
  })
})

describe("buildThread", () => {
  it("adjunta la conversación del prospecto", () => {
    const messages = [
      msg({ id: 1, direction: "inbound", created_at: "2026-03-10T17:00:00.000Z", content: "¿precio?" }),
    ]
    const thread = buildThread(prospect(), indexMessagesByPhone(messages), NOW)
    expect(thread.phoneKey).toBe("6141234567")
    expect(thread.messages.map((m) => m.id)).toEqual([1])
    expect(thread.bucket).toBe("sin_responder")
    expect(thread.last?.content).toBe("¿precio?")
    expect(thread.window.open).toBe(true)
  })

  it("sin coincidencias devuelve un hilo vacío, no inventado", () => {
    const thread = buildThread(
      prospect({ whatsapp: "+52 644 000 0000", phone: null }),
      indexMessagesByPhone([msg({ direction: "inbound", created_at: NOW.toISOString() })]),
      NOW,
    )
    expect(thread.messages).toEqual([])
    expect(thread.bucket).toBeNull()
    expect(thread.last).toBeNull()
    expect(thread.window.open).toBe(false)
  })

  it("un prospecto sin teléfono no puede tener conversación", () => {
    const thread = buildThread(
      prospect({ whatsapp: null, phone: null }),
      indexMessagesByPhone([msg({ direction: "inbound", created_at: NOW.toISOString() })]),
      NOW,
    )
    expect(thread.phoneKey).toBeNull()
    expect(thread.messages).toEqual([])
  })

  it("dos prospectos con el mismo teléfono ven la misma conversación", () => {
    const messages = [msg({ direction: "inbound", created_at: "2026-03-10T17:00:00.000Z" })]
    const [a, b] = buildThreads(
      [prospect({ id: 1 }), prospect({ id: 2, name: "Sucursal" })],
      messages,
      NOW,
    )
    expect(a?.messages).toHaveLength(1)
    expect(b?.messages).toHaveLength(1)
  })

  it("buildThreads conserva el orden de los prospectos recibidos", () => {
    const threads = buildThreads(
      [prospect({ id: 5 }), prospect({ id: 2 })],
      [msg({ direction: "inbound", created_at: NOW.toISOString() })],
      NOW,
    )
    expect(threads.map((t) => t.prospect.id)).toEqual([5, 2])
  })
})

describe("gestor de respuestas rápidas", () => {
  it("filtra las apagadas: es lo que hacía que el interruptor no hiciera nada", () => {
    const replies = [
      { id: 1, isActive: true },
      { id: 2, isActive: false },
      { id: 3, isActive: true },
    ]
    expect(activeQuickReplies(replies).map((r) => r.id)).toEqual([1, 3])
  })

  it("no reordena ni muta la lista original", () => {
    const replies = [
      { id: 3, isActive: false },
      { id: 1, isActive: true },
    ]
    expect(activeQuickReplies(replies).map((r) => r.id)).toEqual([1])
    expect(replies.map((r) => r.id)).toEqual([3, 1])
  })

  it("una lista vacía o toda apagada devuelve vacío, no undefined", () => {
    expect(activeQuickReplies([])).toEqual([])
    expect(activeQuickReplies([{ id: 1, isActive: false }])).toEqual([])
  })

  it("el borrador vacío pide título", () => {
    expect(quickReplyDraftError({ title: "", body: "Hola" })).toBe("El título es obligatorio")
    expect(quickReplyDraftError({ title: "   ", body: "Hola" })).toBe("El título es obligatorio")
  })

  it("un título de solo espacios no pasa", () => {
    expect(quickReplyDraftError({ title: " x ", body: "Hola" })).toBeNull()
  })

  it("el cuerpo vacío pide texto", () => {
    expect(quickReplyDraftError({ title: "Saludo", body: "   " })).toBe("El texto es obligatorio")
  })

  it("los topes son exactos: justo en el límite pasa, uno más no", () => {
    const title = "a".repeat(QUICK_REPLY_TITLE_MAX)
    const body = "b".repeat(QUICK_REPLY_BODY_MAX)
    expect(quickReplyDraftError({ title, body })).toBeNull()
    expect(quickReplyDraftError({ title: `${title}a`, body })).toBe(
      `El título no puede pasar de ${QUICK_REPLY_TITLE_MAX} caracteres`,
    )
    expect(quickReplyDraftError({ title, body: `${body}b` })).toBe(
      `El texto no puede pasar de ${QUICK_REPLY_BODY_MAX} caracteres`,
    )
  })

  it("el largo se mide sobre el texto recortado", () => {
    const title = `${" ".repeat(10)}${"a".repeat(QUICK_REPLY_TITLE_MAX)}${" ".repeat(10)}`
    expect(quickReplyDraftError({ title, body: "Hola" })).toBeNull()
  })
})
