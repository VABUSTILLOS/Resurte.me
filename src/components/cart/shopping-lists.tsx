"use client"

import { useState } from "react"
import { BookmarkPlus, Trash2, ShoppingCart, Pencil, Check, X } from "lucide-react"
import { useCart } from "@/contexts/cart-context"
import { useToast } from "@/components/toast"
import {
  getShoppingLists,
  saveShoppingList,
  renameShoppingList,
  deleteShoppingList,
  listToCartItems,
  type ShoppingList,
} from "@/lib/shopping-lists"
import { trackEvent } from "@/lib/analytics"

/**
 * "Mi canasta" (A4): guarda el carrito actual como lista recurrente y
 * permite reordenar una lista guardada con un toque. Persiste en
 * localStorage, así que funciona sin sesión.
 */
export function ShoppingLists() {
  const { cart, addOrderItems } = useCart()
  const { toast } = useToast()
  const [lists, setLists] = useState<ShoppingList[]>(() => getShoppingLists())
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  const refresh = () => setLists(getShoppingLists())

  function handleSave() {
    if (cart.items.length === 0) return
    saveShoppingList(newName, cart.items)
    trackEvent("save_shopping_list", { items: cart.items.length })
    toast("Lista guardada ✅")
    setNewName("")
    setSaving(false)
    refresh()
  }

  function handleApply(list: ShoppingList) {
    addOrderItems(listToCartItems(list))
    trackEvent("apply_shopping_list", { list_id: list.id, items: list.items.length })
    toast(`"${list.name}" agregada al carrito`)
  }

  function handleRename(id: string) {
    renameShoppingList(id, editName)
    setEditingId(null)
    setEditName("")
    refresh()
  }

  function handleDelete(id: string) {
    deleteShoppingList(id)
    refresh()
  }

  return (
    <div className="mt-6">
      {/* Guardar carrito como lista */}
      {cart.items.length > 0 && (
        <div className="mb-4">
          {saving ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="Nombre de la lista (p.ej. Canasta semanal)"
                className="flex-1 px-3 py-2 border border-[#e0dbd2] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/20 focus:border-[#0E7A0E]"
                autoFocus
              />
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0D720D] transition-colors"
              >
                Guardar
              </button>
              <button
                onClick={() => setSaving(false)}
                className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600"
                aria-label="Cancelar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSaving(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0E7A0E] hover:underline"
            >
              <BookmarkPlus className="w-4 h-4" />
              Guardar carrito como lista
            </button>
          )}
        </div>
      )}

      {/* Mis listas */}
      {lists.length > 0 && (
        <div className="rounded-xl border border-[#e0dbd2] bg-white p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Mis listas</h3>
          <ul className="space-y-2">
            {lists.map((list) => (
              <li
                key={list.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-[#faf8f5] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  {editingId === list.id ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleRename(list.id)}
                        className="flex-1 px-2 py-1 border border-[#e0dbd2] rounded-lg text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => handleRename(list.id)}
                        className="text-[#0E7A0E]"
                        aria-label="Confirmar"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-900 truncate">{list.name}</p>
                      <p className="text-[11px] text-gray-400">
                        {list.items.length} producto{list.items.length !== 1 ? "s" : ""}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleApply(list)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0E7A0E]/10 text-[#0E7A0E] text-xs font-semibold hover:bg-[#0E7A0E]/15 transition-colors"
                    title="Agregar al carrito"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    Reordenar
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(list.id)
                      setEditName(list.name)
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-600"
                    aria-label="Renombrar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(list.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500"
                    aria-label="Borrar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
