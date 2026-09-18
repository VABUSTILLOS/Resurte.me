import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { FoodosOrderStatus, FoodosPaymentStatus } from "@/types/foodos"
import {
  FOODOS_CANCEL_REFUSAL_MESSAGE,
  FOODOS_CHARGED_PAYMENT_STATUSES,
  FOODOS_CUSTOMER_CANCELLABLE_STATUSES,
  FOODOS_OWNER_TRANSITIONS,
  FOODOS_TERMINAL_ORDER_STATUSES,
  canFoodosCustomerCancel,
  foodosCustomerCancelRefusal,
  isTerminalFoodosStatus,
  ownerTransitionAllowed,
  ownerTransitionErrorMessage,
} from "./foodos-order-status"

/**
 * Máquina de estados del pedido FoodOS.
 *
 * Dos cosas se prueban aquí, y la segunda importa más que la primera:
 *
 *  1. La tabla de transiciones hace lo que dice: no retrocede, no resucita un
 *     pedido cancelado, y deja pasar los saltos hacia adelante que la cocina
 *     ya usa.
 *  2. **La tabla cubre el tipo, no una copia.** `FoodosOrderStatus` vive en
 *     `src/types/foodos.ts`; la tabla vive aquí. Si alguien añade un estado al
 *     tipo y no a la tabla, `FOODOS_OWNER_TRANSITIONS[estado]` queda
 *     `undefined` y `ownerTransitionAllowed` revienta con un TypeError en
 *     producción, en el panel del dueño. El primer `describe` lo impide.
 *
 * Y el último `describe` comprueba que la máquina **no es decorativa**: que el
 * punto que escribe el estado la consulte de verdad. Una máquina de estados
 * que nadie llama es exactamente la función que existe por existir.
 */

const REPO = process.cwd()
const TIPOS = readFileSync(join(REPO, "src/types/foodos.ts"), "utf8")
const ACCIONES = readFileSync(join(REPO, "src/app/panel/foodos/actions.ts"), "utf8")

/** Extrae los literales de una unión de `src/types/foodos.ts`. */
function unionDe(nombre: string): string[] {
  const bloque = TIPOS.match(new RegExp(`export type ${nombre} =([\\s\\S]*?)\\n\\n`))
  if (!bloque) throw new Error(`no se encontró el tipo ${nombre} en src/types/foodos.ts`)
  return [...bloque[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)
}

/** Orden de avance del pedido. `cancelled` es la salida lateral, no un paso. */
const ORDEN: readonly FoodosOrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
]

const TODOS = Object.keys(FOODOS_OWNER_TRANSITIONS) as FoodosOrderStatus[]

describe("foodos-order-status · la tabla cubre el tipo, no una copia", () => {
  it("el extractor de uniones sigue leyendo el tipo (control positivo)", () => {
    // Sin esto, los dos tests de abajo pasarían comparando dos listas vacías.
    expect(unionDe("FoodosOrderStatus")).toHaveLength(6)
    expect(unionDe("FoodosPaymentStatus")).toHaveLength(7)
  })

  it("la tabla tiene exactamente los estados de FoodosOrderStatus", () => {
    expect([...TODOS].sort()).toEqual([...unionDe("FoodosOrderStatus")].sort())
  })

  it("todos los destinos declarados son estados válidos del tipo", () => {
    const validos = new Set(unionDe("FoodosOrderStatus"))
    const destinos = TODOS.flatMap((from) => [...FOODOS_OWNER_TRANSITIONS[from]])
    expect(destinos.length).toBeGreaterThan(0)
    for (const destino of destinos) {
      expect(validos.has(destino)).toBe(true)
    }
  })

  it("los terminales son exactamente los estados sin salida", () => {
    const sinSalida = TODOS.filter((s) => FOODOS_OWNER_TRANSITIONS[s].length === 0)
    expect([...sinSalida].sort()).toEqual([...FOODOS_TERMINAL_ORDER_STATUSES].sort())
  })

  it("cada estado no terminal puede llegar a `cancelled`", () => {
    // Si un estado vivo no pudiera cancelarse, el panel ofrecería "Cancelar"
    // y la máquina lo rechazaría: un botón que miente.
    for (const estado of TODOS) {
      if (isTerminalFoodosStatus(estado)) continue
      expect(FOODOS_OWNER_TRANSITIONS[estado]).toContain("cancelled")
    }
  })

  it("ninguna arista declarada retrocede", () => {
    for (const from of TODOS) {
      for (const to of FOODOS_OWNER_TRANSITIONS[from]) {
        if (to === "cancelled") continue
        const i = ORDEN.indexOf(from)
        const j = ORDEN.indexOf(to)
        expect(i, `${from} no está en el orden de avance`).toBeGreaterThanOrEqual(0)
        expect(j, `${to} no está en el orden de avance`).toBeGreaterThan(i)
      }
    }
  })
})

describe("foodos-order-status · transiciones del dueño", () => {
  it("no cambiar de estado siempre es legal", () => {
    for (const estado of TODOS) {
      expect(ownerTransitionAllowed(estado, estado)).toBe(true)
    }
  })

  it("las aristas declaradas son legales", () => {
    for (const from of TODOS) {
      for (const to of FOODOS_OWNER_TRANSITIONS[from]) {
        expect(ownerTransitionAllowed(from, to)).toBe(true)
      }
    }
  })

  it("retroceder no es legal", () => {
    const retrocesos: Array<[FoodosOrderStatus, FoodosOrderStatus]> = [
      ["confirmed", "pending"],
      ["preparing", "confirmed"],
      ["out_for_delivery", "preparing"],
      ["delivered", "preparing"],
    ]
    for (const [from, to] of retrocesos) {
      expect(ownerTransitionAllowed(from, to)).toBe(false)
    }
  })

  it("un pedido entregado no se mueve a ningún lado", () => {
    for (const to of TODOS) {
      if (to === "delivered") continue
      expect(ownerTransitionAllowed("delivered", to)).toBe(false)
    }
  })

  it("un pedido cancelado no resucita", () => {
    for (const to of TODOS) {
      if (to === "cancelled") continue
      expect(ownerTransitionAllowed("cancelled", to)).toBe(false)
    }
  })

  it("el salto que la cocina usa (preparing → delivered) sí es legal", () => {
    // Cocina cierra sin pasar por reparto cuando el pedido es para recoger.
    // Está declarado porque el panel ya lo ofrece.
    expect(ownerTransitionAllowed("preparing", "delivered")).toBe(true)
  })

  it("un salto que nadie ofrece no es legal: la tabla es lista blanca", () => {
    // `pending` sólo declara `confirmed` y `cancelled`. No es un descuido: si
    // la tabla aceptara cualquier avance, aceptaría también el que un día
    // alguien escriba por error.
    expect(ownerTransitionAllowed("pending", "preparing")).toBe(false)
    expect(ownerTransitionAllowed("pending", "delivered")).toBe(false)
  })

  it("isTerminalFoodosStatus coincide con la tabla", () => {
    for (const estado of TODOS) {
      expect(isTerminalFoodosStatus(estado)).toBe(
        FOODOS_OWNER_TRANSITIONS[estado].length === 0
      )
    }
  })

  it("el mensaje terminal distingue cancelado de entregado", () => {
    const cancelado = ownerTransitionErrorMessage("cancelled", "preparing")
    const entregado = ownerTransitionErrorMessage("delivered", "preparing")
    expect(cancelado).not.toBe(entregado)
    expect(cancelado).toMatch(/cancelado/i)
    expect(entregado).toMatch(/entreg/i)
    // El de entregado tiene que ofrecer una salida, no sólo negar.
    expect(entregado).toMatch(/incidencia/i)
  })

  it("el mensaje genérico nombra el origen y el destino", () => {
    const msg = ownerTransitionErrorMessage("pending", "preparing")
    expect(msg).toContain("pending")
    expect(msg).toContain("preparing")
    expect(msg).toMatch(/orden/i)
  })

  it("ningún mensaje queda vacío", () => {
    for (const from of TODOS) {
      for (const to of TODOS) {
        expect(ownerTransitionErrorMessage(from, to).length).toBeGreaterThan(10)
      }
    }
  })
})

describe("foodos-order-status · cancelación por el comensal", () => {
  it("sólo `pending` se cancela solo", () => {
    expect([...FOODOS_CUSTOMER_CANCELLABLE_STATUSES]).toEqual(["pending"])
  })

  it("un pedido pendiente sin pago cobrado sí se cancela", () => {
    expect(foodosCustomerCancelRefusal("pending", "pending")).toBeNull()
    expect(foodosCustomerCancelRefusal("pending", "failed")).toBeNull()
    expect(foodosCustomerCancelRefusal("pending", "expired")).toBeNull()
    expect(foodosCustomerCancelRefusal("pending", null)).toBeNull()
  })

  it("`already_cancelled` gana sobre `charged`", () => {
    // Un pedido cancelado y cobrado se explica como cancelado: decirle
    // "tienes un pago registrado" a quien ya vio la cancelación confunde.
    expect(foodosCustomerCancelRefusal("cancelled", "paid")).toBe("already_cancelled")
  })

  it("un pedido empezado se explica como `started`, no como `charged`", () => {
    for (const estado of ["confirmed", "preparing", "out_for_delivery", "delivered"] as const) {
      expect(foodosCustomerCancelRefusal(estado, "paid")).toBe("started")
      expect(foodosCustomerCancelRefusal(estado, "pending")).toBe("started")
    }
  })

  it("un estado nulo o desconocido se explica como `started`", () => {
    expect(foodosCustomerCancelRefusal(null, "pending")).toBe("started")
    expect(foodosCustomerCancelRefusal(undefined, "pending")).toBe("started")
    // Un estado que el módulo no conoce NO habilita el botón: se falla cerrado.
    expect(foodosCustomerCancelRefusal("zzz" as FoodosOrderStatus, "pending")).toBe("started")
  })

  it("cada estado de pago cobrado bloquea un pedido pendiente", () => {
    expect([...FOODOS_CHARGED_PAYMENT_STATUSES].sort()).toEqual(
      ["amount_mismatch", "paid", "processing", "refunded"].sort()
    )
    for (const pago of FOODOS_CHARGED_PAYMENT_STATUSES) {
      expect(foodosCustomerCancelRefusal("pending", pago)).toBe("charged")
    }
  })

  it("los estados de pago declarados existen en FoodosPaymentStatus", () => {
    const validos = new Set(unionDe("FoodosPaymentStatus"))
    expect(FOODOS_CHARGED_PAYMENT_STATUSES.length).toBeGreaterThan(0)
    for (const pago of FOODOS_CHARGED_PAYMENT_STATUSES) {
      expect(validos.has(pago), `${pago} no está en FoodosPaymentStatus`).toBe(true)
    }
  })

  it("canFoodosCustomerCancel coincide con el motivo", () => {
    const casos: Array<[FoodosOrderStatus | null, FoodosPaymentStatus | null]> = [
      ["pending", "pending"],
      ["pending", "paid"],
      ["cancelled", null],
      ["confirmed", "pending"],
      ["delivered", null],
      [null, null],
    ]
    for (const [estado, pago] of casos) {
      expect(canFoodosCustomerCancel(estado, pago)).toBe(
        foodosCustomerCancelRefusal(estado, pago) === null
      )
    }
  })

  it("cada motivo tiene un mensaje que dice qué hacer", () => {
    const motivos = ["already_cancelled", "started", "charged"] as const
    for (const motivo of motivos) {
      const msg = FOODOS_CANCEL_REFUSAL_MESSAGE[motivo]
      expect(msg.length).toBeGreaterThan(20)
      expect(msg).toMatch(/[a-záéíóúñ]/i)
    }
    // El de cobrado tiene que mandar al cliente con el restaurante, no dejarlo
    // sin salida.
    expect(FOODOS_CANCEL_REFUSAL_MESSAGE.charged).toMatch(/ll[aá]mal|escr[ií]b/i)
    expect(FOODOS_CANCEL_REFUSAL_MESSAGE.started).toMatch(/ll[aá]mal|escr[ií]b/i)
  })
})

describe("foodos-order-status · la máquina no es decorativa", () => {
  it("updateOrderStatus la consulta antes de escribir", () => {
    const iConsulta = ACCIONES.indexOf("ownerTransitionAllowed(currentStatus, status)")
    const iEscritura = ACCIONES.indexOf('.from("foodos_orders")', iConsulta)
    expect(iConsulta, "updateOrderStatus ya no consulta la máquina").toBeGreaterThan(-1)
    expect(iEscritura, "la escritura ya no ocurre después de la consulta").toBeGreaterThan(
      iConsulta
    )
  })

  it("el rechazo se le explica al dueño con el mensaje del módulo", () => {
    expect(ACCIONES).toContain("ownerTransitionErrorMessage(currentStatus, status)")
  })

  it("la acción importa el módulo en vez de reimplementar la tabla", () => {
    expect(ACCIONES).toContain('from "@/lib/foodos-order-status"')
    // Una segunda copia de la tabla es el defecto que este módulo existe para
    // evitar: las dos divergen en el primer arreglo.
    expect(ACCIONES).not.toMatch(/FOODOS_OWNER_TRANSITIONS\s*[:=]/)
  })

  it("la ruta de cancelación del comensal consulta el mismo módulo", () => {
    const ruta = readFileSync(
      join(REPO, "src/app/api/foodos/orders/[id]/cancel/route.ts"),
      "utf8"
    )
    expect(ruta).toContain('from "@/lib/foodos-order-status"')
    expect(ruta).toContain("foodosCustomerCancelRefusal(")
    expect(ruta).not.toMatch(/FOODOS_CUSTOMER_CANCELLABLE_STATUSES\s*[:=]/)
  })
})
