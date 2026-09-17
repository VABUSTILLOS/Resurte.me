"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import dynamic from "next/dynamic"
import Link from "next/link"
import Script from "next/script"
import { BookOpen, Compass, PartyPopper, ShoppingBag } from "lucide-react"
import { detectStorefrontLang, sf, type StorefrontLang } from "@/lib/foodos-i18n"
import { useScrollDirection } from "@/hooks/use-scroll-direction"
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
  FoodosReview,
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
  reviews: FoodosReview[]
  /** Hay paquetes de catering activos; sin ellos la página pública da 404. */
  hasCatering: boolean
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
  reviews,
  hasCatering,
}: Props) {
  const [cart, setCart] = useState<FoodosOrderItem[]>([])
  const [view, setView] = useState<View>("menu")
  // Auto-hide: el header del storefront se oculta al bajar y reaparece al
  // subir; el carrito sigue accesible por la barra inferior fija.
  const headerHidden = useScrollDirection() === "down"
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [optionsItem, setOptionsItem] = useState<FoodosMenuItem | null>(null)

  // Idioma del storefront (es/en), persistido por restaurante
  const [lang, setLang] = useState<StorefrontLang>(() => detectStorefrontLang(restaurant.slug))
  const changeLang = (next: StorefrontLang) => {
    setLang(next)
    try { localStorage.setItem(`foodos-lang-${restaurant.slug}`, next) } catch { /* privado */ }
  }

  // Wishlist local por restaurante (favoritos del comensal)
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set()
    try {
      return new Set(JSON.parse(localStorage.getItem(`foodos-favs-${restaurant.slug}`) ?? "[]") as string[])
    } catch {
      return new Set()
    }
  })
  const toggleFavorite = (itemId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      try {
        localStorage.setItem(`foodos-favs-${restaurant.slug}`, JSON.stringify([...next]))
      } catch { /* storage lleno o privado */ }
      return next
    })
  }

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
  // Reorden: /r/[slug]?reorden=<orderId> repuebla el carrito desde ese pedido.
  const [reorderId] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("reorden")
  )
  const [reorderLoaded, setReorderLoaded] = useState(false)
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery" | "dine_in">(
    mesaParam ? "dine_in" : "pickup"
  )
  const [tableNumber, setTableNumber] = useState(mesaParam ?? "")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [deliveryNotes, setDeliveryNotes] = useState("")
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

  // Lealtad: puntos y crédito del cliente (se consulta al capturar teléfono)
  const [loyalty, setLoyalty] = useState<{ active: boolean; points: number; credit: number; points_value: number } | null>(null)
  const [redeemPoints, setRedeemPoints] = useState(false)
  const [useCredit, setUseCredit] = useState(false)

  // Pedido programado (si la sucursal lo permite)
  const [scheduledDate, setScheduledDate] = useState("")
  const [scheduledTime, setScheduledTime] = useState("")

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

  // Descuento total = cupón + puntos canjeados + crédito (tope: subtotal).
  const loyaltyDiscount = useMemo(() => {
    if (!loyalty?.active) return 0
    const afterCoupon = cartSubtotal - (appliedCoupon?.discount ?? 0)
    let d = 0
    if (redeemPoints) d += Math.min(loyalty.points_value, afterCoupon)
    if (useCredit) d += Math.min(loyalty.credit, afterCoupon - d)
    return Math.max(0, d)
  }, [loyalty, redeemPoints, useCredit, cartSubtotal, appliedCoupon])

  const totals = useMemo(
    () => computeOrderTotals(cart, deliveryFee, (appliedCoupon?.discount ?? 0) + loyaltyDiscount, tipAmount),
    [cart, deliveryFee, appliedCoupon, loyaltyDiscount, tipAmount]
  )

  const recommendations = useMemo(
    () => buildRecommendations({ cart, menuItems: items, combos, rules }),
    [cart, items, combos, rules]
  )

  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  // Carga diferida del reorden: trae el pedido y mapea sus líneas al menú
  // actual (precios vigentes; se omiten ítems que ya no existen).
  useEffect(() => {
    if (!reorderId || reorderLoaded) return
    let cancelled = false
    fetch(`/api/foodos/orders/${reorderId}/track?slug=${encodeURIComponent(restaurant.slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.items) return
        const lines: FoodosOrderItem[] = []
        for (const line of data.items as FoodosOrderItem[]) {
          if (line.combo_id) {
            const combo = combos.find((c) => c.id === line.combo_id && c.is_active)
            if (combo) lines.push({ item_id: combo.id, name: combo.name, price: combo.price, qty: line.qty, combo_id: combo.id })
            continue
          }
          const menuItem = items.find((i) => i.id === line.item_id && i.is_available)
          if (!menuItem) continue
          const mods = (line.modifiers ?? []).filter((m) =>
            optionValues.some((v) => v.id === m.value_id && v.is_available)
          )
          lines.push({
            item_id: menuItem.id,
            name: menuItem.name,
            price: unitPriceWithModifiers(menuItem.price, mods),
            qty: line.qty,
            modifiers: mods.length ? mods : undefined,
          })
        }
        if (lines.length) setCart(lines)
        setReorderLoaded(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [reorderId, reorderLoaded, restaurant.slug, items, combos, optionValues])

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
    if (fulfillment === "delivery" && deliveryAddress.trim().length < 5) {
      setError(sf(lang, "deliveryAddressRequired"))
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
          delivery_address: fulfillment === "delivery" ? deliveryAddress.trim() : null,
          delivery_notes: fulfillment === "delivery" ? deliveryNotes.trim() || null : null,
          coupon_code: appliedCoupon?.code ?? null,
          tip: tipAmount,
          redeem_points: redeemPoints,
          use_credit: useCredit,
          scheduled_for:
            scheduledDate && scheduledTime
              ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
              : null,
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
            deliveryAddress: fulfillment === "delivery" ? deliveryAddress.trim() || null : null,
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

  /** Al capturar teléfono válido, consulta puntos/crédito del cliente. */
  const handlePhoneChange = (v: string) => {
    setCustomerPhone(v)
    const digits = v.replace(/\D/g, "")
    if (digits.length >= 10) {
      fetch(`/api/foodos/loyalty?restaurant_id=${restaurant.id}&phone=${digits}`)
        .then((r) => r.json())
        .then((d) => setLoyalty(d))
        .catch(() => {})
    } else {
      setLoyalty(null)
      setRedeemPoints(false)
      setUseCredit(false)
    }
  }

  const applyCoupon = async () => {    if (!couponInput.trim()) return
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

      {/* Pixels de marketing del restaurante (opcionales) */}
      {restaurant.meta_pixel_id && (
        <Script id={`meta-pixel-${restaurant.id}`} strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${restaurant.meta_pixel_id}'); fbq('track', 'PageView');`}
        </Script>
      )}
      {restaurant.tiktok_pixel_id && (
        <Script id={`tiktok-pixel-${restaurant.id}`} strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.load=function(e){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
ttq._o=ttq._o||{};ttq._o[e]={};var o=document.createElement("script");o.type="text/javascript";
o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];
a.parentNode.insertBefore(o,a)};ttq.load('${restaurant.tiktok_pixel_id}');ttq.page();}(window,document,'ttq');`}
        </Script>
      )}
      {/* Header */}
      <header
        className="bg-white border-b border-stone-200 sticky top-0 z-30 transition-transform duration-300 motion-reduce:transition-none"
        style={{ transform: headerHidden ? "translateY(-100%)" : undefined }}
      >
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
              <p className="text-xs text-stone-500">{restaurant.description ?? sf(lang, "orderOnline")}</p>
              <Link
                href="/comer"
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-600 mt-0.5"
              >
                <Compass className="w-3 h-3" /> hoyquecomemos.mx
              </Link>
              <Link
                href={`/r/${restaurant.slug}/carta`}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-500 hover:text-stone-700 mt-0.5 ml-2"
              >
                <BookOpen className="w-3 h-3" /> {sf(lang, "fullMenu")}
              </Link>
              {hasCatering && (
                <Link
                  href={`/r/${restaurant.slug}/catering`}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 hover:text-amber-600 mt-0.5 ml-2"
                >
                  <PartyPopper className="w-3 h-3" /> {sf(lang, "cateringViewPackages")}
                </Link>
              )}
            </div>
          </div>
          <button
            onClick={() => changeLang(lang === "es" ? "en" : "es")}
            className="px-3 py-2 rounded-full bg-white border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50"
            aria-label="Cambiar idioma / Switch language"
          >
            {lang === "es" ? "EN" : "ES"}
          </button>
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
        {reorderLoaded && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-sm text-emerald-800 font-semibold text-center">
            🔁 {lang === "es" ? "Cargamos tu pedido anterior al carrito" : "We loaded your previous order into the cart"}
          </div>
        )}
        {!openStatus.isOpen && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800 font-semibold text-center">
            🕐 {openStatus.nextOpenLabel ?? (lang === "es" ? "Cerrado por ahora" : "Closed for now")} — {sf(lang, "closedBanner")}
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
            reviews={reviews}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            lang={lang}
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
            setCustomerPhone={handlePhoneChange}
            fulfillment={fulfillment}
            setFulfillment={setFulfillment}
            tableNumber={tableNumber}
            setTableNumber={setTableNumber}
            deliveryAddress={deliveryAddress}
            setDeliveryAddress={setDeliveryAddress}
            deliveryNotes={deliveryNotes}
            setDeliveryNotes={setDeliveryNotes}
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
            loyalty={loyalty}
            redeemPoints={redeemPoints}
            setRedeemPoints={setRedeemPoints}
            useCredit={useCredit}
            setUseCredit={setUseCredit}
            scheduledDate={scheduledDate}
            setScheduledDate={setScheduledDate}
            scheduledTime={scheduledTime}
            setScheduledTime={setScheduledTime}
            transferAvailable={Boolean(restaurant.transfer_clabe)}
            onChangeQty={changeQty}
            onRemoveItem={removeItem}
            onAddRecommendation={addRecommendation}
            onBack={() => setView("menu")}
            onSubmit={submitOrder}
            openStatus={openStatus}
            loading={loading}
            error={error}
            lang={lang}
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

        {clientSecret && orderId && (
          <CardPaymentOverlay
            clientSecret={clientSecret}
            amount={total}
            orderId={orderId}
            slug={restaurant.slug}
            // Stripe devuelve aquí al cliente en los métodos que salen del
            // navegador (CoDi, 3DS). La página de seguimiento ya consulta el
            // estado real del pedido, así que es el destino correcto.
            returnUrl={
              typeof window === "undefined"
                ? ""
                : `${window.location.origin}/r/${restaurant.slug}/pedido/${orderId}`
            }
            onSuccess={handlePaymentSuccess}
            onCancel={() => setClientSecret(null)}
          />
        )}
      </div>
    </div>
  )
}
