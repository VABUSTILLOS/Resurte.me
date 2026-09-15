"use client"

import type { ImportConfirm } from "./planificador-shared"
import { t } from "@/lib/i18n/es"
import { BottomSheet } from "@/components/ui/bottom-sheet"

interface ConfirmImportModalProps {
  confirmImport: ImportConfirm | null
  onCancel: () => void
  onConfirm: () => void
}

// Modal: sobrescribir cantidades manuales al importar un platillo del Costeador.
export default function ConfirmImportModal({ confirmImport, onCancel, onConfirm }: ConfirmImportModalProps) {
  return (
    <BottomSheet open={!!confirmImport} onClose={onCancel} ariaLabelledby="confirm-import-title">
      <div className="p-6 pt-3">
        <h4 id="confirm-import-title" className="font-bold text-gray-900 mb-2">{t("planificador.overwriteTitle")}</h4>
        <p className="text-xs text-gray-500 mb-4">
          {t("planificador.overwriteA")} <span className="font-semibold text-gray-700">&quot;{confirmImport?.dishName}&quot;</span> {t("planificador.overwriteB")}
        </p>
        <ul className="space-y-1.5 mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3">
          {confirmImport?.ingredients.map((o) => (
            <li key={o.name} className="flex items-center justify-between text-xs">
              <span className="text-amber-800 font-medium">{o.name}</span>
              <span className="text-amber-600">{o.existing} {t("planificador.toAutomatic")}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            {t("planificador.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            {t("planificador.confirmOverwrite")}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
