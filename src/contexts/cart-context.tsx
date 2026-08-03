"use client"

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import type { Cart, CartItem, AppliedCoupon } from "@/types"

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
  | { type: "REMOVE_ITEM"; payload: { product_id: number } }
  | { type: "UPDATE_QUANTITY"; payload: { product_id: number; quantity: number } }
  | { type: "CLEAR_CART" }
  | { type: "APPLY_COUPON"; payload: AppliedCoupon }
  | { type: "REMOVE_COUPON" }
  | { type: "LOAD_CART"; payload: CartState }

interface CartContextValue extends CartState {
  addItem: (item: CartItem) => void
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

const EMPTY_CART: Cart = { store_id: null, store_name: null, store_slug: null, items: [] }

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      const newItem = action.payload
      const items = [...state.cart.items]
      const existing = items.findIndex((i) => i.product_id === newItem.product_id)

      if (existing >= 0) {
        items[existing] = {
          ...items[existing],
          quantity: items[existing].quantity + newItem.quantity,
        }
      } else {
        items.push(newItem)
      }

      return {
        ...state,
        cart: {
          ...state.cart,
          items,
        },
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

function loadFromStorage(): CartState {
  if (typeof window === "undefined") {
    return { cart: { ...EMPTY_CART }, coupon: null, isLoaded: false }
  }

  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        cart: parsed.cart ?? { ...EMPTY_CART },
        coupon: parsed.coupon ?? null,
        isLoaded: false,
      }
    }
  } catch {
    // corrupted data, reset
  }

  return { cart: { ...EMPTY_CART }, coupon: null, isLoaded: false }
}

function saveToStorage(cart: Cart, coupon: AppliedCoupon | null) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ cart, coupon }))
  } catch {
    // storage full or unavailable
  }
}

// ============================================================
// Helpers
// ============================================================

function calcSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => {
    const price = item.sale_price ?? item.price
    return sum + price * item.quantity
  }, 0)
}

function calcDiscount(subtotal: number, coupon: AppliedCoupon | null): number {
  if (!coupon) return 0
  if (subtotal < coupon.min_order) return 0

  if (coupon.discount_type === "percentage") {
    return Math.round((subtotal * coupon.discount_value) / 100 * 100) / 100
  }
  return Math.min(coupon.discount_value, subtotal)
}

// ============================================================
// Provider
// ============================================================

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, undefined, loadFromStorage)

  // Mark as loaded on mount
  useEffect(() => {
    dispatch({ type: "LOAD_CART", payload: state })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist to localStorage on changes
  useEffect(() => {
    if (state.isLoaded) {
      saveToStorage(state.cart, state.coupon)
    }
  }, [state.cart, state.coupon, state.isLoaded])

  const addItem = useCallback((item: CartItem) => {
    dispatch({ type: "ADD_ITEM", payload: item })
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

  const subtotal = calcSubtotal(state.cart.items)
  const discount = calcDiscount(subtotal, state.coupon)

  const total = useCallback(
    (deliveryFee = 0) => {
      return Math.max(0, subtotal - discount + deliveryFee)
    },
    [subtotal, discount]
  )

  return (
    <CartContext.Provider
      value={{
        ...state,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        applyCoupon,
        removeCoupon,
        itemCount,
        subtotal,
        discount,
        total,
      }}
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
