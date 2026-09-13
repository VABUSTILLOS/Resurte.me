"use client"

// ============================================================
// Overrides de un platillo por sucursal: precio específico y
// disponibilidad por sucursal (estilo take.app multi-location).
// ============================================================

import { useState } from "react"
import { Building2, Loader2, X } from "lucide-react"
import { upsertBranchMenuOverride } from "../../actions"
import { formatMoney } from "@/lib/foodos"
import type {
  FoodosBranch,
  FoodosBranchMenuOverride,
  FoodosMenuItem,
} from "@/types/foodos"
import { useEscapeKey } from "@/hooks/use-escape-key"

interface Props {
  item: FoodosMenuItem
  branches: FoodosBranch[]
  overrides: FoodosBranchMenuOverride[]
  onClose: () => void
}

export function ItemBranchOverrides({ item, branches, overrides, onClose }: Props) {
  const itemOverrides = overrides.filter((o) => o.item_id === item.id)
  const [drafts, setDrafts] = useState<Record<string, { price: string; unavailable: boolean }>>(
    Object.fromEntries(
      branches.map((b) => {
        const o = itemOverrides.find((ov) => ov.branch_id === b.id)
        return [b.id, { price: o?.price != null ? String(o.price) : "", unavailable: o?.is_available === false }]
      })
    )
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscapeKey(onClose, true)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      for (const b of branches) {
        const d = drafts[b.id]
        if (!d) continue
        const price = d.price.trim() ? Number(d.price) : null
        await upsertBranchMenuOverride({
          branch_id: b.id,
          item_id: item.id,
          price,
          is_available: d.unavailable ? false : null,
        })
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#0E7A0E]" />
            &quot;{item.name}&quot; por sucursal
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Precio base: {formatMoney(item.price)}. Deja el precio vacío para usar el base.
        </p>

        <div className="space-y-3">
          {branches.map((b) => {
            const d = drafts[b.id] ?? { price: "", unavailable: false }
            return (
              <div key={b.id} className="flex items-center gap-3 rounded-xl border border-gray-200 px-3.5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{b.name}</p>
                </div>
                <input
                  type="number" min="0" step="0.01"
                  value={d.price}
                  disabled={d.unavailable}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...d, price: e.target.value } }))}
                  placeholder={formatMoney(item.price)}
                  className="w-24 rounded-lg border border-gray-200 px-2.5 py-2 text-sm disabled:opacity-40"
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={!d.unavailable}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [b.id]: { ...d, unavailable: !e.target.checked } }))}
                    className="accent-[#0E7A0E]"
                  />
                  Disponible
                </label>
              </div>
            )
          })}
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
