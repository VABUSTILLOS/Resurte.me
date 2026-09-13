"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Compass, ShoppingBag } from "lucide-react"
import {
  computeOrderTotals,
  buildRecommendations,
  buildWhatsAppOrderLink,
  buildWhatsAppOrderMessage,
  cartLineKey,
  getOpenStatus,
  unitPriceWithModifiers,
  type OpenStatus,
} from "@/lib/foodos"
import type {
  FoodosRestaurant,
  FoodosBranch,
  FoodosMenuCategory,
  FoodosMenuItem,
  FoodosCombo,
  FoodosUpsellRule,
  FoodosOrderItem,
  FoodosOrderItemModifier,
  FoodosItemOptionGroup,
  FoodosItemOptionValue,
  FoodosBranchHours,
  FoodosBranchMenuOverride,
} from "@/types/foodos"
import { MenuView } from "./_components/menu-view"
import { CheckoutView } from "./_components/checkout-view"
import { SuccessScreen } from "./_components/success-screen"
import { ItemOptionsModal } from "./_components/item-options-modal"

// Stripe libs are heavy and only needed when the customer pays by card.
const CardPaymentOverlay = dynamic(
  () =>
    import("./_components/card-payment-overlay").then(
      (m) => m.CardPaymentOverlay,
    ),
  { ssr: false },
)

type View = "menu" | "checkout" | "success"

interface Props {
  restaurant: FoodosRestaurant
  branches: FoodosBranch[]
  categories: FoodosMenuCategory[]
  items: FoodosMenuItem[]
  combos: FoodosCombo[]
  rules: FoodosUpsellRule[]
  optionGroups: FoodosItemOptionGroup[]
  optionValues: FoodosItemOptionValue[]
  branchHours: FoodosBranchHours[]
  overrides: FoodosBranchMenuOverride[]
}

export function FoodosStorefront({
  restaurant,
  branches,
  categories,
  items,
  combos,
  rules,
  optionGroups,
  optionValues,
  branchHours,
  overrides,
}: Props) {
  const [cart, setCart] = useState<FoodosOrderItem[]>([])
  const [view, setView] = useState<View>("menu")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [optionsItem, setOptionsItem] = useState<FoodosMenuItem | null>(null)

  // Checkout state
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  // QR por mesa: /r/[slug]?mesa=N abre directo en modo dine-in. Se lee en el
  // inicializador (solo cliente); no afecta el primer render (vista "menú").
  const [mesaParam] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("mesa")
  )
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery" | "dine_in">(
    mesaParam ? "dine_in" : "pickup"
  )
  const [tableNumber, setTableNumber] = useState(mesaParam ?? "")
  const [branchId, setBranchId] = useState<string | null>(branches[0]?.id ?? null)
  const [paymentMethod, setPaymentMethod] = useState<"card" | "branch" | "whatsapp" | "transfer">("branch")
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cupón y propina
  const [couponInput, setCouponInput] = useState("")
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [tipPct, setTipPct] = useState<0 | 10 | 15 | "custom">(0)
  const [customTip, setCustomTip] = useState("")

  // Stripe flow
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const deliveryFee = useMemo(() => {
    if (fulfillment !== "delivery") return 0
    const branch = branches.find((b) => b.id === branchId)
    return branch?.delivery_fee ?? 0
  }, [fulfillment, branchId, branches])

  // Horario de la sucursal seleccionada (bloquea el checkout si está cerrada).
  const openStatus: OpenStatus = useMemo(() => {
    const hours = branchHours.filter((h) => h.branch_id === branchId)
    return getOpenStatus(hours, restaurant.timezone)
  }, [branchHours, branchId, restaurant.timezone])

  // Overrides por sucursal: precio y disponibilidad efectivos del menú.
  const branchOverrides = useMemo(
    () => new Map(overrides.filter((o) => o.branch_id === branchId).map((o) => [o.item_id, o])),
    [overrides, branchId]
  )
  const effectivePrice = (item: FoodosMenuItem) => {
    const override = branchOverrides.get(item.id)
    return override?.price ?? item.price
  }
  const isAvailableAtBranch = (itemId: string) =>
    branchOverrides.get(itemId)?.is_available !== false

  /** Cambio de sucursal: re-precia el carrito y quita ítems no disponibles. */
  const handleSelectBranch = (id: string) => {
    setBranchId(id)
    const nextOverrides = new Map(overrides.filter((o) => o.branch_id === id).map((o) => [o.item_id, o]))
    setCart((prev) =>
      prev
        .filter((line) => line.combo_id || nextOverrides.get(line.item_id)?.is_available !== false)
        .map((line) => {
          if (line.combo_id) return line
          const menuItem = items.find((i) => i.id === line.item_id)
          if (!menuItem) return line
          const base = nextOverrides.get(line.item_id)?.price ?? menuItem.price
          return { ...line, price: unitPriceWithModifiers(base, line.modifiers) }
        })
    )
  }

  const cartSubtotal = useMemo(
    () => cart.reduce((sum, i) => sum + i.price * i.qty, 0),
    [cart]
  )

  const tipAmount = useMemo(() => {
    if (tipPct === "custom") return Math.min(Math.max(Number(customTip) || 0, 0), cartSubtotal)
    return (cartSubtotal * tipPct) / 100
  }, [tipPct, customTip, cartSubtotal])

  const totals = useMemo(
    () => computeOrderTotals(cart, deliveryFee, appliedCoupon?.discount ?? 0, tipAmount),
    [cart, deliveryFee, appliedCoupon, tipAmount]
  )

  const recommendations = useMemo(
    () => buildRecommendations({ cart, menuItems: items, combos, rules }),
    [cart, items, combos, rules]
  )

  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  const itemHasOptions = (itemId: string) =>
    optionGroups.some((g) => g.item_id === itemId)

  const addItem = (item: FoodosMenuItem) => {
    if (itemHasOptions(item.id)) {
      setOptionsItem(item)
      return
    }
    pushCartLine({ item_id: item.id, name: item.name, price: effectivePrice(item), qty: 1 })
  }

  const addItemWithModifiers = (modifiers: FoodosOrderItemModifier[]) => {
    if (!optionsItem) return
    pushCartLine({
      item_id: optionsItem.id,
      name: optionsItem.name,
      price: unitPriceWithModifiers(effectivePrice(optionsItem), modifiers),
      qty: 1,
      modifiers: modifiers.length ? modifiers : undefined,
    })
    setOptionsItem(null)
  }

  /** Agrega una línea fusionando con la existente (mismo ítem + mismos modificadores). */
  const pushCartLine = (line: FoodosOrderItem) => {
    setCart((prev) => {
      const key = cartLineKey(line)
      const existing = prev.find((i) => cartLineKey(i) === key)
      if (existing) {
        return prev.map((i) =>
          cartLineKey(i) === key ? { ...i, qty: i.qty + line.qty } : i
        )
      }
      return [...prev, line]
    })
  }

  const addCombo = (combo: FoodosCombo) => {
    pushCartLine({
      item_id: combo.id,
      name: combo.name,
      price: combo.price,
      qty: 1,
      combo_id: combo.id,
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
    if (fulfillment === "dine_in" && !tableNumber.trim()) {
      setError("Indica tu número de mesa.")
      return
    }
    if (!openStatus.isOpen) {
      setError(openStatus.nextOpenLabel ?? "Esta sucursal está cerrada por ahora.")
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
          channel: paymentMethod === "whatsapp" ? "whatsapp" : tableNumber ? "qr" : "web",
          fulfillment,
          payment_method:
            paymentMethod === "card" ? "card" : paymentMethod === "transfer" ? "transfer" : null,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          note: note.trim() || null,
          table_number: fulfillment === "dine_in" ? tableNumber.trim() : null,
          coupon_code: appliedCoupon?.code ?? null,
          tip: tipAmount,
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

      // WhatsApp (flujo take.app): abrir chat del restaurante con el pedido
      // estructurado; el pedido ya quedó registrado con canal "whatsapp".
      if (paymentMethod === "whatsapp") {
        const branch = branches.find((b) => b.id === branchId)
        if (branch?.phone) {
          const message = buildWhatsAppOrderMessage({
            orderRef: String(data.orderId).slice(0, 8).toUpperCase(),
            restaurantName: restaurant.name,
            items: cart,
            subtotal: totals.subtotal,
            deliveryFee,
            discount: totals.discount,
            tip: totals.tip,
            total: data.total,
            fulfillment,
            tableNumber: fulfillment === "dine_in" ? tableNumber.trim() : null,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            note: note.trim() || null,
          })
          window.open(buildWhatsAppOrderLink(branch.phone, message), "_blank", "noopener")
        }
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

  const applyCoupon = async () => {
    if (!couponInput.trim()) return
    setCouponLoading(true)
    setCouponError(null)
    try {
      const res = await fetch("/api/foodos/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          code: couponInput.trim(),
          subtotal: cartSubtotal,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.valid) {
        setAppliedCoupon(null)
        setCouponError(data.error ?? "Cupón no válido")
      } else {
        setAppliedCoupon({ code: data.code, discount: data.discount })
      }
    } catch {
      setCouponError("No se pudo validar el cupón. Intenta de nuevo.")
    } finally {
      setCouponLoading(false)
    }
  }

  if (view === "success" && orderId) {
    return (
      <SuccessScreen
        restaurant={restaurant}
        orderId={orderId}
        showTransfer={paymentMethod === "transfer"}
      />
    )
  }

  const accent = restaurant.theme_color || "#059669"

  return (
    <div
      className="min-h-screen bg-stone-50"
      style={{ "--foodos-accent": accent } as React.CSSProperties}
    >
      <style>{`.foodos-accent { background-color: var(--foodos-accent) !important; }
.foodos-accent:hover { filter: brightness(0.92); }
.foodos-accent-text { color: var(--foodos-accent) !important; }`}</style>
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {restaurant.logo_url ? (
              <Image src={restaurant.logo_url} alt={restaurant.name} width={44} height={44} className="w-11 h-11 rounded-full object-cover" />
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
        {!openStatus.isOpen && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800 font-semibold text-center">
            🕐 {openStatus.nextOpenLabel ?? "Cerrado por ahora"} — puedes ver el menú, pero no pedir.
          </div>
        )}
        {view === "menu" && (
          <MenuView
            categories={categories}
            items={items.filter((i) => isAvailableAtBranch(i.id))}
            combos={combos}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            onAddItem={addItem}
            onAddCombo={addCombo}
            cartCount={cartCount}
            onGoToCart={() => setView("checkout")}
            itemHasOptions={itemHasOptions}
            priceFor={effectivePrice}
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
            tableNumber={tableNumber}
            setTableNumber={setTableNumber}
            branchId={branchId}
            setBranchId={handleSelectBranch}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            note={note}
            setNote={setNote}
            couponInput={couponInput}
            setCouponInput={setCouponInput}
            appliedCoupon={appliedCoupon}
            couponError={couponError}
            couponLoading={couponLoading}
            onApplyCoupon={applyCoupon}
            onRemoveCoupon={() => setAppliedCoupon(null)}
            tipPct={tipPct}
            setTipPct={setTipPct}
            customTip={customTip}
            setCustomTip={setCustomTip}
            transferAvailable={Boolean(restaurant.transfer_clabe)}
            onChangeQty={changeQty}
            onRemoveItem={removeItem}
            onAddRecommendation={addRecommendation}
            onBack={() => setView("menu")}
            onSubmit={submitOrder}
            openStatus={openStatus}
            loading={loading}
            error={error}
          />
        )}

        {optionsItem && (
          <ItemOptionsModal
            item={optionsItem}
            groups={optionGroups}
            values={optionValues}
            onConfirm={addItemWithModifiers}
            onClose={() => setOptionsItem(null)}
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
