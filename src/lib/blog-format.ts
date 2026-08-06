// Helpers de formato sin dependencias de Node — importables desde componentes client.

const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
]
const MONTHS_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

/**
 * Formatea una fecha "YYYY-MM-DD" de forma determinista.
 * Evita new Date().toLocaleDateString(), que produce texto distinto entre
 * servidor (UTC) y cliente (zona local) y rompe la hidratación de React.
 */
export function formatPostDate(dateStr: string, style: "short" | "long" = "short"): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return dateStr
  const [, y, m, d] = match
  const monthIndex = Number(m) - 1
  const day = String(Number(d))
  if (monthIndex < 0 || monthIndex > 11) return dateStr
  if (style === "long") {
    return `${day} de ${MONTHS_LONG[monthIndex]} de ${y}`
  }
  return `${day} ${MONTHS_SHORT[monthIndex]} ${y}`
}
