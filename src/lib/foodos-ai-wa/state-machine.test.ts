import { describe, it, expect } from "vitest"
import {
  advance,
  detectFulfillment,
  detectIntent,
  draftSubtotal,
  matchItems,
  normalize,
  parseQuantity,
  NEW_SESSION,
  EMPTY_DRAFT,
  type MeseroMenu,
  type MeseroSession,
  type MeseroTurnInput,
} from "./state-machine"

const MENU: MeseroMenu = {
  restaurantName: "Taquería El Buen Pastor",
  orderLink: "https://resurte.me/r/el-buen-pastor",
  currency: "$",
  items: [
    { id: "i1", name: "Tacos al pastor", price: 45, isAvailable: true, categoryName: "Tacos" },
    { id: "i2", name: "Tacos de suadero", price: 48, isAvailable: true, categoryName: "Tacos" },
    { id: "i3", name: "Quesadilla de queso", price: 60, isAvailable: true, categoryName: "Antojitos" },
    { id: "i4", name: "Agua de horchata", price: 35, isAvailable: true, categoryName: "Bebidas" },
    { id: "i5", name: "Flan napolitano", price: 50, isAvailable: false, categoryName: "Postres" },
  ],
}

const CONFIG = { maxItems: 20, handoffEnabled: true }

function turn(text: string, session: MeseroSession = NEW_SESSION, overrides: Partial<MeseroTurnInput> = {}) {
  return advance({ session, text, menu: MENU, config: CONFIG, ...overrides })
}

/** Encadena turnos como lo haría una conversación real. */
function converse(texts: string[], session: MeseroSession = NEW_SESSION) {
  let current = session
  const turns = []
  for (const text of texts) {
    const t = turn(text, current)
    turns.push(t)
    current = { state: t.state, draft: t.draft, pendingQuestion: t.pendingQuestion }
  }
  return { session: current, turns, last: turns[turns.length - 1]! }
}

describe("normalize", () => {
  it("quita acentos, mayúsculas y signos", () => {
    expect(normalize("  ¡Menú, SÍ!  ")).toBe("menu si")
  })

  it("colapsa espacios", () => {
    expect(normalize("dos    tacos")).toBe("dos tacos")
  })
})

describe("parseQuantity", () => {
  it("acepta dígitos", () => {
    expect(parseQuantity("3")).toBe(3)
  })

  it("acepta palabras en español", () => {
    expect(parseQuantity("dos")).toBe(2)
    expect(parseQuantity("diez")).toBe(10)
  })

  it("ignora el cero y lo no numérico", () => {
    expect(parseQuantity("0")).toBeNull()
    expect(parseQuantity("pastor")).toBeNull()
    expect(parseQuantity("")).toBeNull()
  })
})

describe("matchItems", () => {
  it("encuentra por nombre completo", () => {
    const [first] = matchItems("quiero tacos al pastor", MENU)
    expect(first?.item.id).toBe("i1")
  })

  it("encuentra por palabra significativa", () => {
    const [first] = matchItems("una quesadilla", MENU)
    expect(first?.item.id).toBe("i3")
  })

  it("lee la cantidad del dígito anterior", () => {
    const [first] = matchItems("3 tacos al pastor", MENU)
    expect(first?.qty).toBe(3)
  })

  it("lee la cantidad de la palabra anterior", () => {
    const [first] = matchItems("dos tacos al pastor", MENU)
    expect(first?.qty).toBe(2)
  })

  it("acepta el formato x3", () => {
    const [first] = matchItems("tacos al pastor x3", MENU)
    expect(first?.qty).toBe(3)
  })

  it("asume 1 cuando no hay cantidad", () => {
    const [first] = matchItems("tacos al pastor", MENU)
    expect(first?.qty).toBe(1)
  })

  it("prefiere el nombre más largo en empate", () => {
    const ids = matchItems("tacos al pastor y tacos de suadero", MENU).map((m) => m.item.id)
    expect(ids).toContain("i1")
    expect(ids).toContain("i2")
  })

  it("ignora platillos agotados", () => {
    expect(matchItems("flan napolitano", MENU)).toHaveLength(0)
  })

  it("no inventa coincidencias con texto genérico", () => {
    expect(matchItems("hola buenas tardes", MENU)).toHaveLength(0)
  })
})

describe("detectFulfillment", () => {
  it("reconoce domicilio", () => {
    expect(detectFulfillment("a domicilio por favor")).toBe("delivery")
  })

  it("reconoce recoger", () => {
    expect(detectFulfillment("paso por él")).toBe("pickup")
  })

  it("reconoce comer en el local", () => {
    expect(detectFulfillment("para comer aqui")).toBe("dine_in")
  })

  it("devuelve null si no dice nada", () => {
    expect(detectFulfillment("dos tacos")).toBeNull()
  })
})

describe("detectIntent", () => {
  it("prioriza el handoff sobre el resto", () => {
    expect(detectIntent("quiero hablar con una persona", MENU)).toBe("handoff")
  })

  it("detecta queja como handoff", () => {
    expect(detectIntent("quiero poner una queja", MENU)).toBe("handoff")
  })

  it("detecta cancelar", () => {
    expect(detectIntent("mejor no, cancelar", MENU)).toBe("cancel")
  })

  it("detecta pedir el menú", () => {
    expect(detectIntent("me muestras el menu", MENU)).toBe("menu")
  })

  it("un pedido con 'para llevar' sigue siendo un pedido", () => {
    expect(detectIntent("2 tacos al pastor para llevar", MENU)).toBe("add_items")
  })

  it("una modalidad sin platillos es fulfillment", () => {
    expect(detectIntent("a domicilio", MENU)).toBe("fulfillment")
  })

  it("detecta quitar", () => {
    expect(detectIntent("quita los tacos al pastor", MENU)).toBe("remove_items")
  })

  it("detecta confirmar", () => {
    expect(detectIntent("si", MENU)).toBe("confirm")
    expect(detectIntent("listo", MENU)).toBe("confirm")
  })

  it("no confunde 'vamos' con la confirmación 'va'", () => {
    expect(detectIntent("vamos a ver", MENU)).not.toBe("confirm")
  })

  it("detecta negar", () => {
    expect(detectIntent("no", MENU)).toBe("deny")
  })
})

describe("advance — flujo feliz a domicilio", () => {
  const { turns, session } = converse([
    "hola",
    "menu",
    "2 tacos al pastor",
    "a domicilio",
    "Av. Reforma 123, Centro",
    "Ana López",
    "si",
  ])

  it("arranca en greeting", () => {
    expect(NEW_SESSION.state).toBe("greeting")
  })

  it("'hola' no rompe: cae al fallback con el enlace de pedido", () => {
    expect(turns[0]!.state).toBe("greeting")
    expect(turns[0]!.reply).toContain(MENU.orderLink)
  })

  it("'menu' lista los platillos disponibles y no los agotados", () => {
    expect(turns[1]!.reply).toContain("Tacos al pastor")
    expect(turns[1]!.reply).not.toContain("Flan napolitano")
  })

  it("agregar platillos deja el estado en browsing", () => {
    expect(turns[2]!.state).toBe("browsing")
    expect(turns[2]!.draft.items).toHaveLength(1)
    expect(turns[2]!.draft.items[0]).toMatchObject({ item_id: "i1", qty: 2, price: 45 })
  })

  it("las respuestas con dinero NO son reescribibles por el LLM", () => {
    expect(turns[2]!.rephraseable).toBe(false)
  })

  it("pide la modalidad después de tener platillos", () => {
    expect(turns[3]!.state).toBe("collecting_address")
    expect(turns[3]!.pendingQuestion).toBe("ask_address")
  })

  it("guarda la dirección y pide el nombre", () => {
    expect(turns[4]!.draft.address).toBe("Av. Reforma 123, Centro")
    expect(turns[4]!.pendingQuestion).toBe("ask_name")
  })

  it("el resumen incluye los datos de entrega y el subtotal", () => {
    expect(turns[5]!.state).toBe("confirming")
    expect(turns[5]!.reply).toContain("Ana López")
    expect(turns[5]!.reply).toContain("Av. Reforma 123, Centro")
    expect(turns[5]!.reply).toContain("$90.00")
    expect(turns[5]!.rephraseable).toBe(false)
  })

  it("confirmar pide crear el pedido y cierra la sesión", () => {
    expect(turns[6]!.action).toBe("create_order")
    expect(turns[6]!.state).toBe("done")
    expect(session.state).toBe("done")
  })

  it("el subtotal informativo es el de la máquina (no decide el cobro)", () => {
    expect(draftSubtotal(turns[6]!.draft)).toBe(90)
  })
})

describe("advance — recoger no pide dirección", () => {
  it("va directo al nombre", () => {
    const { turns } = converse(["2 tacos al pastor", "para recoger"])
    expect(turns[1]!.state).toBe("collecting_name")
    expect(turns[1]!.pendingQuestion).toBe("ask_name")
  })
})

describe("advance — comer en el local", () => {
  it("no pide dirección", () => {
    const { turns } = converse(["1 quesadilla de queso", "comer aqui"])
    expect(turns[1]!.pendingQuestion).toBe("ask_name")
  })
})

describe("advance — acumulación y corrección", () => {
  it("acumula cantidades del mismo platillo", () => {
    const { turns } = converse(["2 tacos al pastor", "1 tacos al pastor"])
    expect(turns[1]!.draft.items).toHaveLength(1)
    expect(turns[1]!.draft.items[0]!.qty).toBe(3)
  })

  it("suma platillos distintos", () => {
    const { turns } = converse(["2 tacos al pastor", "1 agua de horchata"])
    expect(turns[1]!.draft.items).toHaveLength(2)
    expect(draftSubtotal(turns[1]!.draft)).toBe(125)
  })

  it("quitar reduce la cantidad", () => {
    const { turns } = converse(["3 tacos al pastor", "quita 1 tacos al pastor"])
    expect(turns[1]!.draft.items[0]!.qty).toBe(2)
  })

  it("quitar por completo elimina la línea", () => {
    const { turns } = converse(["1 tacos al pastor", "quita los tacos al pastor"])
    expect(turns[1]!.draft.items).toHaveLength(0)
    expect(turns[1]!.reply).toContain("vacío")
  })

  it("quitar algo que no está no rompe", () => {
    const { turns } = converse(["1 tacos al pastor", "quita el agua de horchata"])
    expect(turns[1]!.draft.items).toHaveLength(1)
    expect(turns[1]!.reply).toContain("No encontré")
  })

  it("cancelar vacía el carrito y reinicia", () => {
    const { turns } = converse(["2 tacos al pastor", "cancelar"])
    expect(turns[1]!.draft.items).toHaveLength(0)
    expect(turns[1]!.state).toBe("browsing")
  })
})

describe("advance — cerrar el pedido con 'listo'", () => {
  it("'listo' con platillos pasa a pedir la modalidad", () => {
    const { turns } = converse(["2 tacos al pastor", "listo"])
    expect(turns[1]!.state).toBe("choosing_fulfillment")
    expect(turns[1]!.pendingQuestion).toBe("ask_fulfillment")
  })

  it("'listo' sin platillos no confirma nada", () => {
    const { turns } = converse(["listo"])
    expect(turns[0]!.action).toBe("none")
    expect(turns[0]!.draft.items).toHaveLength(0)
  })
})

describe("advance — negar en la confirmación", () => {
  it("vuelve a browsing sin perder el carrito", () => {
    const { turns } = converse([
      "2 tacos al pastor",
      "a domicilio",
      "Calle 1",
      "Ana",
      "no",
    ])
    expect(turns[4]!.state).toBe("browsing")
    expect(turns[4]!.draft.items).toHaveLength(1)
    expect(turns[4]!.draft.name).toBe("Ana")
  })
})

describe("advance — handoff humano", () => {
  it("pide handoff y deja la sesión en manos del humano", () => {
    const t = turn("quiero hablar con una persona")
    expect(t.action).toBe("handoff")
    expect(t.state).toBe("handoff")
    expect(t.pendingQuestion).toBeNull()
  })

  it("en handoff la IA se queda callada", () => {
    const t = turn("2 tacos al pastor", {
      state: "handoff",
      draft: EMPTY_DRAFT,
      pendingQuestion: null,
    })
    expect(t.reply).toBe("")
    expect(t.action).toBe("none")
    expect(t.state).toBe("handoff")
  })

  it("con handoff desactivado no deriva, pero tampoco se queda muda", () => {
    const t = turn("quiero hablar con una persona", NEW_SESSION, {
      config: { maxItems: 20, handoffEnabled: false },
    })
    expect(t.action).toBe("none")
    expect(t.reply).toContain(MENU.orderLink)
  })
})

describe("advance — tope de platillos", () => {
  it("respeta maxItems y lo explica", () => {
    const { turns } = converse(["2 tacos al pastor", "1 agua de horchata"], NEW_SESSION)
    expect(turns[1]!.draft.items).toHaveLength(2)

    const capped = advance({
      session: { state: "browsing", draft: turns[1]!.draft, pendingQuestion: "ask_intent" },
      text: "1 quesadilla de queso",
      menu: MENU,
      config: { maxItems: 2, handoffEnabled: true },
    })
    expect(capped.draft.items).toHaveLength(2)
    expect(capped.reply).toContain("máximo")
  })

  it("seguir pidiendo un platillo ya agregado no cuenta contra el tope", () => {
    const capped = advance({
      session: {
        state: "browsing",
        draft: {
          ...EMPTY_DRAFT,
          items: [
            { item_id: "i1", name: "Tacos al pastor", price: 45, qty: 1, modifiers: [] },
            { item_id: "i4", name: "Agua de horchata", price: 35, qty: 1, modifiers: [] },
          ],
        },
        pendingQuestion: "ask_intent",
      },
      text: "2 tacos al pastor",
      menu: MENU,
      config: { maxItems: 2, handoffEnabled: true },
    })
    expect(capped.draft.items[0]!.qty).toBe(3)
  })
})

describe("advance — robustez", () => {
  it("no cambia de estado con texto vacío", () => {
    const t = turn("")
    expect(t.state).toBe("greeting")
    expect(t.action).toBe("none")
  })

  it("es determinista", () => {
    const a = turn("2 tacos al pastor")
    const b = turn("2 tacos al pastor")
    expect(a.reply).toBe(b.reply)
    expect(a.draft).toEqual(b.draft)
  })

  it("no muta la sesión de entrada", () => {
    const session: MeseroSession = { state: "browsing", draft: EMPTY_DRAFT, pendingQuestion: "ask_intent" }
    const snapshot = JSON.stringify(session)
    turn("2 tacos al pastor", session)
    expect(JSON.stringify(session)).toBe(snapshot)
  })

  it("interpreta un nombre libre cuando pregunta el nombre", () => {
    const t = turn("María Fernanda Ruiz", {
      state: "collecting_name",
      draft: { ...EMPTY_DRAFT, items: [{ item_id: "i1", name: "Tacos al pastor", price: 45, qty: 1 }], fulfillment: "pickup" },
      pendingQuestion: "ask_name",
    })
    expect(t.draft.name).toBe("María Fernanda Ruiz")
    expect(t.state).toBe("confirming")
  })

  it("interpreta la dirección libre cuando pregunta la dirección", () => {
    const t = turn("Calle Juárez 45, Col. Centro, CP 06000", {
      state: "collecting_address",
      draft: {
        ...EMPTY_DRAFT,
        items: [{ item_id: "i1", name: "Tacos al pastor", price: 45, qty: 1 }],
        fulfillment: "delivery",
      },
      pendingQuestion: "ask_address",
    })
    expect(t.draft.address).toBe("Calle Juárez 45, Col. Centro, CP 06000")
    expect(t.pendingQuestion).toBe("ask_name")
  })

  it("un platillo que no existe no agrega nada", () => {
    const t = turn("quiero una pizza hawaiana")
    expect(t.draft.items).toHaveLength(0)
  })

  it("después de crear el pedido, un mensaje nuevo no vuelve a crear", () => {
    const t = turn("gracias", { state: "done", draft: EMPTY_DRAFT, pendingQuestion: null })
    expect(t.action).toBe("none")
  })
})
