import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_PRINTER_ID,
  PRINTERS,
  availablePrinters,
  getPrinter,
  printTicket,
  printerOptions,
} from "./printers"
import { buildCustomerTicket } from "./tickets"
import type { TicketDocument } from "./types"
import { order, CTX } from "./test-helpers"

const doc: TicketDocument = buildCustomerTicket(order(), CTX)

/** `window` no existe en el entorno de pruebas: se simula sólo lo que se usa. */
function stubWindow(open: (url: string, target: string, features: string) => unknown) {
  ;(globalThis as { window?: unknown }).window = { open }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe("getPrinter", () => {
  it("cae a la predeterminada cuando no se pide nada", () => {
    expect(getPrinter().id).toBe(DEFAULT_PRINTER_ID)
  })

  it("cae a la predeterminada con un id desconocido", () => {
    expect(getPrinter("impresora-del-futuro").id).toBe(DEFAULT_PRINTER_ID)
  })

  it("resuelve escpos por id", () => {
    expect(getPrinter("escpos").id).toBe("escpos")
  })
})

describe("catálogo de impresoras", () => {
  it("sólo ofrece como disponibles las implementadas", () => {
    expect(availablePrinters().map((printer) => printer.id)).toEqual(["browser"])
  })

  it("lista las declaradas para pintarlas deshabilitadas", () => {
    const options = printerOptions()
    expect(options).toHaveLength(2)
    expect(options.find((option) => option.id === "escpos")).toMatchObject({
      implemented: false,
      label: "Térmica Bluetooth / USB",
    })
  })

  it("marca browser como implementada", () => {
    expect(PRINTERS.browser.implemented).toBe(true)
  })
})

describe("impresora del navegador", () => {
  it("avisa en vez de fingir cuando no hay ventana", async () => {
    const outcome = await PRINTERS.browser.print(doc, "abc")
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toContain("ventana")
  })

  it("abre la ruta de impresión con auto-print", async () => {
    const open = vi.fn(() => ({}))
    stubWindow(open)

    const outcome = await PRINTERS.browser.print(doc, "abc")

    expect(outcome).toEqual({ ok: true, printer: "browser", via: "browser-dialog" })
    expect(open).toHaveBeenCalledWith(
      "/panel/foodos/pedidos/abc/print?kind=customer&auto=1",
      "_blank",
      "noopener",
    )
  })

  it("reporta el bloqueo de ventanas emergentes", async () => {
    stubWindow(() => null)

    const outcome = await PRINTERS.browser.print(doc, "abc")

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toContain("ventanas emergentes")
  })
})

describe("impresora ESC/POS", () => {
  it("responde que no está implementada en vez de simular éxito", async () => {
    const outcome = await PRINTERS.escpos.print(doc, "abc")
    expect(outcome).toEqual({
      ok: false,
      printer: "escpos",
      reason:
        "La impresión directa ESC/POS todavía no está lista. Por ahora imprime desde el navegador.",
    })
  })

  it("no expone ruta de impresión", () => {
    expect(PRINTERS.escpos.printPath(doc, "abc")).toBeNull()
  })
})

describe("printTicket", () => {
  it("manda el ticket a la impresora pedida", async () => {
    stubWindow(() => ({}))
    const outcome = await printTicket("customer", order(), CTX)
    expect(outcome.ok).toBe(true)
  })

  it("propaga el fallo de la impresora elegida", async () => {
    const outcome = await printTicket("customer", order(), CTX, "escpos")
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.printer).toBe("escpos")
  })
})
