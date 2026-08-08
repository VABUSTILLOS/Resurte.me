"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useCart } from "@/contexts/cart-context"
import { useCity } from "@/contexts/city-context"
import { createClient } from "@/lib/supabase/client"
import {
  X,
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
} from "lucide-react"
import type { Address } from "@/types"
import {
  getGuestToken,
  saveGuestToken,
  getLastAddress,
  saveLastAddress,
  claimGuestAddresses,
} from "@/lib/guest-address"
import { validDeliveryFee, calcCouponDiscount } from "@/lib/checkout-config"
import {
  DEFAULT_ADDRESS_FORM,
  DELIVERY_TIMES,
  getNextDays,
  type AddressForm,
  type ScheduleForm,
} from "@/components/checkout/checkout-shared"
import { AddressStep } from "@/components/checkout/AddressStep"
import { ScheduleStep } from "@/components/checkout/ScheduleStep"
import { FreeShippingProgress } from "@/components/cart/FreeShippingProgress"
import { BumpCards, type SelectedBump } from "@/components/checkout/BumpCards"
import { StripeProvider } from "@/components/stripe/stripe-provider"
import { StripePaymentForm } from "@/components/stripe/stripe-payment-form"

// Evento global para abrir el checkout del drawer (misma mecánica que
// CART_DRAWER_EVENT). Lo dispara el botón "Ir a Checkout" del CartDrawer.
export const CHECKOUT_DRAWER_EVENT = "resurte:toggle-checkout-drawer"

// Evento disparado cuando el pago principal se confirma. El UpsellModal
// (todo upsell-modal) lo escucha para interceptar la navegación; si nadie
// lo maneja, el drawer navega a la confirmación.
export const ORDER_PAID_EVENT = "resurte:order-paid"

type DrawerStep = "review" | "address" | "schedule" | "bumps" | "payment"

/**
 * Checkout completo dentro del drawer (mecánica SamCart/ThriveCart).
 *
 * Sustituye la navegación a /{city}/checkout: el cliente revisa su carrito,
 * ve la barra de envío gratis, elige dirección + horario, agrega hasta 3
 * order bumps condicionales y paga con Stripe sin salir de la página.
 *
 * Retrocompatible: la ruta /{city}/checkout sigue funcionando como fallback.
 * Si el checkout no puede abrirse o Stripe no está configurado, el usuario
 * siempre tiene la alternativa de pagar en la página completa.
 */
export function CheckoutDrawer() {
  const { cart, itemCount, subtotal, clearCart, coupon } = useCart()
  const { city } = useCity()
  const router = useRouter()

  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<DrawerStep>("review")
  const [address, setAddress] = useState<AddressForm>(DEFAULT_ADDRESS_FORM)
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [schedule, setSchedule] = useState<ScheduleForm>({
    date: getNextDays()[0]?.value ?? "",
    time: DELIVERY_TIMES[2] ?? "12:00 PM — 2:00 PM",
  })
  const [selectedBumps, setSelectedBumps] = useState<SelectedBump[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [saveCardConsent, setSaveCardConsent] = useState(false)
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null)
  const [showStripeForm, setShowStripeForm] = useState(false)
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null)
  const [earnedCashback, setEarnedCashback] = useState<{
    credits: number
    tier: string | null
  } | null>(null)

  // Estado de sesión + direcciones guardadas (misma lógica que el checkout)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null)
  // Guardar la dirección como predeterminada (checkbox en AddressStep, logged-in)
  const [saveAsDefault, setSaveAsDefault] = useState(false)

  // ── Apertura / cierre del drawer ──
  useEffect(() => {
    const handler = (event: Event) => {
      // Los bumps seleccionados en el cross-sell del CartDrawer viajan en
      // detail.bumps; sin detail se conserva el comportamiento retrocompatible
      // (se inician vacíos). Se valida la forma para no aceptar basura.
      const detail = (event as CustomEvent<{ bumps?: unknown }>).detail
      const incomingBumps = Array.isArray(detail?.bumps)
        ? (detail.bumps as SelectedBump[]).filter(
            (b) =>
              b &&
              typeof b.ruleId === "number" &&
              typeof b.productId === "number" &&
              typeof b.quantity === "number" &&
              b.quantity > 0 &&
              typeof b.unitPrice === "number"
          )
        : []
      setIsOpen((prev) => {
        const next = !prev
        if (next) {
          setStep("review")
          setCheckoutError(null)
          setShowStripeForm(false)
          setStripeClientSecret(null)
          setSelectedBumps(incomingBumps)
          setSaveAsDefault(false)
        }
        return next
      })
    }
    window.addEventListener(CHECKOUT_DRAWER_EVENT, handler)
    return () => window.removeEventListener(CHECKOUT_DRAWER_EVENT, handler)
  }, [])

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  // ── Sesión + precarga de dirección anónima ──
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      const loggedIn = !!data.user
      setIsLoggedIn(loggedIn)
      if (!loggedIn) {
        const last = getLastAddress()
        if (last) {
          setAddress((prev) => ({
            ...prev,
            label: last.label ?? prev.label,
            street: last.street ?? prev.street,
            number: last.number ?? prev.number,
            interior: last.interior ?? prev.interior,
            neighborhood: last.neighborhood ?? prev.neighborhood,
            zip_code: last.zip_code ?? prev.zip_code,
            references: last.references ?? prev.references,
          }))
          setPhone((prev) => last.phone ?? prev)
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (isLoggedIn !== true) return
    let cancelled = false
    const supabase = createClient()
    if (!supabase) return
    claimGuestAddresses()
    supabase
      .from("addresses")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error && data) {
          const rows = data as Address[]
          setSavedAddresses(rows)
          // Auto-selección: predeterminada o la más reciente; autocompleta el
          // formulario para que "Continuar al envío" pueda saltar al horario.
          const preferred = rows.find((a) => a.is_default) ?? rows[0]
          setSelectedAddressId(preferred?.id ?? null)
          if (preferred) {
            setAddress({
              label: preferred.label,
              street: preferred.street,
              number: preferred.number,
              interior: preferred.interior ?? "",
              neighborhood: preferred.neighborhood,
              zip_code: preferred.zip_code,
              references: preferred.references ?? "",
            })
          }
        }
      })
    return () => {
      cancelled = true
    }
  }, [isLoggedIn])

  // ── Totales en tiempo real (subtotal pagable + bumps seleccionados) ──
  // El descuento de cupón se calcula sobre el subtotal CON bumps incluidos,
  // igual que el servidor en POST /api/orders — así el total coincide a 0.01.
  const bumpsSubtotal = selectedBumps.reduce((sum, b) => sum + b.unitPrice * b.quantity, 0)
  const effectiveSubtotal = subtotal + bumpsSubtotal
  const discountAmount = calcCouponDiscount(effectiveSubtotal, coupon)
  const payableSubtotal = effectiveSubtotal - discountAmount
  const allItemsCount = itemCount + selectedBumps.length
  const deliveryFee = validDeliveryFee(allItemsCount, payableSubtotal, 35)
  const total = payableSubtotal + deliveryFee

  const isAddressValid = Boolean(
    address.street.trim() &&
      address.number.trim() &&
      address.neighborhood.trim() &&
      address.zip_code.trim().length >= 5
  )

  // Dirección guardada actualmente seleccionada (para el badge de ScheduleStep
  // y para decidir si el formulario no fue editado → reutilizar address_id).
  const selectedSavedAddress =
    savedAddresses.find((a) => a.id === selectedAddressId) ?? null

  // El formulario coincide exactamente con la dirección guardada seleccionada:
  // solo entonces se reutiliza address_id (en lugar de crear/editar una nueva).
  const selectedAddressUnedited =
    selectedSavedAddress !== null &&
    selectedSavedAddress.street === address.street &&
    selectedSavedAddress.number === address.number &&
    (selectedSavedAddress.interior ?? "") === address.interior &&
    selectedSavedAddress.neighborhood === address.neighborhood &&
    selectedSavedAddress.zip_code === address.zip_code &&
    (selectedSavedAddress.references ?? "") === address.references

  // ── Captura de lead onBlur (fire-and-forget, fail-open) ──
  const captureLead = useCallback((value: string) => {
    const cleaned = value.trim()
    if (!cleaned) return
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(cleaned)) return
    void fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: cleaned,
        phone: phone.trim() || undefined,
        source: "checkout_drawer",
        coupon_code: coupon?.code ?? undefined,
      }),
    }).catch(() => {
      // Fail-open: nunca bloquear el checkout por captura de leads
    })
  }, [phone, coupon?.code])

  // ── Creación de orden + PaymentIntent (misma lógica que el checkout page) ──
  const initializeCardPayment = async (
    orderId: number,
    cashback: { credits: number; tier: string | null } | null
  ) => {
    setCreatedOrderId(orderId)
    setEarnedCashback(cashback)
    try {
      const guestToken = isLoggedIn === false ? getGuestToken() ?? undefined : undefined
      const intentResponse = await fetch("/api/payments/stripe/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          type: "main",
          save_card: saveCardConsent,
          ...(guestToken ? { guest_token: guestToken } : {}),
          ...(email.trim() ? { customer_email: email.trim() } : {}),
        }),
      })
      const intentData = await intentResponse.json()
      if (!intentResponse.ok || !intentData.clientSecret) {
        setCheckoutError(
          intentData.error || "No se pudo inicializar el pago con Stripe."
        )
        setIsProcessing(false)
        return
      }
      setStripeClientSecret(intentData.clientSecret)
      setShowStripeForm(true)
      setIsProcessing(false)
    } catch (intentErr) {
      setCheckoutError(
        intentErr instanceof Error ? intentErr.message : "Error de conexión al inicializar el pago."
      )
      setIsProcessing(false)
    }
  }

  const handlePlaceOrder = async () => {
    if (!city) return
    setIsProcessing(true)
    setCheckoutError(null)

    try {
      if (createdOrderId) {
        await initializeCardPayment(createdOrderId, earnedCashback)
        return
      }

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city_id: city.id,
          ...(isLoggedIn === false ? { guest_token: getGuestToken() ?? undefined } : {}),
          ...(selectedAddressUnedited && selectedAddressId
            ? { address_id: selectedAddressId }
            : {}),
          ...(isLoggedIn === true ? { save_default: saveAsDefault } : {}),
          address: {
            label: address.label,
            street: address.street,
            number: address.number,
            interior: address.interior,
            neighborhood: address.neighborhood,
            zip_code: address.zip_code,
            references: address.references,
          },
          schedule: { date: schedule.date, time: schedule.time },
          payment_method: "card",
          phone,
          email: email.trim() || undefined,
          subtotal: subtotal + bumpsSubtotal,
          delivery_fee: deliveryFee,
          total,
          coupon_code: coupon?.code,
          items: [
            ...cart.items.map((item) => ({
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.sale_price ?? item.price,
              name: item.name,
            })),
            ...selectedBumps.map((b) => ({
              product_id: b.productId,
              quantity: b.quantity,
              unit_price: b.unitPrice,
              name: String(b.productId),
              item_type: "bump" as const,
            })),
          ],
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        setCheckoutError(data.error || "Error al crear el pedido")
        setIsProcessing(false)
        return
      }

      if (isLoggedIn === false) {
        if (data.guestToken) saveGuestToken(data.guestToken)
        saveLastAddress({ ...address, phone })
      }

      if (data.orderId) {
        await initializeCardPayment(data.orderId, {
          credits: data.cashbackCredits ?? 0,
          tier: data.cashbackTier ?? null,
        })
        return
      }

      setIsProcessing(false)
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : "Error de conexión. Intenta de nuevo."
      )
      setIsProcessing(false)
    }
  }

  // ── Pago exitoso: persiste last_order, limpia carrito y abre flujo post-pago ──
  const handleStripeSuccess = (paymentIntentId: string) => {
    if (!city) return
    saveLastOrder(createdOrderId ?? undefined, earnedCashback?.credits, earnedCashback?.tier)
    clearCart()
    setIsOpen(false)

    // El UpsellModal (todo upsell-modal) escucha este evento para interceptar
    // la navegación y ofrecer el 1-click upsell. Si nadie lo maneja, vamos a
    // la confirmación (comportamiento retrocompatible).
    const claimed = window.dispatchEvent(
      new CustomEvent(ORDER_PAID_EVENT, {
        detail: { orderId: createdOrderId, paymentIntentId, total },
        cancelable: true,
      })
    )
    if (!claimed) {
      router.push(`/${city.slug}/pedido-confirmado`)
    }
  }

  const handleStripeBack = () => {
    setShowStripeForm(false)
    setStripeClientSecret(null)
  }

  if (!isOpen || !city) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[75] bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-[80] w-full max-w-md bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E9EB]">
          <div className="flex items-center gap-2">
            {step !== "review" && (
              <button
                onClick={() =>
                  setStep(
                    step === "payment" && showStripeForm
                      ? "bumps"
                      : step === "bumps"
                        ? "schedule"
                        : step === "schedule"
                          ? "address"
                          : "review"
                  )
                }
                aria-label="Regresar"
                className="p-2 -ml-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
            )}
            <ShoppingBag className="w-5 h-5 text-[#0E7A0E] ml-1" />
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Step indicator */}
        {step !== "review" && (
          <div className="px-5 py-3 border-b border-[#E8E9EB] flex items-center gap-1.5">
            {(["address", "schedule", "bumps", "payment"] as DrawerStep[]).map((s, i) => {
              const currentIdx = ["address", "schedule", "bumps", "payment"].indexOf(step)
              return (
                <div key={s} className="flex items-center gap-1.5 flex-1">
                  <div
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= currentIdx ? "bg-brand-600" : "bg-gray-200"
                    }`}
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === "review" && (
            <div className="space-y-5">
              <FreeShippingProgress payableSubtotal={payableSubtotal} />

              {/* Items del carrito */}
              <div>
                <p className="text-xs font-semibold text-[#B87A3A] uppercase tracking-wide mb-2">
                  Tu pedido ({itemCount})
                </p>
                <ul className="divide-y divide-[#E8E9EB]">
                  {cart.items.map((item) => (
                    <li key={item.product_id} className="py-3 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-[10px] bg-[#F7F5F0] flex items-center justify-center shrink-0 overflow-hidden">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            loading="lazy"
                            width={48}
                            height={48}
                            className="w-full h-full object-contain p-1"
                          />
                        ) : (
                          <ShoppingBag className="w-5 h-5 text-[#C7C8CD]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#242529] truncate">
                          {item.quantity}× {item.name}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {item.brand}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-[#242529]">
                        ${((item.sale_price ?? item.price) * item.quantity).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Resumen */}
              <div className="bg-[#F7F5F0] rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Subtotal</span>
                  <span className="font-semibold text-[#242529]">${subtotal.toFixed(2)}</span>
                </div>
                {selectedBumps.length > 0 && (
                  <div className="flex justify-between text-brand-700">
                    <span>Artículos especiales</span>
                    <span className="font-semibold">+${bumpsSubtotal.toFixed(2)}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Descuento ({coupon?.code ?? "cupón"})</span>
                    <span className="font-semibold">-${discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Envío</span>
                  <span className="font-semibold text-[#242529]">
                    {deliveryFee === 0 ? "Gratis 🎉" : `$${deliveryFee.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[#E8E9EB]">
                  <span className="font-bold text-[#242529]">Total</span>
                  <span className="font-bold text-brand-700 text-lg">${total.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  // Usuario logueado con dirección guardada válida → salta el
                  // paso de dirección y avanza directo al horario.
                  if (isLoggedIn === true && selectedAddressId !== null && isAddressValid) {
                    setStep("schedule")
                  } else {
                    setStep("address")
                  }
                }}
                disabled={itemCount === 0}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#0E7A0E] text-white font-bold rounded-xl hover:bg-[#0D720D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continuar al envío
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-center text-xs text-gray-400">
                Pago seguro con Stripe · Envío gratis desde $500 MXN
              </p>
            </div>
          )}

          {step === "address" && (
            <AddressStep
              address={address}
              phone={phone}
              savedAddresses={savedAddresses}
              selectedAddressId={selectedAddressId}
              isLoggedIn={isLoggedIn}
              city={city}
              isAddressValid={isAddressValid}
              email={email}
              onEmailChange={setEmail}
              onEmailBlur={captureLead}
              onUpdateAddress={(field, value) =>
                setAddress((prev) => ({ ...prev, [field]: value }))
              }
              onSelectSavedAddress={(addr) => {
                setSelectedAddressId(addr.id)
                setAddress({
                  label: addr.label,
                  street: addr.street,
                  number: addr.number,
                  interior: addr.interior ?? "",
                  neighborhood: addr.neighborhood,
                  zip_code: addr.zip_code,
                  references: addr.references ?? "",
                })
              }}
              onNewAddress={() => {
                setSelectedAddressId(null)
                setAddress(DEFAULT_ADDRESS_FORM)
              }}
              onPhoneChange={setPhone}
              onContinue={() => setStep("schedule")}
              saveAsDefault={saveAsDefault}
              onSaveAsDefaultChange={setSaveAsDefault}
            />
          )}

          {step === "schedule" && (
            <ScheduleStep
              schedule={schedule}
              onDateChange={(value) => setSchedule((s) => ({ ...s, date: value }))}
              onTimeChange={(value) => setSchedule((s) => ({ ...s, time: value }))}
              onBack={() => setStep("address")}
              onContinue={() => setStep("bumps")}
              savedAddressLabel={
                isLoggedIn === true && selectedSavedAddress && selectedAddressUnedited
                  ? selectedSavedAddress.label
                  : null
              }
              onEditAddress={() => setStep("address")}
            />
          )}

          {step === "bumps" && (
            <div className="space-y-5">
              <BumpCards
                cartItems={cart.items.map((i) => ({
                  product_id: i.product_id,
                  quantity: i.quantity,
                }))}
                selected={selectedBumps}
                onChange={setSelectedBumps}
              />

              {/* Resumen con bumps en tiempo real */}
              <div className="bg-[#F7F5F0] rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Subtotal</span>
                  <span className="font-semibold text-[#242529]">${subtotal.toFixed(2)}</span>
                </div>
                {selectedBumps.length > 0 && (
                  <div className="flex justify-between text-brand-700">
                    <span>Artículos especiales</span>
                    <span className="font-semibold">+${bumpsSubtotal.toFixed(2)}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Descuento ({coupon?.code ?? "cupón"})</span>
                    <span className="font-semibold">-${discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Envío</span>
                  <span className="font-semibold text-[#242529]">
                    {deliveryFee === 0 ? "Gratis 🎉" : `$${deliveryFee.toFixed(2)}`}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[#E8E9EB]">
                  <span className="font-bold text-[#242529]">Total</span>
                  <span className="font-bold text-brand-700 text-lg">${total.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("schedule")}
                  className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Atrás
                </button>
                <button
                  onClick={() => setStep("payment")}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#0E7A0E] text-white font-bold rounded-xl hover:bg-[#0D720D] transition-colors"
                >
                  Ir a pagar — ${total.toFixed(2)}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-5">
              {showStripeForm && stripeClientSecret ? (
                <StripeProvider clientSecret={stripeClientSecret}>
                  <StripePaymentForm
                    amount={total}
                    onSuccess={handleStripeSuccess}
                    onBack={handleStripeBack}
                    saveCardConsent={saveCardConsent}
                  />
                </StripeProvider>
              ) : (
                <div className="space-y-5">
                  {/* Resumen final */}
                  <div className="bg-[#F7F5F0] rounded-xl p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Subtotal</span>
                      <span className="font-semibold text-[#242529]">${subtotal.toFixed(2)}</span>
                    </div>
                    {selectedBumps.length > 0 && (
                      <div className="flex justify-between text-brand-700">
                        <span>Artículos especiales</span>
                        <span className="font-semibold">+${bumpsSubtotal.toFixed(2)}</span>
                      </div>
                    )}
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>Descuento ({coupon?.code ?? "cupón"})</span>
                        <span className="font-semibold">-${discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Envío</span>
                      <span className="font-semibold text-[#242529]">
                        {deliveryFee === 0 ? "Gratis 🎉" : `$${deliveryFee.toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-[#E8E9EB]">
                      <span className="font-bold text-[#242529]">Total a pagar</span>
                      <span className="font-bold text-brand-700 text-lg">${total.toFixed(2)}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 pt-1">
                      Entrega: {schedule.date} · {schedule.time}
                    </p>
                  </div>

                  {/* Trust badges */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 text-xs text-[#6b6b6b]">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#0E7A0E]" />
                      <span>Pago seguro con encriptación SSL</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#0E7A0E]" />
                      <span>Garantía de frescura: si algo no llega bien, te lo reponemos</span>
                    </div>
                  </div>

                  {/* Guardado de tarjeta (condiciona setup_future_usage → upsells 1-click) */}
                  <label className="flex items-start gap-3 bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-brand-300 transition-colors">
                    <input
                      type="checkbox"
                      checked={saveCardConsent}
                      onChange={(e) => setSaveCardConsent(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[#0E7A0E]"
                    />
                    <span className="text-xs text-[#6b6b6b] leading-snug">
                      <span className="font-semibold text-[#242529]">
                        Guardar mi tarjeta para compras futuras
                      </span>{" "}
                      — podrás agregar extras a tu pedido con 1 clic la próxima
                      vez, sin volver a capturar datos.{" "}
                      <span className="text-gray-400">
                        (Solo aplica si pagas con tarjeta; los pagos con Apple
                        Pay / Google Pay no se pueden guardar).
                      </span>
                    </span>
                  </label>

                  {checkoutError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                      {checkoutError}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep("bumps")}
                      className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Atrás
                    </button>
                    <button
                      onClick={handlePlaceOrder}
                      disabled={isProcessing}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#0E7A0E] text-white font-bold rounded-xl hover:bg-[#0D720D] disabled:opacity-70 transition-colors"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5" />
                          Confirmar pedido — ${total.toFixed(2)}
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-center text-xs text-gray-400">
                    Al confirmar aceptas nuestros Términos y Política de Privacidad.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * Persiste el resumen del pedido en sessionStorage para que la página de
 * confirmación pueda disparar el evento `purchase` y mostrar el cashback.
 * Mismo contrato que el checkout page (last_order).
 */
function saveLastOrder(orderId?: number, cashbackCredits?: number, cashbackTier?: string | null) {
  if (typeof window === "undefined") return
  const raw = window.sessionStorage.getItem("last_order")
  const previous = raw ? JSON.parse(raw) : {}
  window.sessionStorage.setItem(
    "last_order",
    JSON.stringify({
      ...previous,
      orderId: orderId ?? null,
      cashbackCredits: cashbackCredits ?? 0,
      cashbackTier: cashbackTier ?? null,
    })
  )
}
