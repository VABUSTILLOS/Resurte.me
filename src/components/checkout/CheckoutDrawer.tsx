"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useCart } from "@/contexts/cart-context"
import { useCity, DEFAULT_CITY_SLUG } from "@/contexts/city-context"
import { AnalyticsEvents } from "@/lib/analytics"
import {
  X,
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Zap,
} from "lucide-react"
import { calcCheckoutTotals, DELIVERY_FEE_FLAT } from "@/lib/checkout-config"
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
import { readStoredBumps } from "@/hooks/use-selected-bumps"
import { StripeProvider } from "@/components/stripe/stripe-provider"
import { StripePaymentForm } from "@/components/stripe/stripe-payment-form"
import { useCheckoutOrder, type CheckoutPaidInfo } from "@/components/checkout/use-checkout-order"

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
  // Consentimiento de guardado de tarjeta (Stripe setup_future_usage → upsells)
  const [saveCardConsent, setSaveCardConsent] = useState(false)
  // Guardar la dirección como predeterminada (checkbox en AddressStep, logged-in)
  const [saveAsDefault, setSaveAsDefault] = useState(false)

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  // ── Totales en tiempo real (subtotal pagable + bumps seleccionados) ──
  // El descuento de cupón se calcula sobre el subtotal CON bumps incluidos,
  // igual que el servidor en POST /api/orders — así el total coincide a 0.01.
  const bumpsSubtotal = selectedBumps.reduce((sum, b) => sum + b.unitPrice * b.quantity, 0)
  const totals = calcCheckoutTotals(
    subtotal,
    bumpsSubtotal,
    coupon,
    itemCount,
    selectedBumps.length,
    DELIVERY_FEE_FLAT
  )
  const { discountAmount, payableSubtotal, deliveryFee } = totals
  const total = totals.total

  // add_payment_info (GA4/Meta): se dispara al entrar al paso de pago del
  // drawer. Solo una vez por visita (ref) para no duplicar el evento si el
  // usuario vuelve de 3DS o navega entre pasos.
  const addPaymentInfoRef = useRef(false)
  useEffect(() => {
    if (step === "payment" && !addPaymentInfoRef.current) {
      addPaymentInfoRef.current = true
      AnalyticsEvents.addPaymentInfo(total, itemCount + selectedBumps.length)
    }
  }, [step, total, itemCount, selectedBumps.length])

  const isAddressValid = Boolean(
    address.street.trim() &&
      address.number.trim() &&
      address.neighborhood.trim() &&
      address.zip_code.trim().length >= 5
  )

  // ── Lógica compartida del pedido (sesión, direcciones, createOrder,
  //    PaymentIntent, Express Checkout) — ver use-checkout-order.ts ──
  const {
    isLoggedIn,
    savedCard,
    savedAddresses,
    selectedAddressId,
    setSelectedAddressId,
    selectedSavedAddress,
    selectedAddressUnedited,
    refreshSavedAddresses,
    captureLead,
    handlePlaceOrder,
    handleExpressCheckout,
    handleStripeSuccess,
    handleStripeBack,
    stripeClientSecret,
    setStripeClientSecret,
    showStripeForm,
    setShowStripeForm,
    checkoutError,
    setCheckoutError,
    isProcessing,
  } = useCheckoutOrder({
    city,
    address,
    schedule,
    phone,
    email,
    coupon,
    cartItems: cart.items,
    selectedBumps,
    effectiveSubtotal: subtotal + bumpsSubtotal,
    deliveryFee,
    total,
    leadSource: "checkout_drawer",
    saveDefault: saveAsDefault,
    saveCard: saveCardConsent,
    autoSelectSavedAddress: true,
    setAddress,
    setPhone,
    setEmail,
    // El drawer no necesita limpiar bumps tras crear la orden (los mantiene
    // seleccionados por si el usuario vuelve atrás). Post-pago: persiste
    // last_order (merge), limpia carrito, cierra, refresca direcciones,
    // dispara ORDER_PAID_EVENT (UpsellModal) y navega si nadie lo reclamó.
    onPaid: (info: CheckoutPaidInfo) => {
      saveLastOrder(info.orderId ?? undefined, info.cashback?.credits, info.cashback?.tier)
      clearCart()
      setIsOpen(false)

      // Refresca "Mis direcciones" sin recargar: la dirección que se guardó
      // con esta orden debe aparecer al abrir el drawer de nuevo (misma
      // lógica que la página completa /checkout tras crear la orden).
      if (isLoggedIn === true) refreshSavedAddresses()

      // El UpsellModal escucha este evento para interceptar la navegación y
      // ofrecer el 1-click upsell. `dispatchEvent` retorna false si un
      // listener llamó a preventDefault() (el modal reclamó el evento). Por
      // lo tanto: navegamos a la confirmación SOLO si nadie lo reclamó.
      const claimed = window.dispatchEvent(
        new CustomEvent(ORDER_PAID_EVENT, {
          detail: {
            orderId: info.orderId,
            paymentIntentId: info.paymentIntentId,
            total,
          },
          cancelable: true,
        })
      )
      if (claimed) {
        // Nunca bloquear tras un pago exitoso: city siempre está disponible
        // (CityProvider auto-sanea slugs inválidos); por seguridad se usa el
        // slug por defecto si no lo hubiera.
        const slug = city?.slug ?? DEFAULT_CITY_SLUG
        router.push(`/${slug}/pedido-confirmado`)
      }
    },
  })

  // ── Apertura / cierre del drawer ──
  useEffect(() => {
    const handler = (event: Event) => {
      // Los bumps seleccionados en el cross-sell del CartDrawer viajan en
      // detail.bumps; sin detail se conserva el comportamiento retrocompatible
      // (se inician vacíos). Se valida la forma para no aceptar basura.
      const detail = (event as CustomEvent<{ bumps?: unknown }>).detail
      // Si vienen en detail (drawer móvil / MobileCartBar) se validan y usan;
      // si no, se leen de sessionStorage (fallback: navegación directa a
      // /checkout tras seleccionar bumps en /carrito).
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
        : readStoredBumps()
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
  }, [setStep, setCheckoutError, setShowStripeForm, setStripeClientSecret, setSelectedBumps, setSaveAsDefault])



  if (!isOpen || !city) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[75] bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Checkout"
        className="fixed right-0 top-0 bottom-0 z-[80] w-full max-w-md sm:max-w-2xl bg-white shadow-2xl flex flex-col animate-slide-in-right"
      >
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
                className="p-2 -ml-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors touch-target"
              >
                <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
            )}
            <ShoppingBag className="w-5 h-5 text-[#0E7A0E] ml-1" />
          </div>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Cerrar checkout"
            className="p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors touch-target"
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

              {/* Items del carrito — primero el usuario revisa sus productos */}
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

              {/* Teaser de order bumps (mecánica ThriveCart): visibles después
                  de la lista de items del primer paso. El usuario puede
                  agregar/quitarlos aquí o volver. */}
              <BumpCards
                cartItems={cart.items.map((i) => ({
                  product_id: i.product_id,
                  quantity: i.quantity,
                }))}
                selected={selectedBumps}
                onChange={setSelectedBumps}
              />

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
              {/* Revisión final read-only: lista consolidada de TODOS los
                  productos (catálogo + bumps ya seleccionados) y total a
                  pagar. Los bumps se eligen en el paso anterior (review). */}
              <div>
                <p className="text-xs font-semibold text-[#B87A3A] uppercase tracking-wide mb-2">
                  Tu pedido ({itemCount + selectedBumps.reduce((n, b) => n + b.quantity, 0)})
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
                  {selectedBumps.map((b) => (
                    <li key={`bump-${b.productId}`} className="py-3 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-[10px] bg-[#FDF3E3] flex items-center justify-center shrink-0 overflow-hidden">
                        {b.imageUrl ? (
                          <img
                            src={b.imageUrl}
                            alt={b.name ?? `Artículo especial #${b.productId}`}
                            loading="lazy"
                            width={48}
                            height={48}
                            className="w-full h-full object-contain p-1"
                          />
                        ) : (
                          <ShoppingBag className="w-5 h-5 text-[#B87A3A]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[#242529] truncate">
                            {b.quantity}× {b.name ?? `Artículo especial #${b.productId}`}
                          </p>
                          <span className="shrink-0 text-[10px] font-bold text-[#B87A3A] bg-[#FDF3E3] border border-[#EEDCC4] rounded-full px-2 py-0.5 uppercase tracking-wide">
                            Especial
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Agregado a tu pedido
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-[#B87A3A]">
                        ${(b.unitPrice * b.quantity).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

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

                  {/* Express Checkout: tarjeta guardada (solo sesión iniciada) */}
                  {isLoggedIn === true && savedCard?.hasSavedCard && (
                    <button
                      onClick={handleExpressCheckout}
                      disabled={isProcessing}
                      className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-[#242529] text-white font-bold rounded-xl hover:bg-black disabled:opacity-70 transition-colors"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5 text-yellow-400" />
                          Pagar al instante
                          {savedCard.last4
                            ? ` ··· ${savedCard.last4}${savedCard.brand ? ` (${savedCard.brand})` : ""}`
                            : ""}
                        </>
                      )}
                    </button>
                  )}

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
                      onClick={() => handlePlaceOrder()}
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
