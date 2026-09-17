"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cartLineKey, unitPriceWithModifiers } from "@/lib/foodos"
import type {
  FoodosCombo,
  FoodosItemOptionValue,
  FoodosMenuItem,
  FoodosOrderItem,
  FoodosOrderItemModifier,
} from "@/types/foodos"

/**
 * Carrito del comensal compartido por el micrositio (`/r/[slug]`) y el
 * marketplace (`/comer/[slug]`).
 *
 * Vive aquí y no dentro de cada pantalla porque son la misma experiencia: si el
 * comensal agrega platillos en el marketplace y termina pagando en el
 * micrositio (o al revés), el carrito tiene que ser el mismo. Duplicar la
 * máquina de estados garantizaba que las dos copias divergieran.
 *
 * Todo lo que se persiste es **local al dispositivo y por restaurante**: el
 * comensal navega el directorio, entra a tres restaurantes y cada uno conserva
 * su propio carrito. Nada de esto viaja al servidor: los totales que importan
 * los recalcula `createFoodosOrder` al cobrar.
 */

/** Menú vigente contra el que se validan las líneas guardadas. */
export interface FoodosCartMenu {
  items: FoodosMenuItem[]
  combos: FoodosCombo[]
  optionValues: FoodosItemOptionValue[]
}

const MAX_QTY_PER_LINE = 50

export function cartStorageKey(slug: string): string {
  return `foodos-cart-${slug}`
}

function readStoredCart(slug: string): FoodosOrderItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(cartStorageKey(slug))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (line): line is FoodosOrderItem =>
        typeof line === "object" &&
        line !== null &&
        typeof (line as FoodosOrderItem).item_id === "string" &&
        typeof (line as FoodosOrderItem).qty === "number" &&
        (line as FoodosOrderItem).qty > 0
    )
  } catch {
    // Storage lleno o modo privado: se sigue con el carrito vacío.
    return []
  }
}

function writeStoredCart(slug: string, lines: FoodosOrderItem[]): void {
  if (typeof window === "undefined") return
  try {
    if (lines.length === 0) localStorage.removeItem(cartStorageKey(slug))
    else localStorage.setItem(cartStorageKey(slug), JSON.stringify(lines))
  } catch {
    // Sin persistencia el carrito sigue funcionando en memoria.
  }
}

/**
 * Mapea líneas de un pedido anterior (o guardadas en el dispositivo) al menú
 * vigente. Los precios se recalculan: mostrar el precio de ayer y cobrar el de
 * hoy es la peor forma de sorprender a un comensal. Los platillos que ya no
 * existen o están agotados se descartan en silencio.
 *
 * Lo usan el reorden y la restauración del carrito, que son el mismo problema.
 */
export function mapLinesToMenu(
  source: FoodosOrderItem[],
  menu: FoodosCartMenu,
  priceOf: (item: FoodosMenuItem) => number
): FoodosOrderItem[] {
  const lines: FoodosOrderItem[] = []
  for (const line of source) {
    if (line.combo_id) {
      const combo = menu.combos.find((c) => c.id === line.combo_id && c.is_active)
      if (!combo) continue
      lines.push({
        item_id: combo.id,
        name: combo.name,
        price: combo.price,
        qty: line.qty,
        combo_id: combo.id,
      })
      continue
    }
    const item = menu.items.find((i) => i.id === line.item_id && i.is_available)
    if (!item) continue
    const modifiers = (line.modifiers ?? []).filter((m) =>
      menu.optionValues.some((v) => v.id === m.value_id && v.is_available)
    )
    lines.push({
      item_id: item.id,
      name: item.name,
      price: unitPriceWithModifiers(priceOf(item), modifiers),
      qty: line.qty,
      modifiers: modifiers.length ? modifiers : undefined,
    })
  }
  return lines
}

export interface UseFoodosCartOptions {
  /** Slug del restaurante: aísla el carrito y los favoritos por negocio. */
  slug: string
  menu: FoodosCartMenu
  optionGroups: { item_id: string }[]
  /** Precio vigente del platillo (incluye el override de la sucursal activa). */
  priceOf: (item: FoodosMenuItem) => number
}

export interface FoodosCartApi {
  lines: FoodosOrderItem[]
  count: number
  subtotal: number
  /** Agrega el platillo; si tiene opciones abre el modal en vez de agregarlo. */
  addItem: (item: FoodosMenuItem) => void
  addCombo: (combo: FoodosCombo) => void
  pushLine: (line: FoodosOrderItem) => void
  changeQty: (index: number, delta: number) => void
  removeLine: (index: number) => void
  replaceLines: (lines: FoodosOrderItem[]) => void
  clear: () => void
  itemHasOptions: (itemId: string) => boolean
  optionsItem: FoodosMenuItem | null
  openOptions: (item: FoodosMenuItem) => void
  closeOptions: () => void
  addWithModifiers: (modifiers: FoodosOrderItemModifier[]) => void
  favorites: Set<string>
  toggleFavorite: (itemId: string) => void
  selectedCategory: string | null
  setSelectedCategory: (id: string | null) => void
}

export function useFoodosCart({
  slug,
  menu,
  optionGroups,
  priceOf,
}: UseFoodosCartOptions): FoodosCartApi {
  const [lines, setLines] = useState<FoodosOrderItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [optionsItem, setOptionsItem] = useState<FoodosMenuItem | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set())

  // El menú se lee por ref: la restauración corre una sola vez por restaurante
  // y no debe volver a correr cada vez que el catálogo se revalida.
  const menuRef = useRef({ menu, priceOf })
  useEffect(() => {
    menuRef.current = { menu, priceOf }
  }, [menu, priceOf])

  useEffect(() => {
    const stored = readStoredCart(slug)
    if (stored.length) {
      setLines(mapLinesToMenu(stored, menuRef.current.menu, menuRef.current.priceOf))
    } else {
      setLines([])
    }
    try {
      const favs = localStorage.getItem(`foodos-favs-${slug}`)
      setFavorites(new Set(favs ? (JSON.parse(favs) as string[]) : []))
    } catch {
      setFavorites(new Set())
    }
    setHydrated(true)
  }, [slug])

  // La escritura se salta el primer render: antes de restaurar, `lines` está
  // vacío y guardar ahí borraría el carrito del comensal.
  useEffect(() => {
    if (!hydrated) return
    writeStoredCart(slug, lines)
  }, [hydrated, slug, lines])

  const pushLine = useCallback((line: FoodosOrderItem) => {
    setLines((prev) => {
      const key = cartLineKey(line)
      const existing = prev.find((i) => cartLineKey(i) === key)
      if (existing) {
        return prev.map((i) =>
          cartLineKey(i) === key
            ? { ...i, qty: Math.min(i.qty + line.qty, MAX_QTY_PER_LINE) }
            : i
        )
      }
      return [...prev, { ...line, qty: Math.min(line.qty, MAX_QTY_PER_LINE) }]
    })
  }, [])

  const itemHasOptions = useCallback(
    (itemId: string) => optionGroups.some((g) => g.item_id === itemId),
    [optionGroups]
  )

  const addItem = useCallback(
    (item: FoodosMenuItem) => {
      if (itemHasOptions(item.id)) {
        setOptionsItem(item)
        return
      }
      pushLine({ item_id: item.id, name: item.name, price: priceOf(item), qty: 1 })
    },
    [itemHasOptions, pushLine, priceOf]
  )

  const addCombo = useCallback(
    (combo: FoodosCombo) => {
      pushLine({
        item_id: combo.id,
        name: combo.name,
        price: combo.price,
        qty: 1,
        combo_id: combo.id,
      })
    },
    [pushLine]
  )

  const addWithModifiers = useCallback(
    (modifiers: FoodosOrderItemModifier[]) => {
      if (!optionsItem) return
      pushLine({
        item_id: optionsItem.id,
        name: optionsItem.name,
        price: unitPriceWithModifiers(priceOf(optionsItem), modifiers),
        qty: 1,
        modifiers: modifiers.length ? modifiers : undefined,
      })
      setOptionsItem(null)
    },
    [optionsItem, priceOf, pushLine]
  )

  const changeQty = useCallback((index: number, delta: number) => {
    setLines((prev) =>
      prev
        .map((line, idx) =>
          idx === index ? { ...line, qty: Math.min(line.qty + delta, MAX_QTY_PER_LINE) } : line
        )
        .filter((line) => line.qty > 0)
    )
  }, [])

  const removeLine = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index))
  }, [])

  const replaceLines = useCallback((next: FoodosOrderItem[]) => setLines(next), [])
  const clear = useCallback(() => setLines([]), [])

  const toggleFavorite = useCallback(
    (itemId: string) => {
      setFavorites((prev) => {
        const next = new Set(prev)
        if (next.has(itemId)) next.delete(itemId)
        else next.add(itemId)
        try {
          localStorage.setItem(`foodos-favs-${slug}`, JSON.stringify([...next]))
        } catch {
          // Sin persistencia el favorito sigue vivo en memoria.
        }
        return next
      })
    },
    [slug]
  )

  const { count, subtotal } = useMemo(() => {
    let count = 0
    let subtotal = 0
    for (const line of lines) {
      count += line.qty
      subtotal += line.price * line.qty
    }
    return { count, subtotal }
  }, [lines])

  return {
    lines,
    count,
    subtotal,
    addItem,
    addCombo,
    pushLine,
    changeQty,
    removeLine,
    replaceLines,
    clear,
    itemHasOptions,
    optionsItem,
    openOptions: setOptionsItem,
    closeOptions: () => setOptionsItem(null),
    addWithModifiers,
    favorites,
    toggleFavorite,
    selectedCategory,
    setSelectedCategory,
  }
}
