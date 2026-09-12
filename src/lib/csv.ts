/**
 * Utilidad mínima para exportar CSV en cliente (admin, recompensas).
 * Sin dependencias: escapa comillas/comas/saltos y antepone BOM para que
 * Excel respete UTF-8 (acentos, "Créditos", etc.).
 */

export type CsvCell = string | number | null | undefined

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return ""
  const s = String(cell)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: CsvCell[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(escapeCell).join(","))
  return lines.join("\r\n")
}

/** Dispara la descarga de un CSV en el navegador (solo cliente). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
