"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useCart } from "@/contexts/cart-context"
import { useCity } from "@/contexts/city-context"
import { createClient } from "@/lib/supabase/client"
import {
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Store,
  MessageCircle,
} from "lucide-react"
import Link from "next/link"
import type { PaymentMethod, Address } from "@/types"
import {
  getGuestToken,
  saveGuestToken,
  getLastAddress,
  saveLastAddress,
  claimGuestAddresses,
} from "@/lib/guest-address"
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
import { useSelectedBumps } from "@/hooks/use-selected-bumps"
import { validDeliveryFee, calcCouponDiscount } from "@/lib/checkout-config"

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
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  // Teléfono de contacto: se guarda en orders.customer_phone para activar la
  // confirmación por WhatsApp al cliente.
  const [phone, setPhone] = useState("")

  // Email del cliente: se captura al salir del campo (onBlur) como lead y se
  // pasa a Stripe como customer_email para habilitar Link Pay / prefill.
  const [email, setEmail] = useState("")

  // Captura de lead onBlur (fire-and-forget, fail-open). Reutiliza el mismo
  // endpoint que el drawer móvil para no duplicar lógica.
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
        source: "checkout_page",
        coupon_code: coupon?.code ?? undefined,
      }),
    }).catch(() => {
      // Fail-open: nunca bloquear el checkout por captura de leads
    })
  }, [phone, coupon?.code])

  // Direcciones guardadas del usuario (solo visibles para dueño vía RLS)
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null)

  // Order bumps: selección compartida con /cart, /{ciudad}/carrito y la
  // MobileCartBar (mecánica ThriveCart). Persiste en sessionStorage y emite
  // BUMPS_CHANGED_EVENT para sincronizar el total de la barra en tiempo real.
  // Se incluyen en la orden como items con item_type="bump"; el servidor valida
  // precios y reglas contra bump_rules. Retrocompatible: sin bumps, la orden
  // estándar no cambia.
  const { selectedBumps, setSelectedBumps } = useSelectedBumps()

  // Detecta si el usuario tiene sesión para sugerirle iniciarla (historial +
  // créditos de recompensa). null = aún verificando / sin Supabase configurado.
  // Para anónimos además precarga la dirección y el teléfono de la última
  // compra (localStorage) para no tener que escribirlos de nuevo.
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

  // Carga las direcciones guardadas cuando hay sesión activa
  const loadSavedAddresses = async (supabase: ReturnType<typeof createClient>) => {
    if (!supabase) return
    const { data, error } = await supabase
      .from("addresses")
      .select("*")
      .order("created_at", { ascending: false })
    if (!error && data) setSavedAddresses(data as Address[])
  }

  useEffect(() => {
    if (isLoggedIn !== true) return
    let cancelled = false
    const supabase = createClient()
    if (!supabase) return
    // Vincula las direcciones de compras anónimas hechas en este navegador
    // (no-op si no hay guest_token en localStorage).
    claimGuestAddresses()
    supabase
      .from("addresses")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error && data) setSavedAddresses(data as Address[])
      })
    return () => {
      cancelled = true
    }
  }, [isLoggedIn])

  // Stripe integration state
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null)
  const [showStripeForm, setShowStripeForm] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  // ID real del pedido en la BD (para la página de confirmación)
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null)
  // Cashback estimado devuelto por POST /api/orders (se muestra tras pagar)
  const [earnedCashback, setEarnedCashback] = useState<{ credits: number; tier: string | null } | null>(null)

  // ── Totales en tiempo real (subtotal pagable + bumps seleccionados) ──
  // El descuento de cupón se calcula sobre el subtotal CON bumps incluidos,
  // igual que el servidor en POST /api/orders — así el total coincide a 0.01.
  const bumpsSubtotal = selectedBumps.reduce((sum, b) => sum + b.unitPrice * b.quantity, 0)
  const effectiveSubtotal = subtotal + bumpsSubtotal
  const discountAmount = calcCouponDiscount(effectiveSubtotal, coupon)
  const payableSubtotal = effectiveSubtotal - discountAmount
  const allItemsCount = itemCount + selectedBumps.length
  // Envío gratis desde $500 MXN (misma regla que el servidor en POST /api/orders)
  const deliveryFee = validDeliveryFee(allItemsCount, payableSubtotal, 35)
  const total = payableSubtotal + deliveryFee

  // Persist the order summary so the confirmation page can fire a complete
  // `purchase` event after the cart is cleared.
  const saveLastOrder = (orderId?: number, cashbackCredits?: number, cashbackTier?: string | null) => {
    sessionStorage.setItem(
      "last_order",
      JSON.stringify({
        orderId: orderId ?? null,
        total,
        cashbackCredits: cashbackCredits ?? 0,
        cashbackTier: cashbackTier ?? null,
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

  /**
   * Crea el PaymentIntent (POST /api/payments/stripe/create-intent) para una
   * orden de tarjeta ya registrada y muestra el formulario de Stripe.
   * Reutilizable en el primer intento y en el reintento tras un fallo.
   */
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
          // Checkout anónimo: el servidor valida el guest_token contra la
          // dirección del pedido antes de crear el intent.
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
        intentErr instanceof Error
          ? intentErr.message
          : "Error de conexión al inicializar el pago."
      )
      setIsProcessing(false)
    }
  }

  const handlePlaceOrder = async () => {
    setIsProcessing(true)
    setCheckoutError(null)

    try {
      // Reintento tras un fallo al crear el intent: la orden ya existe. No se
      // duplica la orden ni el cupón, solo se reintenta inicializar el pago.
      if (paymentMethod === "card" && createdOrderId) {
        await initializeCardPayment(createdOrderId, earnedCashback)
        return
      }

      // Solo se envía address_id si la dirección seleccionada NO fue editada;
      // si el usuario modificó un campo, se crea/actualiza una nueva.
      const selectedAddress = savedAddresses.find((a) => a.id === selectedAddressId)
      const selectedAddressUnedited =
        selectedAddress !== undefined &&
        selectedAddress.street === address.street &&
        selectedAddress.number === address.number &&
        (selectedAddress.interior ?? "") === address.interior &&
        selectedAddress.neighborhood === address.neighborhood &&
        selectedAddress.zip_code === address.zip_code &&
        (selectedAddress.references ?? "") === address.references

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city_id: city.id,
          // Checkout anónimo: reutiliza el token del navegador para que la
          // dirección se vincule a la misma "sesión" y se pueda reclamar al
          // iniciar sesión (el servidor genera uno si aún no existe).
          ...(isLoggedIn === false ? { guest_token: getGuestToken() ?? undefined } : {}),
          ...(selectedAddressUnedited && selectedAddressId
            ? { address_id: selectedAddressId }
            : {}),
          address: {
            label: address.label,
            street: address.street,
            number: address.number,
            interior: address.interior,
            neighborhood: address.neighborhood,
            zip_code: address.zip_code,
            references: address.references,
          },
          schedule: {
            date: schedule.date,
            time: schedule.time,
          },
          payment_method: paymentMethod,
          phone,
          email: email.trim() || undefined,
          subtotal: effectiveSubtotal,
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

      // La orden ya capturó los bumps; se limpia la selección temporal para que
      // una próxima compra en este tab no arrastre artículos especiales viejos.
      setSelectedBumps([])

      // Autoguardado (checkout anónimo): persiste el guest_token del servidor
      // y la última dirección+teléfono para reutilizarlos en la próxima compra.
      if (isLoggedIn === false) {
        if (data.guestToken) saveGuestToken(data.guestToken)
        saveLastAddress({ ...address, phone })
      }

      // Refresca "Mis direcciones" si el usuario vuelve sin recargar la página.
      const supabase = createClient()
      if (supabase) loadSavedAddresses(supabase)

      // Card payment → crear PaymentIntent (ruta dedicada) y mostrar Stripe form.
      if (paymentMethod === "card" && data.orderId) {
        await initializeCardPayment(data.orderId, {
          credits: data.cashbackCredits ?? 0,
          tier: data.cashbackTier ?? null,
        })
        return
      }

      // Non-card payment → redirect to confirmation
      saveLastOrder(data.orderId, data.cashbackCredits, data.cashbackTier)
      clearCart()
      router.push(`/${city.slug}/pedido-confirmado`)
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : "Error de conexión. Intenta de nuevo."
      )
      setIsProcessing(false)
    }
  }

  const handleStripeSuccess = (_paymentIntentId: string) => {
    saveLastOrder(createdOrderId ?? undefined, earnedCashback?.credits, earnedCashback?.tier)
    clearCart()
    router.push(`/${city.slug}/pedido-confirmado`)
  }

  const handleStripeBack = () => {
    setShowStripeForm(false)
    setStripeClientSecret(null)
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
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white text-xs font-semibold rounded-lg hover:bg-green-600 transition-colors"
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
      )}

      {/* ============ STEP 4: PAYMENT ============ */}
      {step === "payment" && (
        <PaymentStep
          paymentMethod={paymentMethod}
          total={total}
          deliveryFee={deliveryFee}
          checkoutError={checkoutError}
          isProcessing={isProcessing}
          showStripeForm={showStripeForm}
          stripeClientSecret={stripeClientSecret}
          onSelectMethod={setPaymentMethod}
          onPlaceOrder={handlePlaceOrder}
          onBack={() => setStep("review")}
          onStripeSuccess={handleStripeSuccess}
          onStripeBack={handleStripeBack}
        />
      )}
    </div>
  )
}