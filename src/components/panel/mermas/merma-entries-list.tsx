import { TrendingDown, Plus, Edit3, X } from "lucide-react"
import EmptyState from "@/components/panel/EmptyState"
import { WASTE_CATEGORIES, CAUSAS } from "./mermas-shared"
import type { WasteEntry } from "./mermas-shared"

interface MermaEntriesListProps {
  entries: WasteEntry[]
  showEmptyState: boolean
  onOpenForm: () => void
  onEdit: (entry: WasteEntry) => void
  onDelete: (id: string) => void
}

export default function MermaEntriesList({
  entries, showEmptyState, onOpenForm, onEdit, onDelete,
}: MermaEntriesListProps) {
  if (showEmptyState) {
    return (
      <div className="mb-6">
        <EmptyState
          icon={TrendingDown}
          title="Sin registros de merma todavía"
          description="Registra cada pérdida de insumos para conocer cuánto dinero se te va en merma al mes y reducirla con datos."
          action={
            <button
              onClick={onOpenForm}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-xl hover:bg-red-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Registrar primera merma
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-2 mb-6">
      {entries.map((entry) => {
        const cat = WASTE_CATEGORIES.find((c) => c.key === entry.category)
        const cause = CAUSAS.find((c) => c.key === entry.cause)
        return (
          <div key={entry.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-lg">{cat?.icon}</span>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-800">{cat?.label}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 font-medium">
                    {cause?.icon} {cause?.label || "Sin causa"}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{entry.amountKg} kg × ${entry.costPerKg}/kg</p>
                {entry.note && (
                  <p className="text-xs text-gray-500 italic mt-0.5">“{entry.note}”</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-bold text-red-600 text-sm">
                ${(entry.amountKg * entry.costPerKg).toFixed(2)}
              </span>
              <button onClick={() => onEdit(entry)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors" title="Editar registro">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(entry.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" aria-label="Eliminar registro" title="Eliminar registro">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
