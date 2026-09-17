// ============================================================
// Registro de impresoras.
//
// El POS y el comandero piden `printTicket(...)` y no saben si detrás hay un
// diálogo del navegador o una térmica. Hoy sólo el navegador está
// implementado; ESC/POS está declarado para que la UI pueda mostrarlo como
// "próximamente" sin mentirle a nadie.
// ============================================================

import type {
  PrintOutcome,
  TicketContext,
  TicketDocument,
  TicketKind,
  TicketOrderInput,
  TicketPrinter,
  TicketPrinterId,
} from "./types"
import { buildTicket, printPathFor } from "./tickets"

function browserPath(doc: TicketDocument, orderId: string): string {
  return printPathFor(doc.kind, orderId, true)
}

/**
 * Impresión por el diálogo del sistema. No hace falta driver ni permiso de
 * Bluetooth: el navegador manda el ticket a la impresora predeterminada.
 * Como contrapartida necesita una ventana abierta.
 */
const browserPrinter: TicketPrinter = {
  id: "browser",
  label: "Impresora del sistema",
  implemented: true,
  requiresBrowser: true,
  printPath: browserPath,
  async print(doc, orderId) {
    if (typeof window === "undefined") {
      return {
        ok: false,
        printer: "browser",
        reason:
          "Este adaptador necesita una ventana del navegador; llama a print() desde el cliente.",
      }
    }

    const opened = window.open(browserPath(doc, orderId), "_blank", "noopener")
    if (!opened) {
      return {
        ok: false,
        printer: "browser",
        reason: "El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes.",
      }
    }

    return { ok: true, printer: "browser", via: "browser-dialog" }
  },
}

/**
 * Térmica ESC/POS por Bluetooth o USB (Web Serial / Web Bluetooth).
 * Declarado, todavía no implementado: responde que no en vez de simular éxito.
 */
const escposPrinter: TicketPrinter = {
  id: "escpos",
  label: "Térmica Bluetooth / USB",
  implemented: false,
  requiresBrowser: false,
  printPath: () => null,
  async print() {
    return {
      ok: false,
      printer: "escpos",
      reason:
        "La impresión directa ESC/POS todavía no está lista. Por ahora imprime desde el navegador.",
    }
  },
}

export const PRINTERS: Record<TicketPrinterId, TicketPrinter> = {
  browser: browserPrinter,
  escpos: escposPrinter,
}

export const DEFAULT_PRINTER_ID: TicketPrinterId = "browser"

/** Resuelve un id de impresora; cualquier cosa rara cae a la predeterminada. */
export function getPrinter(id?: string | null): TicketPrinter {
  if (id && id in PRINTERS) return PRINTERS[id as TicketPrinterId]
  return PRINTERS[DEFAULT_PRINTER_ID]
}

/** Sólo las que pueden imprimir hoy. */
export function availablePrinters(): TicketPrinter[] {
  return Object.values(PRINTERS).filter((printer) => printer.implemented)
}

/** Todas, incluidas las declaradas, para pintarlas deshabilitadas en la UI. */
export function printerOptions(): { id: TicketPrinterId; label: string; implemented: boolean }[] {
  return Object.values(PRINTERS).map((printer) => ({
    id: printer.id,
    label: printer.label,
    implemented: printer.implemented,
  }))
}

/** Arma el ticket y lo manda a la impresora elegida. */
export async function printTicket(
  kind: TicketKind,
  order: TicketOrderInput,
  ctx: TicketContext,
  printerId?: string | null,
): Promise<PrintOutcome> {
  const printer = getPrinter(printerId)
  return printer.print(buildTicket(kind, order, ctx), order.id)
}
