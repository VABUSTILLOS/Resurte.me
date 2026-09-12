"use client"

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { Cart, CartItem, AppliedCoupon } from "@/types"
import { calcCouponDiscount } from "@/lib/checkout-config"
import { createClient } from "@/lib/supabase/client"
import { mergeCarts, type ServerCartSnapshot } from "@/lib/cart-sync"

// ============================================================
// Types
// ============================================================

interface CartState {
  cart: Cart
  coupon: AppliedCoupon | null
  isLoaded: boolean
}

type CartAction =
  | { type: "ADD_ITEM"; payload: CartItem }
  | { type: "ADD_ITEMS"; payload: CartItem[] }
  | { type: "REMOVE_ITEM"; payload: { product_id: number } }
  | { type: "UPDATE_QUANTITY"; payload: { product_id: number; quantity: number } }
  | { type: "CLEAR_CART" }
  | { type: "APPLY_COUPON"; payload: AppliedCoupon }
  | { type: "REMOVE_COUPON" }
  | { type: "LOAD_CART"; payload: CartState }

interface CartContextValue extends CartState {
  addItem: (item: CartItem) => void
  addOrderItems: (items: CartItem[]) => void
  removeItem: (productId: number) => void
  updateQuantity: (productId: number, quantity: number) => void
  clearCart: () => void
  applyCoupon: (coupon: AppliedCoupon) => void
  removeCoupon: () => void
  itemCount: number
  subtotal: number
  discount: number
  total: (deliveryFee?: number) => number
}

// ============================================================
// Reducer
// ============================================================

const EMPTY_CART: Cart = { items: [] }

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      const newItem = action.payload
      const items = [...state.cart.items]
      const existing = items.findIndex((i) => i.product_id === newItem.product_id)

      if (existing >= 0) {
        items[existing] = {
          ...items[existing]!,
          quantity: items[existing]!.quantity + newItem.quantity,
        }
      } else {
        items.push(newItem)
      }

      return {
        ...state,
        cart: { items },
      }
    }

    case "ADD_ITEMS": {
      // Batch add (ej. "repetir pedido"): una sola actualización de estado.
      const items = [...state.cart.items]
      for (const newItem of action.payload) {
        const existing = items.findIndex((i) => i.product_id === newItem.product_id)
        if (existing >= 0) {
          items[existing] = {
            ...items[existing]!,
            quantity: items[existing]!.quantity + newItem.quantity,
          }
        } else {
          items.push(newItem)
        }
      }
      return {
        ...state,
        cart: { items },
      }
    }

    case "REMOVE_ITEM": {
      const items = state.cart.items.filter(
        (i) => i.product_id !== action.payload.product_id
      )
      // If no items left, reset store info
      if (items.length === 0) {
        return { ...state, cart: { ...EMPTY_CART } }
      }
      return { ...state, cart: { ...state.cart, items } }
    }

    case "UPDATE_QUANTITY": {
      const { product_id, quantity } = action.payload
      if (quantity <= 0) {
        const items = state.cart.items.filter((i) => i.product_id !== product_id)
        if (items.length === 0) {
          return { ...state, cart: { ...EMPTY_CART } }
        }
        return { ...state, cart: { ...state.cart, items } }
      }

      return {
        ...state,
        cart: {
          ...state.cart,
          items: state.cart.items.map((i) =>
            i.product_id === product_id ? { ...i, quantity } : i
          ),
        },
      }
    }

    case "CLEAR_CART":
      return { ...state, cart: { ...EMPTY_CART }, coupon: null }

    case "APPLY_COUPON":
      return { ...state, coupon: action.payload }

    case "REMOVE_COUPON":
      return { ...state, coupon: null }

    case "LOAD_CART":
      return { ...action.payload, isLoaded: true }

    default:
      return state
  }
}

// ============================================================
// Context
// ============================================================

const CartContext = createContext<CartContextValue | null>(null)

const CART_STORAGE_KEY = "resurte_cart"

function loadFromStorage(): CartState & { updatedAt: number | null } {
  if (typeof window === "undefined") {
    return { cart: { ...EMPTY_CART }, coupon: null, isLoaded: false, updatedAt: null }
  }

  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        cart: parsed.cart ?? { ...EMPTY_CART },
        coupon: parsed.coupon ?? null,
        isLoaded: false,
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : null,
      }
    }
  } catch {
    // corrupted data, reset
  }

  return { cart: { ...EMPTY_CART }, coupon: null, isLoaded: false, updatedAt: null }
}

function saveToStorage(cart: Cart, coupon: AppliedCoupon | null) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ cart, coupon, updatedAt: Date.now() })
    )
  } catch {
    // storage full or unavailable
  }
}

// ============================================================
// Helpers
// ============================================================

/** PUT best-effort del carrito completo al servidor (usuario con sesión). */
async function pushCartToServer(
  items: CartItem[],
  coupon: AppliedCoupon | null,
  opts?: { keepalive?: boolean }
): Promise<void> {
  try {
    await fetch("/api/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, coupon }),
      // keepalive permite que el flush de cierre de pestaña sobreviva al unload
      keepalive: opts?.keepalive,
    })
  } catch {
    // Offline: el carrito local (localStorage) sigue siendo la fuente visible.
  }
}

/** Serialización estable para detectar si el carrito ya fue subido. */
function serializeCart(items: CartItem[], coupon: AppliedCoupon | null): string {
  return JSON.stringify({ items, coupon })
}

function calcSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    const price = item.sale_price ?? item.price
    return sum + price * item.quantity
  }, 0)
}

// El descuento del cupón usa la fuente única `calcCouponDiscount`
// (checkout-config.ts), la misma fórmula que el servidor en POST /api/orders.

// ============================================================
// Provider
// ============================================================

export function CartProvider({ children }: { children: ReactNode }) {
  // SSR-safe: servidor y primer render del cliente usan el carrito vacío para
  // que la hidratación coincida. El carrito persistido (localStorage) se carga
  // después del mount vía LOAD_CART — esto evita el mismatch de hidratación
  // (#418) que obligaba a React a regenerar todo el árbol en cada recarga con
  // carrito guardado (y que intermitentemente "escondía" bumps y totales).
  const [state, dispatch] = useReducer(
    cartReducer,
    undefined,
    (): CartState => ({ cart: { ...EMPTY_CART }, coupon: null, isLoaded: false })
  )

  // Load the persisted cart on the client after hydration
  useEffect(() => {
    dispatch({ type: "LOAD_CART", payload: loadFromStorage() })
  }, [])

  // Persist to localStorage on changes
  useEffect(() => {
    if (state.isLoaded) {
      saveToStorage(state.cart, state.coupon)
    }
  }, [state.cart, state.coupon, state.isLoaded])

  // ── Sync con el carrito del servidor (usuarios con sesión) ──
  // El carrito local sigue funcionando offline y para invitados; al iniciar
  // sesión se hace merge last-write-wins con user_carts (ver cart-sync.ts).
  const [userId, setUserId] = useState<string | null>(null)
  const [serverSynced, setServerSynced] = useState(false)
  // Snapshot del último estado que ya está en el servidor (o acaba de
  // aplicarse desde él). Comparar contra esto evita tanto el push redundante
  // tras un use-server como la carrera del viejo flag skipNextPush, que podía
  // tragarse una edición hecha entre el LOAD_CART y el efecto de debounce.
  const lastPushedRef = useRef<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return // Supabase no configurado: solo carrito local
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user?.id ?? null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
      if (!session?.user) setServerSynced(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Merge inicial al detectar sesión.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/cart", { cache: "no-store" })
        if (!res.ok) return
        const server = (await res.json()) as ServerCartSnapshot
        if (cancelled) return
        const local = loadFromStorage()
        const decision = mergeCarts(
          { cart: local.cart, coupon: local.coupon, updatedAt: local.updatedAt },
          server
        )
        if (decision.action === "use-server") {
          lastPushedRef.current = serializeCart(decision.cart.items, decision.coupon)
          dispatch({
            type: "LOAD_CART",
            payload: { cart: decision.cart, coupon: decision.coupon, isLoaded: true },
          })
        } else if (decision.action === "upload-local") {
          lastPushedRef.current = serializeCart(local.cart.items, local.coupon)
          void pushCartToServer(local.cart.items, local.coupon)
        }
      } catch {
        // Offline o sin API: el carrito local sigue funcionando.
      } finally {
        if (!cancelled) setServerSynced(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  // Push debounced de cambios (solo tras el merge inicial). Si el estado
  // actual ya está en el servidor (mismo snapshot), no se sube nada.
  useEffect(() => {
    if (!userId || !state.isLoaded || !serverSynced) return
    const snapshot = serializeCart(state.cart.items, state.coupon)
    if (snapshot === lastPushedRef.current) return
    const timer = setTimeout(() => {
      lastPushedRef.current = snapshot
      void pushCartToServer(state.cart.items, state.coupon)
    }, 1500)
    return () => clearTimeout(timer)
  }, [userId, state.cart, state.coupon, state.isLoaded, serverSynced])

  // Flush al desmontar/cerrar: el debounce se cancela en cleanup, así que sin
  // esto el último cambio antes de navegar o cerrar la pestaña no se subiría.
  const latestRef = useRef({ userId, serverSynced, state })
  useEffect(() => {
    latestRef.current = { userId, serverSynced, state }
  })
  useEffect(() => {
    return () => {
      const { userId: uid, serverSynced: synced, state: s } = latestRef.current
      if (!uid || !synced || !s.isLoaded) return
      const snapshot = serializeCart(s.cart.items, s.coupon)
      if (snapshot === lastPushedRef.current) return
      void pushCartToServer(s.cart.items, s.coupon, { keepalive: true })
    }
  }, [])

  const addItem = useCallback((item: CartItem) => {
    dispatch({ type: "ADD_ITEM", payload: item })
  }, [])

  const addOrderItems = useCallback((items: CartItem[]) => {
    dispatch({ type: "ADD_ITEMS", payload: items })
  }, [])

  const removeItem = useCallback((productId: number) => {
    dispatch({ type: "REMOVE_ITEM", payload: { product_id: productId } })
  }, [])

  const updateQuantity = useCallback((productId: number, quantity: number) => {
    dispatch({ type: "UPDATE_QUANTITY", payload: { product_id: productId, quantity } })
  }, [])

  const clearCart = useCallback(() => {
    dispatch({ type: "CLEAR_CART" })
  }, [])

  const applyCoupon = useCallback((coupon: AppliedCoupon) => {
    dispatch({ type: "APPLY_COUPON", payload: coupon })
  }, [])

  const removeCoupon = useCallback(() => {
    dispatch({ type: "REMOVE_COUPON" })
  }, [])

  const itemCount = state.cart.items.reduce((sum, i) => sum + i.quantity, 0)

  // Fuente única para el offset de elementos flotantes del fondo: marca el
  // body cuando el MobileCartBar está visible para que WhatsApp, la pill de
  // cuenta, el StickyCatalogButton y el cookie banner suban por encima.
  useEffect(() => {
    if (typeof document === "undefined") return
    document.body.classList.toggle("cart-bar-active", itemCount > 0)
  }, [itemCount])

  const subtotal = calcSubtotal(state.cart.items)
  const discount = calcCouponDiscount(subtotal, state.coupon)

  const total = useCallback(
    (deliveryFee = 0) => {
      return Math.max(0, subtotal - discount + deliveryFee)
    },
    [subtotal, discount]
  )

  return (
    <CartContext.Provider
      value={useMemo(() => ({
        ...state,
        addItem,
        addOrderItems,
        removeItem,
        updateQuantity,
        clearCart,
        applyCoupon,
        removeCoupon,
        itemCount,
        subtotal,
        discount,
        total,
      }), [state, addItem, addOrderItems, removeItem, updateQuantity, clearCart, applyCoupon, removeCoupon, itemCount, subtotal, discount, total])}
    >
      {children}
    </CartContext.Provider>
  )
}

// ============================================================
// Hook
// ============================================================

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider")
  }
  return ctx
}
