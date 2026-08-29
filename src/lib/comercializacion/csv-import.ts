import type { BulkProspectRow } from "./actions"

export interface ParsedCsvRow extends BulkProspectRow {
  rowNumber: number
  errors: string[]
}

export function parseCsv(text: string): ParsedCsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const rows = lines.map((line) => line.split(",").map((c) => c.trim()))
  // Detectar encabezado si la primera celda dice "nombre"
  if (rows.length > 0 && rows[0]?.[0]?.toLowerCase() === "nombre") rows.shift()

  return rows.map((cells, idx) => {
    const [name = "", restaurant = "", phone = "", whatsapp = "", email = "", city = "", ...notesParts] = cells
    const errors: string[] = []
    if (!name) errors.push("Falta el nombre")
    if (phone) {
      const digits = phone.replace(/\D/g, "")
      if (digits.length < 8 || digits.length > 15) errors.push("Teléfono inválido")
    }
    if (whatsapp) {
      const digits = whatsapp.replace(/\D/g, "")
      if (digits.length < 8 || digits.length > 15) errors.push("WhatsApp inválido")
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Email inválido")
    return {
      rowNumber: idx + 1,
      name,
      restaurant_name: restaurant || null,
      phone: phone || null,
      whatsapp: whatsapp || null,
      email: email || null,
      city_name: city || null,
      notes: notesParts.join(", ").trim() || null,
      errors,
    }
  })
}
