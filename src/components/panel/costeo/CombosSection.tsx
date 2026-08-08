import { Gift, Plus, Tag, Trash2, AlertCircle, TrendingDown } from "lucide-react"
import type { Combo, ComboItem, Dish } from "./costeo-shared"

export default function CombosSection({
  combos,
  showComboForm,
  setShowComboForm,
  comboCost,
  comboMissingDishes,
  suggestedComboPrice,
  onRemoveCombo,
  dishes,
  newComboName,
  setNewComboName,
  newComboItems,
  setNewComboItems,
  toggleComboDish,
  setComboQty,
  newComboPrice,
  setNewComboPrice,
  addCombo,
  targetFoodCost,
}: {
  combos: Combo[]
  showComboForm: boolean
  setShowComboForm: (v: boolean) => void
  comboCost: (items: ComboItem[]) => number
  comboMissingDishes: (items: ComboItem[]) => ComboItem[]
  suggestedComboPrice: (items: ComboItem[]) => number
  onRemoveCombo: (id: string) => void
  dishes: Dish[]
  newComboName: string
  setNewComboName: (v: string) => void
  newComboItems: ComboItem[]
  setNewComboItems: (items: ComboItem[]) => void
  toggleComboDish: (dishId: string, dishName: string) => void
  setComboQty: (dishId: string, qty: number) => void
  newComboPrice: string
  setNewComboPrice: (v: string) => void
  addCombo: () => void
  targetFoodCost: number
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-amber-600" />
          <h3 className="font-semibold text-gray-900">Combos y promociones</h3>
          {combos.length > 0 && (
            <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">{combos.length}</span>
          )}
        </div>
        {!showComboForm && (
          <button
            onClick={() => setShowComboForm(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo combo
          </button>
        )}
      </div>

      {combos.length === 0 && !showComboForm && (
        <p className="text-xs text-gray-400 mb-4">
          Arma combos con 2+ platillos de tu menú para aumentar el ticket promedio. Sugerimos el precio según tu food cost objetivo.
        </p>
      )}

      {/* Combo list */}
      {combos.length > 0 && (
        <div className="space-y-3 mb-4">
          {combos.map((combo) => {
            const cost = comboCost(combo.items)
            const margin = combo.price - cost
            const fc = combo.price > 0 ? (cost / combo.price) * 100 : 0
            const isGood = fc <= 32
            const isOk = fc <= 38
            return (
              <div key={combo.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-amber-500" />
                    <h4 className="font-bold text-gray-900">{combo.name}</h4>
                  </div>
                  <button
                    onClick={() => onRemoveCombo(combo.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    title="Eliminar combo"
                    aria-label={`Eliminar combo ${combo.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {combo.items.map((it) => (
                    <span key={it.dishId} className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded-lg font-medium">
                      {it.qty} × {it.dishName}
                    </span>
                  ))}
                </div>
                {comboMissingDishes(combo.items).length > 0 && (
                  <div className="mb-3 flex items-center gap-2 text-[11px] font-medium text-red-600 bg-red-50 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {comboMissingDishes(combo.items).length === 1
                      ? `El platillo "${comboMissingDishes(combo.items)[0]!.dishName}" ya no existe — su costo cuenta como $0.`
                      : `${comboMissingDishes(combo.items).length} platillos de este combo ya no existen — su costo cuenta como $0.`}
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="bg-gray-50 rounded-xl p-2.5">
                    <p className="text-[10px] text-gray-400">Costo combo</p>
                    <p className="font-bold text-gray-900">${cost.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-2.5">
                    <p className="text-[10px] text-gray-400">Precio venta</p>
                    <p className="font-bold text-[#108910]">${combo.price.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-2.5">
                    <p className="text-[10px] text-gray-400">Margen</p>
                    <p className={`font-bold ${margin > 0 ? "text-green-600" : "text-red-600"}`}>${margin.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-2.5">
                    <p className="text-[10px] text-gray-400">Food cost</p>
                    <p className={`font-bold ${isGood ? "text-green-600" : isOk ? "text-amber-600" : "text-red-600"}`}>
                      {fc.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className={`mt-2 flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-1.5 ${
                  isGood ? "bg-green-50 text-green-700" : isOk ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                }`}>
                  {isGood ? <TrendingDown className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  {isGood
                    ? "¡Combo rentable! Aumenta tu ticket promedio."
                    : isOk
                      ? "Combo aceptable, revisa el precio."
                      : `Estás regalando margen. Precio sugerido: $${suggestedComboPrice(combo.items).toFixed(2)}`}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* New combo form */}
      {showComboForm && (
        <div className="bg-white rounded-2xl border border-amber-200 p-5 mb-4">
          <h4 className="font-semibold text-gray-900 mb-4">Nuevo combo</h4>
          <input
            type="text"
            value={newComboName}
            onChange={(e) => setNewComboName(e.target.value)}
            placeholder="Nombre del combo (ej. Combo familiar)"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm mb-3 focus:outline-none focus:border-amber-500"
          />
          <div className="mb-3">
            <p className="text-xs text-gray-400 mb-2">Selecciona los platillos del menú (mínimo 2):</p>
            {dishes.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
                Primero costea tu menú para poder armar combos.
              </p>
            ) : (
              <div className="max-h-44 overflow-y-auto space-y-1.5 border border-gray-100 rounded-xl p-2">
                {dishes.map((dish) => {
                  const selected = newComboItems.find((it) => it.dishId === dish.id)
                  return (
                    <div key={dish.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                      selected ? "bg-amber-50 border border-amber-200" : "hover:bg-gray-50"
                    }`}>
                      <input
                        type="checkbox"
                        checked={!!selected}
                        onChange={() => toggleComboDish(dish.id, dish.name)}
                        className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                      />
                      <span className="flex-1 text-sm text-gray-700 truncate">{dish.name}</span>
                      {selected && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setComboQty(dish.id, selected.qty - 1)}
                            className="w-6 h-6 rounded bg-amber-100 text-amber-700 font-bold hover:bg-amber-200 transition-colors"
                            aria-label={`Reducir cantidad de ${dish.name}`}
                          >−</button>
                          <span className="w-6 text-center text-xs font-bold text-gray-800">{selected.qty}</span>
                          <button
                            onClick={() => setComboQty(dish.id, selected.qty + 1)}
                            className="w-6 h-6 rounded bg-amber-100 text-amber-700 font-bold hover:bg-amber-200 transition-colors"
                            aria-label={`Aumentar cantidad de ${dish.name}`}
                          >+</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {newComboItems.length >= 2 && (
            <div className="mb-3 bg-amber-50 rounded-xl px-3 py-2.5 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="text-amber-700/70">Costo combo</p>
                <p className="font-bold text-gray-900">${comboCost(newComboItems).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-amber-700/70">Precio sugerido ({targetFoodCost}%)</p>
                <p className="font-bold text-amber-700">${suggestedComboPrice(newComboItems).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-amber-700/70">Precio del combo</p>
                <input
                  type="number"
                  value={newComboPrice}
                  onChange={(e) => setNewComboPrice(e.target.value)}
                  placeholder="$$$"
                  min="0"
                  step="0.5"
                  className="w-full px-2 py-1.5 rounded-lg border border-amber-300 text-sm text-center font-bold focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={addCombo} className="flex-1 bg-amber-500 text-white font-semibold py-2.5 rounded-xl hover:bg-amber-600 transition-colors">
              Guardar combo
            </button>
            <button
              onClick={() => { setShowComboForm(false); setNewComboName(""); setNewComboItems([]); setNewComboPrice("") }}
              className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
