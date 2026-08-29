/**
 * Utilidades para exportar CSV desde el cliente (navegador).
 */

function escapeCsvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCsvCell).join(",")]
  for (const row of rows) lines.push(row.map(escapeCsvCell).join(","))
  // BOM para que Excel abra UTF-8 con acentos correctos
  return "\uFEFF" + lines.join("\r\n")
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
