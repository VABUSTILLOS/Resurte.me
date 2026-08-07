"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ShoppingBag,
  Plus,
  Minus,
  ArrowLeft,
  ArrowRight,
  MapPin,
  Bike,
  Store,
  CreditCard,
  Banknote,
  CheckCircle2,
  Sparkles,
  Trash2,
  Compass,
} from "lucide-react"
import {
  computeOrderTotals,
  formatMoney,
  buildRecommendations,
} from "@/lib/foodos"
import { StripeProvider } from "@/components/stripe/stripe-provider"
import { StripePaymentForm } from "@/components/stripe/stripe-payment-form"
import type {
  FoodosRestaurant,
  FoodosBranch,
  FoodosMenuCategory,
  FoodosMenuItem,
  FoodosCombo,
  FoodosUpsellRule,
  FoodosOrderItem,
} from "@/types/foodos"

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

      if (data.clientSecret) {
        setOrderId(data.orderId)
        setTotal(data.total)
        setClientSecret(data.clientSecret)
        setLoading(false)
        return
      }

      setOrderId(data.orderId)
      setTotal(data.total)
      setCart([])
      setView("success")
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.")
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
              <img src={restaurant.logo_url} alt={restaurant.name} className="w-11 h-11 rounded-full object-cover" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-amber-500 text-white flex items-center justify-center font-black text-lg">
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

      <main className="max-w-4xl mx-auto px-4 py-6 pb-32">
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
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function MenuView({
  categories,
  items,
  combos,
  selectedCategory,
  onSelectCategory,
  onAddItem,
  onAddCombo,
  cartCount,
  onGoToCart,
}: {
  categories: FoodosMenuCategory[]
  items: FoodosMenuItem[]
  combos: FoodosCombo[]
  selectedCategory: string | null
  onSelectCategory: (id: string | null) => void
  onAddItem: (item: FoodosMenuItem) => void
  onAddCombo: (combo: FoodosCombo) => void
  cartCount: number
  onGoToCart: () => void
}) {
  const featured = items.filter((i) => i.is_featured)
  const visibleCategories = selectedCategory
    ? categories.filter((c) => c.id === selectedCategory)
    : categories
  const uncategorized = selectedCategory === null ? items.filter((i) => !i.category_id) : []

  return (
    <div>
      {featured.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-black text-stone-900 mb-3">🔥 Favoritos</h2>
          <div className="grid gap-3">
            {featured.map((item) => (
              <ItemCard key={item.id} item={item} onAdd={() => onAddItem(item)} />
            ))}
          </div>
        </section>
      )}

      {combos.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-black text-stone-900 mb-3">🎁 Combos</h2>
          <div className="grid gap-3">
            {combos.map((combo) => (
              <div key={combo.id} className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-stone-900">{combo.name}</p>
                    {combo.highlight && (
                      <span className="text-[10px] bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full">+valor</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-emerald-600 mt-1">
                    {formatMoney(combo.price)}
                    {combo.discount_pct > 0 && (
                      <span className="ml-2 text-xs text-stone-400 line-through">
                        {formatMoney(combo.price + (combo.price * combo.discount_pct) / 100)}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => onAddCombo(combo)}
                  className="px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
                >
                  Agregar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Categorías */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
        <button
          onClick={() => onSelectCategory(null)}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            selectedCategory === null ? "bg-stone-900 text-white" : "bg-white text-stone-600 border border-stone-200"
          }`}
        >
          Todo
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelectCategory(c.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              selectedCategory === c.id ? "bg-stone-900 text-white" : "bg-white text-stone-600 border border-stone-200"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {visibleCategories.map((cat) => (
        <section key={cat.id} className="mb-8">
          <h2 className="text-lg font-black text-stone-900 mb-3">{cat.name}</h2>
          <div className="grid gap-3">
            {items
              .filter((i) => i.category_id === cat.id)
              .map((item) => (
                <ItemCard key={item.id} item={item} onAdd={() => onAddItem(item)} />
              ))}
          </div>
        </section>
      ))}

      {uncategorized.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-black text-stone-900 mb-3">Platillos</h2>
          <div className="grid gap-3">
            {uncategorized.map((item) => (
              <ItemCard key={item.id} item={item} onAdd={() => onAddItem(item)} />
            ))}
          </div>
        </section>
      )}

      {cartCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-stone-200">
          <div className="max-w-4xl mx-auto px-4 py-3 flex justify-end">
            <button
              onClick={onGoToCart}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-600 text-white font-bold hover:bg-emerald-700"
            >
              Ver pedido ({cartCount})
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemCard({ item, onAdd }: { item: FoodosMenuItem; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white border border-stone-200 rounded-2xl p-4">
      <div className="min-w-0 flex-1">
        {item.tags.length > 0 && (
          <div className="flex gap-1 mb-1">
            {item.tags.slice(0, 2).map((t) => (
              <span key={t} className="text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full capitalize">
                {t}
              </span>
            ))}
          </div>
        )}
        <p className="font-semibold text-stone-900 truncate">{item.name}</p>
        {item.description && (
          <p className="text-sm text-stone-500 line-clamp-2">{item.description}</p>
        )}
        <p className="text-sm font-bold text-stone-900 mt-1">{formatMoney(item.price)}</p>
      </div>
      {item.image_url ? (
        <div className="relative shrink-0">
          <img src={item.image_url} alt={item.name} className="w-20 h-20 rounded-xl object-cover" />
          <button
            onClick={onAdd}
            className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 shadow"
            aria-label={`Agregar ${item.name}`}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={onAdd}
          className="shrink-0 w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700"
          aria-label={`Agregar ${item.name}`}
        >
          <Plus className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function CheckoutView({
  branches,
  cart,
  totals,
  deliveryFee,
  recommendations,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  fulfillment,
  setFulfillment,
  branchId,
  setBranchId,
  paymentMethod,
  setPaymentMethod,
  note,
  setNote,
  onChangeQty,
  onRemoveItem,
  onAddRecommendation,
  onBack,
  onSubmit,
  loading,
  error,
}: {
  branches: FoodosBranch[]
  cart: FoodosOrderItem[]
  totals: { subtotal: number; discount: number; total: number }
  deliveryFee: number
  recommendations: ReturnType<typeof buildRecommendations>
  customerName: string
  setCustomerName: (v: string) => void
  customerPhone: string
  setCustomerPhone: (v: string) => void
  fulfillment: "pickup" | "delivery"
  setFulfillment: (v: "pickup" | "delivery") => void
  branchId: string | null
  setBranchId: (v: string) => void
  paymentMethod: "card" | "branch"
  setPaymentMethod: (v: "card" | "branch") => void
  note: string
  setNote: (v: string) => void
  onChangeQty: (index: number, delta: number) => void
  onRemoveItem: (index: number) => void
  onAddRecommendation: (rec: (typeof recommendations)[number]) => void
  onBack: () => void
  onSubmit: () => void
  loading: boolean
  error: string | null
}) {
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Volver al menú
      </button>

      <div className="grid md:grid-cols-5 gap-6">
        <div className="md:col-span-3 space-y-6">
          {/* Resumen del pedido */}
          <section className="bg-white border border-stone-200 rounded-2xl p-4">
            <h2 className="font-bold text-stone-900 mb-3">Tu pedido</h2>
            {cart.length === 0 ? (
              <p className="text-sm text-stone-500">Tu carrito está vacío.</p>
            ) : (
              <div className="space-y-3">
                {cart.map((item, idx) => (
                  <div key={`${item.item_id}-${idx}`} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-stone-900 truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <button onClick={() => onChangeQty(idx, -1)} className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center" aria-label="Menos">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-bold">{item.qty}</span>
                        <button onClick={() => onChangeQty(idx, 1)} className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center" aria-label="Más">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-stone-900">{formatMoney(item.price * item.qty)}</p>
                    <button onClick={() => onRemoveItem(idx)} className="text-stone-400 hover:text-red-600" aria-label="Quitar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Sugerencias cross-sell */}
          {recommendations.length > 0 && cart.length > 0 && (
            <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <h2 className="flex items-center gap-2 font-bold text-stone-900 mb-3">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Sugerencias para tu pedido
              </h2>
              <div className="space-y-2">
                {recommendations.map((rec) => {
                  const target = rec.kind === "combo" ? rec.combo : rec.item
                  if (!target) return null
                  return (
                    <div key={`${rec.kind}-${target.id}`} className="flex items-center justify-between gap-2 bg-white rounded-xl p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-900 truncate">{target.name}</p>
                        <p className="text-xs text-stone-500">{rec.offerText}</p>
                      </div>
                      <button
                        onClick={() => onAddRecommendation(rec)}
                        className="shrink-0 px-3 py-1.5 rounded-full bg-stone-900 text-white text-xs font-bold hover:bg-stone-700"
                      >
                        Agregar
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Datos del cliente */}
          <section className="bg-white border border-stone-200 rounded-2xl p-4">
            <h2 className="font-bold text-stone-900 mb-3">Tus datos</h2>
            <div className="grid gap-3">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre completo"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Teléfono (10 dígitos)"
                inputMode="tel"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Notas (opcional): sin cebolla, bien cocido, etc."
                rows={2}
                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </section>

          {/* Entrega */}
          <section className="bg-white border border-stone-200 rounded-2xl p-4">
            <h2 className="font-bold text-stone-900 mb-3">Entrega</h2>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => setFulfillment("pickup")}
                className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 text-sm font-semibold ${
                  fulfillment === "pickup" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                }`}
              >
                <Store className="w-5 h-5" />
                Para llevar
              </button>
              <button
                onClick={() => setFulfillment("delivery")}
                className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 text-sm font-semibold ${
                  fulfillment === "delivery" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                }`}
              >
                <Bike className="w-5 h-5" />
                A domicilio
              </button>
            </div>

            {branches.length > 0 && (
              <div className="grid gap-2">
                {branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBranchId(b.id)}
                    className={`flex items-center justify-between rounded-xl p-3 border-2 text-left ${
                      branchId === b.id ? "border-emerald-500 bg-emerald-50" : "border-stone-200"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-stone-900">{b.name}</p>
                      {b.address && (
                        <p className="text-xs text-stone-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {b.address}
                        </p>
                      )}
                    </div>
                    {fulfillment === "delivery" && b.delivery_fee > 0 && (
                      <span className="text-xs font-bold text-stone-600">{formatMoney(b.delivery_fee)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Pago */}
          <section className="bg-white border border-stone-200 rounded-2xl p-4">
            <h2 className="font-bold text-stone-900 mb-3">Pago</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMethod("branch")}
                className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 text-sm font-semibold ${
                  paymentMethod === "branch" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                }`}
              >
                <Banknote className="w-5 h-5" />
                Pagar en sucursal
              </button>
              <button
                onClick={() => setPaymentMethod("card")}
                className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 text-sm font-semibold ${
                  paymentMethod === "card" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                }`}
              >
                <CreditCard className="w-5 h-5" />
                Tarjeta
              </button>
            </div>
          </section>
        </div>

        {/* Resumen */}
        <div className="md:col-span-2">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 sticky top-24">
            <h2 className="font-bold text-stone-900 mb-3">Resumen</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal</span>
                <span>{formatMoney(totals.subtotal)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="flex justify-between text-stone-600">
                  <span>Envío</span>
                  <span>{formatMoney(deliveryFee)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-black text-stone-900 pt-2 border-t border-stone-200">
                <span>Total</span>
                <span>{formatMoney(totals.total)}</span>
              </div>
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
            )}

            <button
              onClick={onSubmit}
              disabled={loading || cart.length === 0}
              className="mt-4 w-full py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creando pedido...
                </>
              ) : (
                <>
                  Confirmar pedido
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <p className="mt-2 text-[11px] text-stone-400 text-center">
              Pedidos gestionados con Resurte.me
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function CardPaymentOverlay({
  clientSecret,
  amount,
  onSuccess,
  onCancel,
}: {
  clientSecret: string
  amount: number
  onSuccess: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
        <h2 className="font-black text-stone-900 text-lg mb-1">Pago con tarjeta</h2>
        <p className="text-sm text-stone-500 mb-4">Total a pagar: {formatMoney(amount)}</p>
        <StripeProvider clientSecret={clientSecret}>
          <StripePaymentForm amount={amount} onSuccess={onSuccess} onBack={onCancel} />
        </StripeProvider>
      </div>
    </div>
  )
}

function SuccessScreen({ restaurant, orderId }: { restaurant: FoodosRestaurant; orderId: string }) {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="bg-white border border-stone-200 rounded-3xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-black text-stone-900">¡Pedido recibido!</h1>
        <p className="text-stone-500 mt-2">
          Tu orden fue enviada a <strong>{restaurant.name}</strong>. Te contactarán por WhatsApp para confirmar la entrega.
        </p>
        <p className="text-sm text-stone-400 mt-4">Referencia: #{orderId.slice(0, 8).toUpperCase()}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 w-full py-3 rounded-xl bg-stone-900 text-white font-bold hover:bg-stone-700"
        >
          Volver al menú
        </button>
      </div>
    </div>
  )
}
