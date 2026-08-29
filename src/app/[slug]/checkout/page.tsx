"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useCart } from "@/contexts/cart-context"
import { useCity, DEFAULT_CITY_SLUG } from "@/contexts/city-context"
import { AnalyticsEvents } from "@/lib/analytics"
import {
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Store,
  MessageCircle,
} from "lucide-react"
import Link from "next/link"
import type { PaymentMethod, Address, RepurchaseCouponInfo } from "@/types"
import {
  DEFAULT_ADDRESS_FORM,
  DELIVERY_TIMES,
  getNextDays,
  type AddressForm,
  type ScheduleForm,
  type Step,
} from "@/components/checkout/checkout-shared"
import { AddressStep } from "@/components/checkout/AddressStep"
import { ScheduleStep } from "@/components/checkout/ScheduleStep"
import { ReviewStep } from "@/components/checkout/ReviewStep"
import { PaymentStep } from "@/components/checkout/PaymentStep"
import { BumpCards } from "@/components/checkout/BumpCards"
import { useSelectedBumps } from "@/hooks/use-selected-bumps"
import { calcCheckoutTotals, DELIVERY_FEE_FLAT } from "@/lib/checkout-config"
import {
  useCheckoutOrder,
  type CheckoutPaidInfo,
} from "@/components/checkout/use-checkout-order"

// ============================================================
// Page
// ============================================================

export default function CheckoutPage() {
  const { cart, itemCount, subtotal, clearCart, coupon, isLoaded } = useCart()
  const { city } = useCity()
  const router = useRouter()

  const [step, setStep] = useState<Step>("address")
  const [address, setAddress] = useState<AddressForm>(DEFAULT_ADDRESS_FORM)
  const [schedule, setSchedule] = useState<ScheduleForm>({
    date: getNextDays()[0]?.value ?? "",
    time: DELIVERY_TIMES[2] ?? "12:00 PM — 2:00 PM",
  })
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card")
  // Teléfono de contacto: se guarda en orders.customer_phone para activar la
  // confirmación por WhatsApp al cliente.
  const [phone, setPhone] = useState("")

  // Email del cliente: se captura al salir del campo (onBlur) como lead y se
  // pasa a Stripe como customer_email para habilitar Link Pay / prefill.
  const [email, setEmail] = useState("")

  // Order bumps: selección compartida con /cart, /{ciudad}/carrito y la
  // MobileCartBar (mecánica ThriveCart). Persiste en sessionStorage y emite
  // BUMPS_CHANGED_EVENT para sincronizar el total de la barra en tiempo real.
  // Se incluyen en la orden como items con item_type="bump"; el servidor valida
  // precios y reglas contra bump_rules. Retrocompatible: sin bumps, la orden
  // estándar no cambia.
  const { selectedBumps, setSelectedBumps } = useSelectedBumps()

  // begin_checkout (GA4/Meta): se dispara una vez al cargar el checkout con
  // artículos en el carrito. El drawer móvil ya lo dispara al tocar
  // "Hacer Checkout"; esta página cubre el flujo full-page.
  const beganCheckoutRef = useRef(false)
  useEffect(() => {
    if (beganCheckoutRef.current || !isLoaded || itemCount === 0) return
    beganCheckoutRef.current = true
    AnalyticsEvents.beginCheckout(
      subtotal,
      itemCount,
      cart.items.map((i) => ({
        item_id: String(i.product_id),
        item_name: i.name,
        price: i.sale_price ?? i.price,
        quantity: i.quantity,
      }))
    )
  }, [isLoaded, itemCount, subtotal, cart.items])

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
  const { effectiveSubtotal, discountAmount, allItemsCount, deliveryFee } = totals
  const total = totals.total

  // Persist the order summary so the confirmation page can fire a complete
  // `purchase` event after the cart is cleared.
  const saveLastOrder = (orderId?: number, cashbackCredits?: number, cashbackTier?: string | null, repurchaseCoupon?: RepurchaseCouponInfo | null) => {
    sessionStorage.setItem(
      "last_order",
      JSON.stringify({
        orderId: orderId ?? null,
        total,
        cashbackCredits: cashbackCredits ?? 0,
        cashbackTier: cashbackTier ?? null,
        repurchaseCoupon: repurchaseCoupon ?? null,
        items: [
          ...cart.items.map((i) => ({
            id: String(i.product_id),
            name: i.name,
            quantity: i.quantity,
            price: i.sale_price ?? i.price,
          })),
          ...selectedBumps.map((b) => ({
            id: String(b.productId),
            name: b.name ?? `Artículo especial #${b.productId}`,
            quantity: b.quantity,
            price: b.unitPrice,
          })),
        ],
      })
    )
  }

  // ── Lógica de pedido compartida con el drawer móvil (useCheckoutOrder) ──
  // Centraliza sesión + precarga de última dirección, direcciones guardadas,
  // captureLead, creación de orden (POST /api/orders), PaymentIntent Stripe,
  // Express Checkout y navegación post-pago. La página conserva su shell, su
  // variante de saveLastOrder (items + total para el evento purchase) y la
  // navegación directa a pedido-confirmado (sin ORDER_PAID_EVENT del drawer).
  const {
    isLoggedIn,
    savedCard,
    savedAddresses,
    selectedAddressId,
    setSelectedAddressId,
    captureLead,
    refreshSavedAddresses,
    handlePlaceOrder,
    handleExpressCheckout,
    handleStripeSuccess,
    handleStripeBack,
    stripeClientSecret,
    showStripeForm,
    checkoutError,
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
    effectiveSubtotal,
    deliveryFee,
    total,
    leadSource: "checkout_page",
    setAddress,
    setPhone,
    setEmail,
    // Tras crear la orden: limpia los bumps (ya incluidos en la orden) y
    // refresca las direcciones guardadas si el usuario está autenticado.
    onAfterOrderCreated: () => {
      setSelectedBumps([])
      if (isLoggedIn === true) void refreshSavedAddresses()
    },
    // Post-pago: persiste last_order (con items + total), limpia el carrito y
    // navega a la confirmación. `city` es City | null en el closure (el hook se
    // declara antes del early return), por eso se usa `city?.slug ?? DEFAULT_CITY_SLUG`.
    onPaid: (info: CheckoutPaidInfo) => {
      saveLastOrder(info.orderId ?? undefined, info.cashback?.credits, info.cashback?.tier, info.repurchaseCoupon)
      clearCart()
      router.push(`/${city?.slug ?? DEFAULT_CITY_SLUG}/pedido-confirmado`)
    },
  })

  // Address form update
  const updateAddress = (field: keyof AddressForm, value: string) => {
    setAddress((prev) => ({ ...prev, [field]: value }))
  }

  // Seleccionar una dirección guardada y precargarla en el formulario
  const handleSelectSavedAddress = (addr: Address) => {
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
  }

  const isAddressValid =
    address.street.trim() &&
    address.number.trim() &&
    address.neighborhood.trim() &&
    address.zip_code.trim().length >= 5

  // Redirección si no hay ciudad
  if (!city) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Selecciona tu ciudad</h1>
        <p className="text-gray-400">Elige una ciudad para continuar con el checkout.</p>
      </div>
    )
  }

  // El carrito persistido se carga en el cliente tras la hidratación
  // (cart-context: SSR-safe). Hasta entonces se muestra un skeleton para no
  // pestañear el estado "vacío" en recargas con carrito guardado.
  if (!isLoaded) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="h-8 w-48 bg-gray-100 rounded mb-6 animate-pulse" />
        <div className="h-4 w-72 bg-gray-100 rounded mb-4 animate-pulse" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-100 p-4 flex gap-4 animate-pulse"
            >
              <div className="w-20 h-20 rounded-lg bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-gray-100 rounded" />
                <div className="h-4 w-1/4 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Si no hay items
  if (itemCount === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <ShoppingBag className="w-16 h-16 text-gray-200 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Carrito vacío</h1>
        <p className="text-gray-400 mb-6">Agrega productos antes de hacer checkout.</p>
        <Link
          href={`/${city.slug}/buscar`}
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Ver productos
        </Link>
      </div>
    )
  }


  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-32">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href={`/${city.slug}/carrito`} className="hover:text-brand-600">
          Carrito
        </Link>
        <span>/</span>
        <span className="text-gray-600 font-medium">Checkout</span>
      </div>

      {/* Login nudge: sin sesión no hay historial ni créditos de recompensa */}
      {isLoggedIn === false && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
            <Store className="w-5 h-5 text-brand-700" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-brand-800 mb-0.5">
              Inicia sesión para ganar créditos
            </p>
            <p className="text-xs text-brand-600 mb-2">
              Tus pedidos quedarán en tu historial y acumularás créditos de
              recompensa en todas tus compras.
            </p>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
            >
              Iniciar sesión <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* WhatsApp ordering alternative */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
          <MessageCircle className="w-5 h-5 text-green-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-800 mb-0.5">
            ¿Prefieres pedir por WhatsApp?
          </p>
          <p className="text-xs text-green-600 mb-2">
            Envía tu pedido directamente por WhatsApp y un asesor te atenderá.
          </p>
          <a
            href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"}?text=${encodeURIComponent(
              "🛒 *Pedido desde Resurte.me*\n\n" +
                cart.items
                  .map(
                    (item, i) =>
                      `${i + 1}. ${item.quantity}× ${item.name} — $${((item.sale_price ?? item.price) * item.quantity).toFixed(2)}`
                  )
                  .join("\n") +
                `\n\n*Total:* $${total.toFixed(2)} MXN\n\n` +
                `Ciudad: ${city.name}\n\n` +
                "¿Me pueden confirmar disponibilidad y tiempo de entrega?"
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-3 sm:py-2 bg-green-500 text-white text-xs font-semibold rounded-lg hover:bg-green-600 transition-colors touch-target"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Pedir por WhatsApp
          </a>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-3 mb-8">
        {(["address", "schedule", "review", "payment"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                step === s
                  ? "bg-brand-600 text-white"
                  : step > s || (step === "payment" && s === "review")
                  ? "bg-green-500 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {step > s || (step === "payment" && s === "review") ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < 3 && <div className="w-6 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* ============ STEP 1: ADDRESS ============ */}
      {step === "address" && (
        <AddressStep
          address={address}
          phone={phone}
          savedAddresses={savedAddresses}
          selectedAddressId={selectedAddressId}
          isLoggedIn={isLoggedIn}
          city={city}
          isAddressValid={Boolean(isAddressValid)}
          onUpdateAddress={updateAddress}
          onSelectSavedAddress={handleSelectSavedAddress}
          onNewAddress={() => {
            setSelectedAddressId(null)
            setAddress(DEFAULT_ADDRESS_FORM)
          }}
          onPhoneChange={setPhone}
          email={email}
          onEmailChange={setEmail}
          onEmailBlur={captureLead}
          onContinue={() => setStep("schedule")}
        />
      )}

      {/* ============ STEP 2: SCHEDULE ============ */}
      {step === "schedule" && (
        <ScheduleStep
          schedule={schedule}
          onDateChange={(value) => setSchedule((s) => ({ ...s, date: value }))}
          onTimeChange={(value) => setSchedule((s) => ({ ...s, time: value }))}
          onBack={() => setStep("address")}
          onContinue={() => setStep("review")}
        />
      )}

      {/* ============ STEP 3: REVIEW ============ */}
      {step === "review" && (
        <>
          <ReviewStep
            address={address}
            schedule={schedule}
            city={city}
            cartItems={cart.items}
            itemCount={allItemsCount}
            subtotal={effectiveSubtotal}
            discount={discountAmount}
            deliveryFee={deliveryFee}
            total={total}
            bumpItems={selectedBumps.map((b) => ({
              product_id: b.productId,
              name: b.name ?? `Artículo especial #${b.productId}`,
              quantity: b.quantity,
              unitPrice: b.unitPrice,
            }))}
            onEditAddress={() => setStep("address")}
            onEditSchedule={() => setStep("schedule")}
            onBack={() => setStep("schedule")}
            onContinue={() => setStep("payment")}
          />
          {/* Order bumps (mecánica ThriveCart): visibles justo antes de pagar,
              después del resumen de productos, igual que en el CheckoutDrawer.
              Si el carrito no dispara reglas, BumpCards renderiza null y no
              cambia nada (retrocompatible). */}
          <div className="mt-4">
            <BumpCards
              cartItems={cart.items.map((i) => ({
                product_id: i.product_id,
                quantity: i.quantity,
              }))}
              selected={selectedBumps}
              onChange={setSelectedBumps}
            />
          </div>
        </>
      )}

      {/* ============ STEP 4: PAYMENT ============ */}
      {step === "payment" && (
        <PaymentStep
          paymentMethod={paymentMethod}
          total={total}
          deliveryFee={deliveryFee}
          itemCount={allItemsCount}
          checkoutError={checkoutError}
          isProcessing={isProcessing}
          showStripeForm={showStripeForm}
          stripeClientSecret={stripeClientSecret}
          isLoggedIn={isLoggedIn === true}
          savedCard={savedCard}
          onSelectMethod={setPaymentMethod}
          onPlaceOrder={() => handlePlaceOrder(paymentMethod)}
          onExpressCheckout={handleExpressCheckout}
          onBack={() => setStep("review")}
          onStripeSuccess={handleStripeSuccess}
          onStripeBack={handleStripeBack}
        />
      )}
    </div>
  )
}