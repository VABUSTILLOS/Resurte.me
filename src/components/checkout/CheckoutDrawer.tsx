"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
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
import { calcCheckoutTotals, DELIVERY_FEE_FLAT, FREE_SHIPPING_THRESHOLD, MIN_ITEM_QUANTITY, countBumpUnits } from "@/lib/checkout-config"
import { formatMxn } from "@/lib/commercial-facts"
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
import { CouponInput } from "@/components/cart/coupon-input"
import { BumpCards } from "@/components/checkout/BumpCards"
import type { OrderBump } from "@/lib/order-bumps"
import { OrderItemsList } from "@/components/checkout/OrderItemsList"
import { RemoveLineDialog } from "@/components/checkout/RemoveLineDialog"
import { useOrderLines } from "@/components/checkout/use-order-lines"
import { SocialProofBadge } from "@/components/checkout/social-proof"
import { useSelectedBumps } from "@/hooks/use-selected-bumps"
import { StripeProvider } from "@/components/stripe/stripe-provider"
import { StripePaymentForm } from "@/components/stripe/stripe-payment-form"
import { useCheckoutOrder, type CheckoutPaidInfo, type CreatedOrder } from "@/components/checkout/use-checkout-order"
import { SpeiIncentive } from "@/components/checkout/spei-incentive"
import { PaymentInstructions } from "@/components/checkout/payment-instructions"
import { PAYMENT_METHODS, type PaymentMethod } from "@/types"
import { useEscapeKey } from "@/hooks/use-escape-key"
import type { RepurchaseCouponInfo } from "@/types"

// Evento global para abrir el checkout del drawer (misma mecánica que
// CART_DRAWER_EVENT). Lo dispara el botón "Ir a Checkout" del CartDrawer.
export const CHECKOUT_DRAWER_EVENT = "resurte:toggle-checkout-drawer"

// Evento disparado cuando el pago principal se confirma. El UpsellModal
// (todo upsell-modal) lo escucha para interceptar la navegación; si nadie
// lo maneja, el drawer navega a la confirmación.
export const ORDER_PAID_EVENT = "resurte:order-paid"

type DrawerStep = "review" | "address" | "schedule" | "bumps" | "payment" | "offer" | "transfer"

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
  // Bumps seleccionados: store compartido con el carrito y el checkout (ver
  // useSelectedBumps). Ya no es estado local del drawer, así que la selección
  // sobrevive a cerrar el drawer, salir del checkout y recargar la página.
  const { selectedBumps, setSelectedBumps } = useSelectedBumps()
  // Consentimiento de guardado de tarjeta (Stripe setup_future_usage → upsells)
  const [saveCardConsent, setSaveCardConsent] = useState(false)
  // Método de pago del drawer. La tarjeta es el default: el drawer existe para
  // cobrar rápido y SPEI exige salir a transferir. Ofrecer SPEI aquí es lo que
  // permite incentivar la transferencia (fondos inmediatos, sin comisión), pero
  // el camino corto no se toca.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card")
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
  // Cuenta de artículos: unidades, no líneas (un bump con cantidad 3 son 3
  // artículos) para que el envío gratis y el conteo del resumen cuadren con
  // el pedido real.
  const bumpUnits = countBumpUnits(selectedBumps)
  const totals = calcCheckoutTotals(
    subtotal,
    bumpsSubtotal,
    coupon,
    itemCount,
    bumpUnits,
    DELIVERY_FEE_FLAT
  )
  const { discountAmount, payableSubtotal, deliveryFee } = totals
  const total = totals.total

  // Cantidades editables desde el paso de revisión: el "−" baja hasta 0 y, ya
  // en 0, pide confirmar la eliminación del artículo (useOrderLines).
  const updateBumpQuantity = useCallback((ruleId: number, quantity: number) => {
    setSelectedBumps((prev) =>
      prev.map((b) =>
        b.ruleId === ruleId ? { ...b, quantity: Math.max(MIN_ITEM_QUANTITY, quantity) } : b
      )
    )
  }, [setSelectedBumps])

  const orderLines = useOrderLines({
    bumps: selectedBumps,
    onSetBumpQuantity: updateBumpQuantity,
    onRemoveBump: useCallback(
      (ruleId: number) => setSelectedBumps((prev) => prev.filter((b) => b.ruleId !== ruleId)),
      [setSelectedBumps]
    ),
  })

  // add_payment_info (GA4/Meta): se dispara al entrar al paso de pago del
  // drawer. Solo una vez por visita (ref) para no duplicar el evento si el
  // usuario vuelve de 3DS o navega entre pasos.
  const addPaymentInfoRef = useRef(false)
  useEffect(() => {
    if (step === "payment" && !addPaymentInfoRef.current) {
      addPaymentInfoRef.current = true
      AnalyticsEvents.addPaymentInfo(total, itemCount + bumpUnits)
    }
  }, [step, total, itemCount, bumpUnits])

  const isAddressValid = Boolean(
    address.street.trim() &&
      address.number.trim() &&
      address.neighborhood.trim() &&
      address.zip_code.trim().length >= 5
  )

  // ── Lógica compartida del pedido (sesión, direcciones, createOrder,
  //    PaymentIntent) — ver use-checkout-order.ts. El drawer ya no usa el
  //    express con tarjeta: su CTA instantáneo es la transferencia SPEI. ──
  const {
    isLoggedIn,
    savedAddresses,
    selectedAddressId,
    setSelectedAddressId,
    selectedSavedAddress,
    selectedAddressUnedited,
    refreshSavedAddresses,
    deleteSavedAddress,
    deletingAddressId,
    captureLead,
    handlePlaceOrder,
    handleStripeSuccess,
    handleStripeBack,
    stripeClientSecret,
    setStripeClientSecret,
    showStripeForm,
    setShowStripeForm,
    checkoutError,
    setCheckoutError,
    isProcessing,
    createOrder,
    completeOrder,
    setIsProcessing,
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
      saveLastOrder(info.orderId ?? undefined, info.cashback?.credits, info.cashback?.tier, info.repurchaseCoupon, info.trackingToken)
      clearCart()
      setIsOpen(false)

      // Refresca "Mis direcciones" sin recargar: la dirección que se guardó
      // con esta orden debe aparecer al abrir el drawer de nuevo (misma
      // lógica que la página completa /checkout tras crear la orden). Aplica
      // también a invitados: su libro vive en el servidor, por guest_token.
      void refreshSavedAddresses()

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

  // ── Pago prioritario por transferencia (SPEI) ──
  // El pedido se crea al pulsar el CTA, pero el drawer NO se cierra: primero se
  // muestran los datos de transferencia (monto exacto y número de pedido como
  // concepto) y solo al pulsar "Listo" corre el post-pago. El carrito se vacía
  // en cuanto la orden existe para que un cierre accidental no deje la puerta
  // abierta a crear un pedido duplicado.
  //
  // El total se guarda junto a la orden a propósito: vaciar el carrito pone el
  // total en vivo en 0, y leerlo al pintar mostraría "transfiere $0.00".
  const [transferOrder, setTransferOrder] = useState<{
    created: CreatedOrder
    total: number
  } | null>(null)
  // Oferta previa a la transferencia y si el cliente ya la agregó.
  const [priorityOffer, setPriorityOffer] = useState<OrderBump | null>(null)
  const [offerAdded, setOfferAdded] = useState(false)

  // Sin `useCallback`: el React Compiler memoiza solo, y envolverlo a mano hacía
  // que el compilador se rindiera (el `total` capturado "puede cambiar después").
  const handlePriorityCheckout = async () => {
    setIsProcessing(true)
    setCheckoutError(null)
    try {
      const created = await createOrder("spei")
      if (!created) {
        setIsProcessing(false)
        return
      }
      setTransferOrder({ created, total })
      clearCart()
      setIsProcessing(false)
      setStep("transfer")
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : "Error de conexión. Intenta de nuevo."
      )
      setIsProcessing(false)
    }
  }

  // ── Oferta previa a la transferencia ──
  // Antes de mandar al cliente a transferir se le ofrece un producto más: si lo
  // acepta, entra al pedido y el monto a transferir sube con él. Se resuelve con
  // el mismo motor de ofertas del checkout (`POST /api/cart/bumps`) porque el
  // modal post-compra no sirve aquí: cobra off-session con una tarjeta y un pago
  // por SPEI no tiene ninguna.
  //
  // El orden importa: la oferta se acepta en un render y la orden se crea en el
  // SIGUIENTE ("Continuar"), porque `createOrder` arma el payload con los bumps
  // del render en curso — aceptar y crear en el mismo clic dejaría fuera el
  // producto aceptado y el monto no cuadraría con el pedido.
  const startPriorityCheckout = async () => {
    setIsProcessing(true)
    setCheckoutError(null)
    try {
      const res = await fetch("/api/cart/bumps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        }),
      })
      const data = (await res.json()) as { bumps?: OrderBump[] }
      const chosen = new Set(selectedBumps.map((b) => b.productId))
      const offer = (data.bumps ?? []).find(
        (b) => !chosen.has(b.product.id) && !cart.items.some((i) => i.product_id === b.product.id)
      )
      setIsProcessing(false)
      if (offer) {
        setPriorityOffer(offer)
        setOfferAdded(false)
        setStep("offer")
        return
      }
    } catch {
      // Fail-open: sin oferta (o si la API falla) se va directo a transferir.
    }
    setIsProcessing(false)
    void handlePriorityCheckout()
  }

  const acceptPriorityOffer = () => {
    if (!priorityOffer) return
    setSelectedBumps((prev) => [
      ...prev,
      {
        ruleId: priorityOffer.ruleId,
        productId: priorityOffer.product.id,
        quantity: 1,
        unitPrice: priorityOffer.price,
        name: priorityOffer.product.name,
        imageUrl: priorityOffer.product.image_url,
      },
    ])
    setOfferAdded(true)
  }

  // ── Apertura / cierre del drawer ──
  useEffect(() => {
    const handler = () => {
      // Los bumps ya NO se transfieren por el evento: viven en el store
      // compartido (`useSelectedBumps`), así que el drawer abre con la misma
      // selección que se ve en el cross-sell del carrito, /cart y
      // /{ciudad}/carrito. Antes viajaban en detail.bumps y se perdían al
      // salir del checkout; ahora sobreviven a la navegación y a la recarga.
      setIsOpen((prev) => {
        const next = !prev
        if (next) {
          setStep("review")
          setCheckoutError(null)
          setShowStripeForm(false)
          setStripeClientSecret(null)
          setSaveAsDefault(false)
        }
        return next
      })
    }
    window.addEventListener(CHECKOUT_DRAWER_EVENT, handler)
    return () => window.removeEventListener(CHECKOUT_DRAWER_EVENT, handler)
  }, [setStep, setCheckoutError, setShowStripeForm, setStripeClientSecret, setSaveAsDefault])

  // Escape cierra el drawer, salvo que la confirmación de eliminación esté
  // abierta: ahí el primer Escape cancela el diálogo, no el checkout.
  useEscapeKey(
    useCallback(() => setIsOpen(false), []),
    isOpen && !orderLines.pendingRemoval
  )

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
            {step !== "review" && step !== "transfer" && (
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
        {step !== "review" && step !== "transfer" && step !== "offer" && (
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
              <FreeShippingProgress
                payableSubtotal={payableSubtotal}
                freeShipping={totals.freeShippingApplied}
              />

              {/* Items del carrito — primero el usuario revisa sus productos.
                  Cantidades editables con +/− (mínimo 1). */}
              <div>
                <p className="text-xs font-semibold text-[#B87A3A] uppercase tracking-wide mb-2">
                  Tu pedido ({itemCount + bumpUnits})
                </p>
                <OrderItemsList
                  items={orderLines.items}
                  bumps={selectedBumps}
                  onUpdateItemQuantity={orderLines.updateItemQuantity}
                  onUpdateBumpQuantity={orderLines.updateBumpQuantity}
                />
              </div>

              {/* Teaser de order bumps (mecánica ThriveCart): visibles después
                  de la lista de items del primer paso. El usuario puede
                  agregar/quitarlos aquí o volver. En modo encadenado cada bump
                  elegido entra al pedido de arriba y aparece el siguiente. */}
              <BumpCards
                cartItems={cart.items.map((i) => ({
                  product_id: i.product_id,
                  quantity: i.quantity,
                }))}
                selected={selectedBumps}
                onChange={setSelectedBumps}
                revealNext
              />

              {/* Cupón: mismo componente y mismo estado que el carrito
                  (`cart-context`), así que lo aplicado aquí vale en todo el
                  flujo — y viceversa. */}
              <CouponInput />

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

              {/* Pago prioritario por transferencia: un clic con la dirección ya
                  preseleccionada crea el pedido por SPEI (sin pasar por Stripe)
                  y el cliente aterriza en la confirmación con la CLABE. Es el
                  CTA que empuja la transferencia: fondos el mismo día y sin
                  comisión, que es lo que cuida el margen. No exige tarjeta
                  guardada — justo lo contrario. */}
              {selectedAddressId !== null && isAddressValid && (
                <button
                  onClick={() => void startPriorityCheckout()}
                  disabled={isProcessing || itemCount === 0}
                  className="w-full flex flex-col items-center gap-0.5 px-6 py-3 mb-3 bg-[#5B21B6] text-white font-bold rounded-xl hover:bg-[#4C1D95] disabled:opacity-70 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    {isProcessing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-yellow-400" />
                        Obtén Envío Prioritario
                      </>
                    )}
                  </span>
                  {!isProcessing && (
                    <span className="text-[11px] font-normal text-white/80 truncate max-w-full">
                      Paga por transferencia · {address.street} {address.number}
                    </span>
                  )}
                </button>
              )}

              {/* Motivo del fallo del cobro rápido (o de crear la orden): el
                  paso de pago también lo pinta, pero si el avance no aplica el
                  usuario tiene que verlo aquí, junto al botón que lo provocó. */}
              {checkoutError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-3 text-sm text-red-700">
                  {checkoutError}
                </div>
              )}

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
                Pago seguro con Stripe · Envío gratis desde {formatMxn(FREE_SHIPPING_THRESHOLD)}
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
              onDeleteSavedAddress={(addr) => void deleteSavedAddress(addr.id)}
              deletingAddressId={deletingAddressId}
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
                  Tu pedido ({itemCount + bumpUnits})
                </p>
                <OrderItemsList
                  items={orderLines.items}
                  bumps={selectedBumps}
                  onUpdateItemQuantity={orderLines.updateItemQuantity}
                  onUpdateBumpQuantity={orderLines.updateBumpQuantity}
                  readOnly
                />
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
              {/* Motivo del último fallo (cobro rápido rechazado, 3DS, red).
                  Va FUERA del ternario: el formulario de Stripe y el resumen
                  son ramas excluyentes, y el mensaje tiene que verse en las
                  dos — el fallo del 1-click deja precisamente el formulario. */}
              {checkoutError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                  {checkoutError}
                </div>
              )}
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

                  {/* Método de pago. La tarjeta va primero (es el camino corto
                      del drawer); SPEI desbloquea el envío prioritario, que el
                      servidor marca en el pedido (orders.priority, 00220). */}
                  <div className="space-y-2">
                    {PAYMENT_METHODS.filter(
                      (m) => m.value === "card" || m.value === "spei"
                    ).map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setPaymentMethod(m.value)}
                        aria-pressed={paymentMethod === m.value}
                        className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
                          paymentMethod === m.value
                            ? "border-[#0E7A0E] bg-[#F6FDF6]"
                            : "border-[#E8E9EB] bg-white hover:border-[#C7C8CD]"
                        }`}
                      >
                        <span className="text-lg" aria-hidden>
                          {m.icon}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-[#242529]">
                            {m.label}
                            {m.value === "spei" && (
                              <span className="ml-2 inline-flex items-center gap-0.5 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 align-middle text-[10px] font-bold text-violet-700">
                                ⚡ Envío prioritario
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-[#6b6b6b]">{m.description}</span>
                        </span>
                        <span
                          className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                            paymentMethod === m.value
                              ? "border-[#0E7A0E] bg-[#0E7A0E]"
                              : "border-[#C7C8CD]"
                          }`}
                        />
                      </button>
                    ))}
                  </div>

                  {paymentMethod === "spei" && <SpeiIncentive amount={total} />}

                  {/* Alternativa prioritaria: si eligió tarjeta, este botón le
                      ofrece la transferencia en un clic (fondos el mismo día,
                      sin comisión de Stripe). Cuando el selector ya está en
                      SPEI, el botón "Confirmar pedido" de abajo es el que paga
                      por transferencia y este sobraría. */}
                  {paymentMethod === "card" && selectedAddressId !== null && isAddressValid && (
                    <button
                      onClick={() => void startPriorityCheckout()}
                      disabled={isProcessing}
                      className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-[#5B21B6] text-white font-bold rounded-xl hover:bg-[#4C1D95] disabled:opacity-70 transition-colors"
                    >
                      {isProcessing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5 text-yellow-400" />
                          Obtén Envío Prioritario
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
                    <SocialProofBadge />
                  </div>

                  {/* Guardado de tarjeta (condiciona setup_future_usage → upsells 1-click) */}
                  {paymentMethod === "card" && (
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
                      onClick={() => {
                        // SPEI comparte el paso de datos de transferencia: el
                        // cliente ve la CLABE antes de que el drawer se cierre.
                        // El resto de métodos cierran directo.
                        if (paymentMethod === "spei") {
                          void startPriorityCheckout()
                          return
                        }
                        void handlePlaceOrder(paymentMethod)
                      }}
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
                          {paymentMethod === "spei"
                            ? `Confirmar y ver la CLABE — $${total.toFixed(2)}`
                            : `Confirmar pedido — $${total.toFixed(2)}`}
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

          {/* Oferta antes de transferir: si la acepta, el producto entra al
              pedido y el monto a transferir sube con él. Una sola oferta: es un
              paso de decisión, no un catálogo. */}
          {step === "offer" && priorityOffer && (
            <div className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-bold text-[#242529]">
                  {offerAdded ? "¡Listo, va en tu pedido!" : "¿Le agregas algo a tu pedido?"}
                </h2>
                <p className="text-sm text-[#6b6b6b] mt-1">
                  {offerAdded
                    ? "Se suma al total que vas a transferir."
                    : "Aprovecha antes de transferir: llega en la misma entrega."}
                </p>
              </div>

              <div className="rounded-xl border border-[#E8E9EB] bg-white p-4 flex items-start gap-3">
                <div className="w-16 h-16 rounded-lg bg-[#F7F5F0] overflow-hidden shrink-0">
                  {priorityOffer.product.image_url ? (
                    <Image
                      src={priorityOffer.product.image_url}
                      alt={priorityOffer.product.name}
                      width={64}
                      height={64}
                      className="w-full h-full object-contain p-1"
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#242529]">
                    {priorityOffer.product.name}
                  </p>
                  <p className="text-xs text-[#6b6b6b] line-clamp-2 mt-0.5">
                    {priorityOffer.description}
                  </p>
                  <p className="text-sm font-bold text-[#0E7A0E] mt-1">
                    ${priorityOffer.price.toFixed(2)}
                  </p>
                </div>
              </div>

              {offerAdded && (
                <div className="rounded-xl bg-[#F6FDF6] border border-brand-100 p-4 text-sm flex justify-between">
                  <span className="text-[#6b6b6b]">Total a transferir</span>
                  <span className="font-bold text-[#242529]">${total.toFixed(2)}</span>
                </div>
              )}

              {offerAdded ? (
                <button
                  onClick={() => void handlePriorityCheckout()}
                  disabled={isProcessing}
                  className="w-full px-6 py-3 bg-[#5B21B6] text-white font-bold rounded-xl hover:bg-[#4C1D95] disabled:opacity-70 transition-colors"
                >
                  {isProcessing ? "Procesando..." : "Continuar con la transferencia"}
                </button>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={acceptPriorityOffer}
                    className="w-full px-6 py-3 bg-[#0E7A0E] text-white font-bold rounded-xl hover:bg-[#0D720D] transition-colors"
                  >
                    Sí, agregar — ${priorityOffer.price.toFixed(2)}
                  </button>
                  <button
                    onClick={() => void handlePriorityCheckout()}
                    disabled={isProcessing}
                    className="w-full px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-70 transition-colors"
                  >
                    {isProcessing ? "Procesando..." : "No, gracias"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Paso final del pago por transferencia: el pedido YA existe (de ahí
              sale el número que va como concepto) pero el drawer no se cierra
              hasta que el cliente ve los datos. Antes se cerraba de golpe y los
              datos quedaban solo en la página de confirmación. */}
          {step === "transfer" && transferOrder && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-100 mb-3">
                  <span className="text-2xl" aria-hidden>
                    ⚡
                  </span>
                </div>
                <h2 className="text-lg font-bold text-[#242529]">
                  ¡Pedido #{transferOrder.created.orderId} registrado!
                </h2>
                <p className="text-sm text-[#6b6b6b] mt-1">
                  Envío prioritario desbloqueado. Solo falta tu transferencia para
                  que lo surtamos.
                </p>
              </div>

              <PaymentInstructions
                method="spei"
                amount={transferOrder.total}
                orderRef={String(transferOrder.created.orderId)}
              />

              <button
                onClick={() => completeOrder(transferOrder.created)}
                className="w-full px-6 py-3 bg-[#0E7A0E] text-white font-bold rounded-xl hover:bg-[#0D720D] transition-colors"
              >
                Listo, ver mi pedido
              </button>
              <p className="text-center text-[11px] text-gray-400">
                Puedes cerrar esta ventana: tu pedido queda registrado y lo
                surtimos al confirmar tu pago.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Confirmación de eliminación (z-[90]: por encima del panel del drawer) */}
      <RemoveLineDialog
        open={orderLines.pendingRemoval !== null}
        itemName={orderLines.pendingRemoval?.name ?? ""}
        onCancel={orderLines.cancelRemoval}
        onConfirm={orderLines.confirmRemoval}
      />
    </>
  )
}

/**
 * Persiste el resumen del pedido en sessionStorage para que la página de
 * confirmación pueda disparar el evento `purchase` y mostrar el cashback.
 * Mismo contrato que el checkout page (last_order).
 */
function saveLastOrder(orderId?: number, cashbackCredits?: number, cashbackTier?: string | null, repurchaseCoupon?: RepurchaseCouponInfo | null, trackingToken?: string | null) {
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
      repurchaseCoupon: repurchaseCoupon ?? null,
      trackingToken: trackingToken ?? null,
    })
  )
}
