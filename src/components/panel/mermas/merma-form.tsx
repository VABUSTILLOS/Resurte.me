import { Plus } from "lucide-react"
import { WASTE_CATEGORIES, CAUSAS } from "./mermas-shared"
import { t } from "@/lib/i18n/es"

interface MermaFormProps {
  showForm: boolean
  editingId: string | null
  selectedCategory: string
  onCategoryChange: (v: string) => void
  amountKg: string
  onAmountKgChange: (v: string) => void
  costPerKg: string
  onCostPerKgChange: (v: string) => void
  note: string
  onNoteChange: (v: string) => void
  selectedCause: string
  onCauseChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  onOpenForm: () => void
}

export default function MermaForm({
  showForm, editingId, selectedCategory, onCategoryChange, amountKg, onAmountKgChange,
  costPerKg, onCostPerKgChange, note, onNoteChange, selectedCause, onCauseChange,
  onSave, onCancel, onOpenForm,
}: MermaFormProps) {
  if (!showForm) {
    return (
      <button
        onClick={onOpenForm}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-400 transition-colors font-medium mb-6"
      >
        <Plus className="w-5 h-5" />
        {t("mermas.newEntry")}
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <h4 className="font-semibold text-gray-900 mb-4">
        {editingId ? t("mermas.editEntry") : t("mermas.newEntry")}
      </h4>
      <div className="space-y-3">
        <select
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#0E7A0E] bg-white"
        >
          {WASTE_CATEGORIES.map((cat) => (
            <option key={cat.key} value={cat.key}>{cat.icon} {cat.label}</option>
          ))}
        </select>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">Cantidad (kg)</label>
            <input
              type="number"
              value={amountKg}
              onChange={(e) => onAmountKgChange(e.target.value)}
              placeholder="Ej: 2.5"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#0E7A0E]"
              min="0"
              step="0.1"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">Costo por kg ($)</label>
            <input
              type="number"
              value={costPerKg}
              onChange={(e) => onCostPerKgChange(e.target.value)}
              placeholder="Ej: 85"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#0E7A0E]"
              min="0"
              step="0.5"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Causa de la merma</label>
          <div className="flex flex-wrap gap-1.5">
            {CAUSAS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => onCauseChange(c.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedCause === c.key
                    ? "bg-red-100 text-red-700 border border-red-300"
                    : "bg-gray-50 text-gray-500 border border-gray-200 hover:border-red-200"
                }`}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Nota o motivo (opcional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Ej: Se echó a perder por cadena de frío..."
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#0E7A0E]"
          />
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={onSave} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 transition-colors">
          {editingId ? "Guardar cambios" : "Registrar pérdida"}
        </button>
        <button onClick={onCancel} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  )
}
