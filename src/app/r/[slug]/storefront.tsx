"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Compass, ShoppingBag } from "lucide-react"
import {
  computeOrderTotals,
  buildRecommendations,
} from "@/lib/foodos"
import type {
  FoodosRestaurant,
  FoodosBranch,
  FoodosMenuCategory,
  FoodosMenuItem,
  FoodosCombo,
  FoodosUpsellRule,
  FoodosOrderItem,
} from "@/types/foodos"
import { MenuView } from "./_components/menu-view"
import { CheckoutView } from "./_components/checkout-view"
import { CardPaymentOverlay } from "./_components/card-payment-overlay"
import { SuccessScreen } from "./_components/success-screen"

type View = "menu" | "checkout" | "success"

interface Props {
  restaurant: FoodosRestaurant
  branches: FoodosBranch[]
  categories: FoodosMenuCategory[]
  items: FoodosMenuItem[]
  combos: FoodosCombo[]
  rules: FoodosUpsellRule[]
}

export function FoodosStorefront({
  restaurant,
  branches,
  categories,
  items,
  combos,
  rules,
}: Props) {
  const [cart, setCart] = useState<FoodosOrderItem[]>([])
  const [view, setView] = useState<View>("menu")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Checkout state
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup")
  const [branchId, setBranchId] = useState<string | null>(branches[0]?.id ?? null)
  const [paymentMethod, setPaymentMethod] = useState<"card" | "branch">("branch")
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stripe flow
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const deliveryFee = useMemo(() => {
    if (fulfillment !== "delivery") return 0
    const branch = branches.find((b) => b.id === branchId)
    return branch?.delivery_fee ?? 0
  }, [fulfillment, branchId, branches])

  const totals = useMemo(
    () => computeOrderTotals(cart, deliveryFee, 0),
    [cart, deliveryFee]
  )

  const recommendations = useMemo(
    () => buildRecommendations({ cart, menuItems: items, combos, rules }),
    [cart, items, combos, rules]
  )

  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  const addItem = (item: FoodosMenuItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.item_id === item.id)
      if (existing) {
        return prev.map((i) => (i.item_id === item.id ? { ...i, qty: i.qty + 1 } : i))
      }
      return [...prev, { item_id: item.id, name: item.name, price: item.price, qty: 1 }]
    })
  }

  const addCombo = (combo: FoodosCombo) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.combo_id === combo.id)
      if (existing) {
        return prev.map((i) => (i.combo_id === combo.id ? { ...i, qty: i.qty + 1 } : i))
      }
      return [
        ...prev,
        { item_id: combo.id, name: combo.name, price: combo.price, qty: 1, combo_id: combo.id },
      ]
    })
  }

  const addRecommendation = (rec: (typeof recommendations)[number]) => {
    if (rec.kind === "combo" && rec.combo) addCombo(rec.combo)
    else if (rec.item) addItem(rec.item)
  }

  const changeQty = (index: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((i, idx) => (idx === index ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    )
  }

  const removeItem = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index))
  }

  const submitOrder = async () => {
    setError(null)
    if (!customerName.trim() || customerPhone.replace(/\D/g, "").length < 10) {
      setError("Ingresa tu nombre y un teléfono válido (10 dígitos).")
      return
    }
    if (!branchId) {
      setError("Selecciona una sucursal.")
      return
    }

    setLoading(true)
    try {
      // Reintento tras un fallo al crear el intent: el pedido ya existe; no se
      // duplica, solo se reintenta inicializar el pago.
      if (paymentMethod === "card" && orderId) {
        setLoading(false)
        await submitCardPayment(orderId)
        return
      }

      const res = await fetch("/api/foodos/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          branch_id: branchId,
          items: cart,
          delivery_fee: deliveryFee,
          discount: 0,
          channel: "web",
          fulfillment,
          payment_method: paymentMethod === "card" ? "card" : null,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          note: note.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el pedido. Intenta de nuevo.")
        setLoading(false)
        return
      }

      setOrderId(data.orderId)
      setTotal(data.total)

      // Tarjeta → crear PaymentIntent (ruta dedicada) y mostrar el Stripe form.
      if (paymentMethod === "card") {
        await submitCardPayment(data.orderId)
        return
      }

      setCart([])
      setView("success")
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.")
      setLoading(false)
    }
  }

  /** Crea el PaymentIntent para un pedido foodos de tarjeta ya registrado. */
  const submitCardPayment = async (orderIdValue: string) => {
    setLoading(true)
    try {
      const intentRes = await fetch("/api/payments/stripe/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderIdValue,
          type: "foodos",
        }),
      })

      const intentData = await intentRes.json()
      if (!intentRes.ok || !intentData.clientSecret) {
        setError(
          intentData.error ?? "No se pudo inicializar el pago con Stripe."
        )
        setLoading(false)
        return
      }

      setClientSecret(intentData.clientSecret)
      setLoading(false)
    } catch (intentErr) {
      setError(
        intentErr instanceof Error
          ? intentErr.message
          : "Error al inicializar el pago."
      )
      setLoading(false)
    }
  }

  const handlePaymentSuccess = () => {
    setClientSecret(null)
    setCart([])
    setView("success")
  }

  if (view === "success" && orderId) {
    return <SuccessScreen restaurant={restaurant} orderId={orderId} />
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt={restaurant.name} width={44} height={44} className="w-11 h-11 rounded-full object-cover" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center font-black text-lg">
                {restaurant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="font-black text-stone-900 leading-tight">{restaurant.name}</h1>
              <p className="text-xs text-stone-500">{restaurant.description ?? "Pide en línea"}</p>
              <Link
                href="/comer"
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-600 mt-0.5"
              >
                <Compass className="w-3 h-3" /> hoyquecomemos.mx
              </Link>
            </div>
          </div>
          <button
            onClick={() => (cartCount ? setView("checkout") : setView("menu"))}
            className="relative flex items-center gap-2 px-4 py-2 rounded-full bg-stone-900 text-white text-sm font-semibold hover:bg-stone-700 transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>{cartCount}</span>
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 pb-32">
        {view === "menu" && (
          <MenuView
            categories={categories}
            items={items}
            combos={combos}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            onAddItem={addItem}
            onAddCombo={addCombo}
            cartCount={cartCount}
            onGoToCart={() => setView("checkout")}
          />
        )}

        {view === "checkout" && (
          <CheckoutView
            branches={branches}
            cart={cart}
            totals={totals}
            deliveryFee={deliveryFee}
            recommendations={recommendations}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerPhone={customerPhone}
            setCustomerPhone={setCustomerPhone}
            fulfillment={fulfillment}
            setFulfillment={setFulfillment}
            branchId={branchId}
            setBranchId={setBranchId}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            note={note}
            setNote={setNote}
            onChangeQty={changeQty}
            onRemoveItem={removeItem}
            onAddRecommendation={addRecommendation}
            onBack={() => setView("menu")}
            onSubmit={submitOrder}
            loading={loading}
            error={error}
          />
        )}

        {clientSecret && (
          <CardPaymentOverlay
            clientSecret={clientSecret}
            amount={total}
            onSuccess={handlePaymentSuccess}
            onCancel={() => setClientSecret(null)}
          />
        )}
      </div>
    </div>
  )
}
