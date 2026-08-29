"use client"

import { AlertTriangle } from "lucide-react"
import { useEscapeKey } from "@/hooks/use-escape-key"

interface ServerRestoreModalProps {
  backup: { entries: unknown[]; rows: unknown[]; dishes: unknown[] } | null
  restoring: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** Conteos por herramienta para el preview del respaldo v2 (Fase 4.4). */
function countsByTool(backup: { entries: unknown[]; rows: unknown[]; dishes: unknown[] }) {
  const counts = new Map<string, number>()
  for (const e of backup.entries as { tool?: string }[]) {
    if (typeof e?.tool === "string") counts.set(e.tool, (counts.get(e.tool) ?? 0) + 1)
  }
  for (const r of backup.rows as { tool?: string }[]) {
    if (typeof r?.tool === "string") counts.set(r.tool, (counts.get(r.tool) ?? 0) + 1)
  }
  if (backup.dishes.length > 0) counts.set("costeo (platillos)", backup.dishes.length)
  return [...counts.entries()]
}

export default function ServerRestoreModal({ backup, restoring, onCancel, onConfirm }: ServerRestoreModalProps) {
  useEscapeKey(onCancel, !!backup && !restoring)

  if (!backup) return null
  const counts = countsByTool(backup)
  const total = backup.entries.length + backup.rows.length + backup.dishes.length

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-gray-900">¿Importar respaldo completo?</h3>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Se reemplazarán <strong>todos</strong> los datos de tu panel (todas las colecciones)
          con los del archivo. Esta acción no se puede deshacer.
        </p>
        <div className="bg-gray-50 rounded-xl p-3 mb-4 max-h-40 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-600 mb-1.5">
            Contenido del respaldo ({total} registros):
          </p>
          <ul className="text-xs text-gray-500 space-y-0.5">
            {counts.map(([tool, n]) => (
              <li key={tool} className="flex justify-between gap-2">
                <span className="truncate">{tool}</span>
                <span className="font-medium text-gray-700 shrink-0">{n}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={restoring}
            className="text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={restoring}
            className="text-xs font-semibold text-white bg-[#0E7A0E] hover:bg-green-800 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {restoring ? "Importando…" : "Importar y reemplazar"}
          </button>
        </div>
      </div>
    </div>
  )
}
