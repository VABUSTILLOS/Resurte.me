"use client"

import { useMemo, useState } from "react"
import { Modal, Button, Spinner, Badge } from "./ui"
import { useToast } from "@/components/toast"
import { bulkCreateProspects, type BulkProspectRow } from "@/lib/comercializacion/actions"

const EXAMPLE = `nombre,restaurante,telefono,whatsapp,email,ciudad,notas
Ana López,Tacos El Norte,5512345678,5512345678,ana@tacos.mx,Ciudad de México,Interesada en tortillas`

interface ParsedRow extends BulkProspectRow {
  rowNumber: number
  errors: string[]
}

function parseCsv(text: string): ParsedRow[] {
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

export function ImportCsvModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const { toast } = useToast()
  const [text, setText] = useState("")
  const [importing, setImporting] = useState(false)
  const [serverErrors, setServerErrors] = useState<{ row: number; message: string }[]>([])

  const rows = useMemo(() => parseCsv(text), [text])
  const validRows = rows.filter((r) => r.errors.length === 0)
  const invalidRows = rows.filter((r) => r.errors.length > 0)

  function reset() {
    setText("")
    setServerErrors([])
  }

  async function doImport() {
    if (validRows.length === 0) return
    setImporting(true)
    setServerErrors([])
    try {
      const result = await bulkCreateProspects(validRows)
      if (result.errors.length > 0) {
        setServerErrors(result.errors)
        toast("Algunas filas tienen errores; no se importó nada", "error")
        return
      }
      toast(`${result.created} prospecto(s) importados 🎉`)
      reset()
      onImported()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al importar", "error")
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Importar prospectos (CSV)" maxWidth="max-w-2xl">
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Pega las filas en formato CSV con columnas en este orden:{" "}
          <code className="bg-gray-100 px-1 rounded">nombre, restaurante, teléfono, whatsapp, email, ciudad, notas</code>.
          La primera fila puede ser encabezado. La ciudad debe coincidir con el catálogo.
        </p>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setServerErrors([])
          }}
          placeholder={EXAMPLE}
          rows={6}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E] transition-all"
        />

        {rows.length > 0 ? (
          <div className="rounded-xl border border-gray-100 overflow-hidden max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold text-gray-600">#</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-gray-600">Nombre</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-gray-600">Restaurante</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-gray-600">Teléfono</th>
                  <th className="text-left px-2 py-1.5 font-semibold text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => {
                  const serverErr = serverErrors.find((e) => e.row === r.rowNumber)
                  return (
                    <tr key={r.rowNumber}>
                      <td className="px-2 py-1.5 text-gray-400">{r.rowNumber}</td>
                      <td className="px-2 py-1.5">{r.name || "—"}</td>
                      <td className="px-2 py-1.5">{r.restaurant_name || "—"}</td>
                      <td className="px-2 py-1.5">{r.phone || "—"}</td>
                      <td className="px-2 py-1.5">
                        {r.errors.length > 0 || serverErr ? (
                          <Badge color="red">
                            {[...r.errors, ...(serverErr ? [serverErr.message] : [])].join(" · ")}
                          </Badge>
                        ) : (
                          <Badge color="green">OK</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">
            {rows.length === 0
              ? "Pega el CSV para previsualizar."
              : `${validRows.length} válida(s), ${invalidRows.length} con error`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={doImport}
              disabled={importing || validRows.length === 0 || invalidRows.length > 0}
            >
              {importing ? <Spinner className="w-4 h-4" /> : null}
              Importar {validRows.length > 0 ? `(${validRows.length})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
