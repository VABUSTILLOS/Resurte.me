/**
 * "Mi canasta" — listas de compra recurrentes (A4).
 *
 * El usuario guarda el contenido de su carrito como una lista nombrada
 * (p.ej. "Canasta semanal", "Pedido de carnes") y la reordena después con
 * un toque. Persiste en localStorage (no requiere sesión ni migración).
 *
 * Solo helpers puros + acceso a localStorage; seguro importar en cliente.
 */

import type { CartItem } from "@/types"

export interface ShoppingListItem {
  product_id: number
  name: string
  slug: string
  image_url: string
  brand: string
  price: number
  sale_price: number | null
  quantity: number
}

export interface ShoppingList {
  id: string
  name: string
  items: ShoppingListItem[]
  created_at: string
  updated_at: string
}

const STORAGE_KEY = "resurte_shopping_lists"
const MAX_LISTS = 20

function isBrowser(): boolean {
  return typeof window !== "undefined"
}

function readAll(): ShoppingList[] {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ShoppingList[]) : []
  } catch {
    return []
  }
}

function writeAll(lists: ShoppingList[]): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lists))
  } catch {
    // localStorage lleno o no disponible — no bloquear
  }
}

export function getShoppingLists(): ShoppingList[] {
  return readAll().sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export function getShoppingList(id: string): ShoppingList | null {
  return readAll().find((l) => l.id === id) ?? null
}

/** Crea una lista a partir de los items del carrito. Devuelve la lista creada. */
export function saveShoppingList(name: string, items: CartItem[]): ShoppingList {
  const now = new Date().toISOString()
  const list: ShoppingList = {
    id: `list_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "Mi lista",
    items: items.map((i) => ({
      product_id: i.product_id,
      name: i.name,
      slug: i.slug,
      image_url: i.image_url,
      brand: i.brand,
      price: i.price,
      sale_price: i.sale_price,
      quantity: i.quantity,
    })),
    created_at: now,
    updated_at: now,
  }
  const lists = [list, ...readAll()].slice(0, MAX_LISTS)
  writeAll(lists)
  return list
}

export function renameShoppingList(id: string, name: string): void {
  writeAll(
    readAll().map((l) =>
      l.id === id ? { ...l, name: name.trim() || l.name, updated_at: new Date().toISOString() } : l
    )
  )
}

export function deleteShoppingList(id: string): void {
  writeAll(readAll().filter((l) => l.id !== id))
}

/** Convierte los items de una lista al formato CartItem para addOrderItems. */
export function listToCartItems(list: ShoppingList): CartItem[] {
  return list.items.map((i) => ({
    product_id: i.product_id,
    name: i.name,
    slug: i.slug,
    image_url: i.image_url,
    brand: i.brand,
    price: i.price,
    sale_price: i.sale_price,
    quantity: i.quantity,
    stock_status: "in_stock" as const,
  }))
}
