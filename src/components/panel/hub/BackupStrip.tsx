"use client"

import { Zap } from "lucide-react"
import type { RefObject } from "react"

interface BackupStripProps {
  onNewDish: () => void
  onMerma: () => void
  onApertura: () => void
  onBackup: () => void
  onRestoreFileSelected: (file: File) => void
  fileInputRef: RefObject<HTMLInputElement | null>
}

export default function BackupStrip({
  onNewDish, onMerma, onApertura, onBackup, onRestoreFileSelected, fileInputRef,
}: BackupStripProps) {
  return (
    <div className="flex items-center gap-2 mb-6">
      <span className="text-xs text-gray-400 flex items-center gap-1">
        <Zap className="w-3.5 h-3.5" />
        Acciones rápidas:
      </span>
      <button
        onClick={onNewDish}
        className="text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
      >
        + Nuevo platillo
      </button>
      <button
        onClick={onMerma}
        className="text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
      >
        + Registrar merma
      </button>
      <button
        onClick={onApertura}
        className="text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
      >
        ✓ Checklist apertura
      </button>
      <span className="text-[10px] text-gray-300 mx-1">|</span>
      <button
        onClick={onBackup}
        className="text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
        title="Exportar todos los datos de esta colección a un archivo JSON"
      >
        💾 Respaldo
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
        title="Restaurar datos desde un archivo JSON de respaldo"
      >
        📥 Restaurar
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onRestoreFileSelected(file)
          e.target.value = ""
        }}
      />
    </div>
  )
}
