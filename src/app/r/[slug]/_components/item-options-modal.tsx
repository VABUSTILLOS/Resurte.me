"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import { X } from "lucide-react"
import { formatMoney, validateOptionSelection } from "@/lib/foodos"
import type {
  FoodosItemOptionGroup,
  FoodosItemOptionValue,
  FoodosMenuItem,
  FoodosOrderItemModifier,
} from "@/types/foodos"

interface Props {
  item: FoodosMenuItem
  groups: FoodosItemOptionGroup[]
  values: FoodosItemOptionValue[]
  onConfirm: (modifiers: FoodosOrderItemModifier[]) => void
  onClose: () => void
}

/** Modal de modificadores estilo take.app: tamaños, extras, etc. */
export function ItemOptionsModal({ item, groups, values, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [error, setError] = useState<string | null>(null)

  const itemGroups = useMemo(
    () =>
      groups
        .filter((g) => g.item_id === item.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    [groups, item.id]
  )

  const valuesByGroup = useMemo(() => {
    const map = new Map<string, FoodosItemOptionValue[]>()
    for (const v of values) {
      const list = map.get(v.group_id) ?? []
      list.push(v)
      map.set(v.group_id, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order)
    return map
  }, [values])

  const toggle = (group: FoodosItemOptionGroup, valueId: string) => {
    setError(null)
    setSelected((prev) => {
      const current = prev[group.id] ?? []
      if (current.includes(valueId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== valueId) }
      }
      if (group.max_select === 1) {
        return { ...prev, [group.id]: [valueId] }
      }
      if (current.length >= group.max_select) return prev
      return { ...prev, [group.id]: [...current, valueId] }
    })
  }

  const modifiersTotal = Object.values(selected)
    .flat()
    .reduce((sum, id) => {
      const v = values.find((val) => val.id === id)
      return sum + (Number(v?.price_delta) || 0)
    }, 0)

  const handleConfirm = () => {
    const err = validateOptionSelection(itemGroups, selected)
    if (err) {
      setError(err)
      return
    }
    const modifiers: FoodosOrderItemModifier[] = []
    for (const g of itemGroups) {
      for (const valueId of selected[g.id] ?? []) {
        const v = (valuesByGroup.get(g.id) ?? []).find((val) => val.id === valueId)
        if (!v) continue
        modifiers.push({
          group_id: g.id,
          group_name: g.name,
          value_id: v.id,
          value_name: v.name,
          price_delta: Number(v.price_delta) || 0,
        })
      }
    }
    onConfirm(modifiers)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-stone-100 p-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {item.image_url && (
              <Image src={item.image_url} alt={item.name} width={48} height={48} className="w-12 h-12 rounded-xl object-cover shrink-0" />
            )}
            <div className="min-w-0">
              <h3 className="font-bold text-stone-900 truncate">{item.name}</h3>
              <p className="text-sm text-stone-500">{formatMoney(item.price)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-700" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {itemGroups.map((group) => {
            const groupValues = valuesByGroup.get(group.id) ?? []
            const selectedCount = (selected[group.id] ?? []).length
            return (
              <div key={group.id}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-stone-900">{group.name}</p>
                  <span className="text-[11px] text-stone-400">
                    {group.is_required ? "Obligatorio" : "Opcional"}
                    {group.max_select > 1 ? ` · máx ${group.max_select}` : ""}
                  </span>
                </div>
                <div className="space-y-2">
                  {groupValues.map((v) => {
                    const active = (selected[group.id] ?? []).includes(v.id)
                    const disabled = !active && group.max_select > 1 && selectedCount >= group.max_select
                    return (
                      <button
                        key={v.id}
                        onClick={() => toggle(group, v.id)}
                        disabled={disabled}
                        className={`w-full flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                          active
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                            : "border-stone-200 text-stone-600 disabled:opacity-40"
                        }`}
                      >
                        <span>{v.name}</span>
                        {Number(v.price_delta) > 0 && (
                          <span className="text-xs">+{formatMoney(Number(v.price_delta))}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-stone-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            onClick={handleConfirm}
            className="w-full py-3 rounded-xl foodos-accent bg-emerald-600 text-white font-bold hover:bg-emerald-700"
          >
            Agregar · {formatMoney(item.price + modifiersTotal)}
          </button>
        </div>
      </div>
    </div>
  )
}
