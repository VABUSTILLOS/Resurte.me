/**
 * API pública de impresión FoodOS.
 *
 * Se exporta **sólo lo que los consumidores importan de verdad** — hoy el
 * ticket de pantalla (`ticket-view.tsx`) y la página imprimible
 * (`print/page.tsx`). El resto de `./tickets`, `./printers` y `./types` se
 * importa directamente desde sus módulos, así que reexportarlo aquí sólo
 * agrandaba la superficie sin que nadie la usara (knip lo reportaba como
 * export muerto del barrel).
 *
 * Si necesitas un símbolo nuevo, impórtalo del submódulo correspondiente; no
 * lo añadas aquí "por comodidad": eso fue justo lo que convirtió este archivo
 * en una API sobredimensionada.
 */
export type { TicketDocument, TicketKind, TicketPayment } from "./types"

export { buildTicket, formatTicketDate } from "./tickets"
