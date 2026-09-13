"use client"

// ============================================================
// Gestión de modificadores de un platillo: grupos de opciones
// (tamaño, extras...) y sus valores con precio adicional.
// ============================================================

import { useState } from "react"
import { Loader2, Plus, Trash2, X, ListPlus } from "lucide-react"
import {
  upsertOptionGroup,
  deleteOptionGroup,
  upsertOptionValue,
  deleteOptionValue,
  listOptionGroups,
  listOptionValues,
} from "../../actions"
import { formatMoney } from "@/lib/foodos"
import type {
  FoodosItemOptionGroup,
  FoodosItemOptionValue,
  FoodosMenuItem,
} from "@/types/foodos"
import { useEscapeKey } from "@/hooks/use-escape-key"

interface Props {
  item: FoodosMenuItem
  restaurantId: string
  groups: FoodosItemOptionGroup[]
  values: FoodosItemOptionValue[]
  onChange: (groups: FoodosItemOptionGroup[], values: FoodosItemOptionValue[]) => void
  onClose: () => void
}

export function ItemOptionsManager({ item, restaurantId, groups, values, onChange, onClose }: Props) {
  const itemGroups = groups
    .filter((g) => g.item_id === item.id)
    .sort((a, b) => a.sort_order - b.sort_order)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Nuevo grupo
  const [groupName, setGroupName] = useState("")
  const [groupRequired, setGroupRequired] = useState(false)
  const [groupMax, setGroupMax] = useState("1")

  // Nuevo valor por grupo: { [groupId]: { name, price } }
  const [drafts, setDrafts] = useState<Record<string, { name: string; price: string }>>({})

  useEscapeKey(onClose, true)

  const run = async (fn: () => Promise<void>) => {
    setSaving(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const addGroup = () =>
    run(async () => {
      if (!groupName.trim()) return
      await upsertOptionGroup({
        restaurant_id: restaurantId,
        item_id: item.id,
        name: groupName.trim(),
        is_required: groupRequired,
        min_select: groupRequired ? 1 : 0,
        max_select: Math.max(1, Number(groupMax) || 1),
        sort_order: itemGroups.length,
      })
      // El grupo nuevo no tiene id local; refrescamos desde BD.
      onChange(await listOptionGroups(restaurantId), await listOptionValues(restaurantId))
      setGroupName("")
      setGroupRequired(false)
      setGroupMax("1")
    })

  const removeGroup = (id: string) =>
    run(async () => {
      await deleteOptionGroup(id)
      onChange(
        groups.filter((g) => g.id !== id),
        values.filter((v) => v.group_id !== id)
      )
    })

  const toggleValue = (value: FoodosItemOptionValue) =>
    run(async () => {
      await upsertOptionValue({
        id: value.id,
        group_id: value.group_id,
        restaurant_id: restaurantId,
        name: value.name,
        price_delta: value.price_delta,
        is_available: !value.is_available,
        sort_order: value.sort_order,
      })
      onChange(
        groups,
        values.map((v) => (v.id === value.id ? { ...v, is_available: !v.is_available } : v))
      )
    })

  const removeValue = (id: string) =>
    run(async () => {
      await deleteOptionValue(id)
      onChange(groups, values.filter((v) => v.id !== id))
    })

  const addValue = (group: FoodosItemOptionGroup) =>
    run(async () => {
      const draft = drafts[group.id]
      if (!draft?.name.trim()) return
      await upsertOptionValue({
        group_id: group.id,
        restaurant_id: restaurantId,
        name: draft.name.trim(),
        price_delta: Number(draft.price) || 0,
        sort_order: values.filter((v) => v.group_id === group.id).length,
      })
      onChange(groups, await listOptionValues(restaurantId))
      setDrafts((prev) => ({ ...prev, [group.id]: { name: "", price: "" } }))
    })

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <ListPlus className="w-5 h-5 text-[#0E7A0E]" />
            Opciones de &quot;{item.name}&quot;
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Tamaños, extras y complementos que el cliente elige al pedir. Cada opción puede sumar al precio.
        </p>

        {error && (
          <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="space-y-4">
          {itemGroups.map((group) => {
            const groupValues = values
              .filter((v) => v.group_id === group.id)
              .sort((a, b) => a.sort_order - b.sort_order)
            const draft = drafts[group.id] ?? { name: "", price: "" }
            return (
              <div key={group.id} className="rounded-xl border border-gray-200 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{group.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {group.is_required ? "Obligatorio" : "Opcional"} · máx {group.max_select}
                    </p>
                  </div>
                  <button
                    onClick={() => removeGroup(group.id)}
                    disabled={saving}
                    className="p-1.5 text-gray-400 hover:text-red-600"
                    aria-label={`Eliminar grupo ${group.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5 mb-2">
                  {groupValues.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                      <button
                        onClick={() => toggleValue(v)}
                        disabled={saving}
                        className={`text-sm text-left ${v.is_available ? "text-gray-700" : "text-gray-400 line-through"}`}
                        title={v.is_available ? "Desactivar" : "Activar"}
                      >
                        {v.name}
                      </button>
                      <div className="flex items-center gap-2">
                        {Number(v.price_delta) > 0 && (
                          <span className="text-xs font-semibold text-gray-500">+{formatMoney(Number(v.price_delta))}</span>
                        )}
                        <button
                          onClick={() => removeValue(v.id)}
                          disabled={saving}
                          className="p-1 text-gray-400 hover:text-red-600"
                          aria-label={`Eliminar ${v.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    value={draft.name}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [group.id]: { ...draft, name: e.target.value } }))}
                    placeholder="Nueva opción (ej. Grande)"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                  />
                  <input
                    type="number" min="0" step="0.01"
                    value={draft.price}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [group.id]: { ...draft, price: e.target.value } }))}
                    placeholder="+$"
                    className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                  />
                  <button
                    onClick={() => addValue(group)}
                    disabled={saving || !draft.name.trim()}
                    className="p-2 rounded-lg bg-[#0E7A0E] text-white hover:bg-[#0e7a0e] disabled:opacity-40"
                    aria-label="Agregar opción"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Nuevo grupo */}
        <div className="mt-4 rounded-xl border border-dashed border-[#0E7A0E]/40 p-3.5">
          <p className="text-xs font-semibold text-gray-500 mb-2">Nuevo grupo de opciones</p>
          <div className="flex gap-2 mb-2">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Ej. Tamaño, Extras, Término"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
            />
            <input
              type="number" min="1"
              value={groupMax}
              onChange={(e) => setGroupMax(e.target.value)}
              title="Máximo de opciones seleccionables"
              className="w-16 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={groupRequired}
                onChange={(e) => setGroupRequired(e.target.checked)}
                className="accent-[#0E7A0E]"
              />
              Obligatorio
            </label>
            <button
              onClick={addGroup}
              disabled={saving || !groupName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Agregar grupo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
