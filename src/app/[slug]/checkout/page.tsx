"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useCart } from "@/contexts/cart-context"
import { useCity } from "@/contexts/city-context"
import {
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
  MapPin,
  Clock,
  CreditCard,
  CheckCircle2,
  Building2,
  Smartphone,
  Banknote,
  QrCode,
  Store,
  MessageCircle,
} from "lucide-react"
import Link from "next/link"
import { PAYMENT_METHODS, type PaymentMethod } from "@/types"

// ============================================================
// Types
// ============================================================

type Step = "address" | "schedule" | "review" | "payment"

interface AddressForm {
  label: string
  street: string
  number: string
  interior: string
  neighborhood: string
  zip_code: string
  references: string
}

interface ScheduleForm {
  date: string
  time: string
}

// ============================================================
// Helpers
// ============================================================

const DELIVERY_TIMES = [
  "8:00 AM — 10:00 AM",
  "10:00 AM — 12:00 PM",
  "12:00 PM — 2:00 PM",
  "2:00 PM — 4:00 PM",
  "4:00 PM — 6:00 PM",
  "6:00 PM — 8:00 PM",
]

// Generate next 7 days for Mexico
function getNextDays(): { value: string; label: string }[] {
  const days: { value: string; label: string }[] = []
  const today = new Date()
  const formatter = new Intl.DateTimeFormat("es-MX", { weekday: "long", month: "long", day: "numeric" })

  for (let i = 0; i < 7; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() + i)
    const iso = date.toISOString().split("T")[0]
    const label = i === 0 ? `Hoy — ${formatter.format(date)}` : i === 1 ? `Mañana — ${formatter.format(date)}` : formatter.format(date).replace(/^\w/, (c) => c.toUpperCase())
    days.push({ value: iso, label })
  }

  return days
}

const PAYMENT_ICONS: Record<PaymentMethod, React.ReactNode> = {
  card: <CreditCard className="w-5 h-5" />,
  spei: <Building2 className="w-5 h-5" />,
  oxxo: <Store className="w-5 h-5" />,
  mercado_pago: <Smartphone className="w-5 h-5" />,
  cash_on_delivery: <Banknote className="w-5 h-5" />,
  codi: <QrCode className="w-5 h-5" />,
  stripe: <CreditCard className="w-5 h-5" />,
}

// ============================================================
// Page
// ============================================================

export default function CheckoutPage() {
  const { cart, itemCount, subtotal, discount, clearCart } = useCart()
  const { city } = useCity()
  const router = useRouter()

  const [step, setStep] = useState<Step>("address")
  const [address, setAddress] = useState<AddressForm>({
    label: "Casa",
    street: "",
    number: "",
    interior: "",
    neighborhood: "",
    zip_code: "",
    references: "",
  })
  const [schedule, setSchedule] = useState<ScheduleForm>({
    date: getNextDays()[0]?.value ?? "",
    time: DELIVERY_TIMES[2],
  })
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card")
  const [isProcessing, setIsProcessing] = useState(false)

  const deliveryFee = itemCount > 0 ? 35 : 0
  const total = subtotal - discount + deliveryFee

  // Address form update
  const updateAddress = (field: keyof AddressForm, value: string) => {
    setAddress((prev) => ({ ...prev, [field]: value }))
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

  // Si no hay items
  if (itemCount === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <ShoppingBag className="w-16 h-16 text-gray-200 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Carrito vacío</h1>
        <p className="text-gray-400 mb-6">Agrega productos antes de hacer checkout.</p>
        <Link
          href={`/${city.slug}`}
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Ver productos
        </Link>
      </div>
    )
  }

  const handlePlaceOrder = async () => {
    setIsProcessing(true)
    // TODO: Integrar con Supabase para crear orden
    // TODO: Si paymentMethod es stripe, crear PaymentIntent y redirigir a Stripe Elements
    await new Promise((r) => setTimeout(r, 1500))
    clearCart()
    router.push(`/${city.slug}/pedido-confirmado`)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href={`/${city.slug}/carrito`} className="hover:text-brand-600">
          Carrito
        </Link>
        <span>/</span>
        <span className="text-gray-600 font-medium">Checkout</span>
      </div>

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
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            <MapPin className="w-5 h-5 inline mr-2 text-brand-600" />
            Dirección de entrega
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Selecciona o agrega una dirección en {city.name}, {city.state}.
          </p>

          {/* Address label */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Etiqueta
            </label>
            <div className="flex gap-2">
              {["Casa", "Oficina", "Otro"].map((l) => (
                <button
                  key={l}
                  onClick={() => updateAddress("label", l)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    address.label === l
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Street + Number */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Calle *
              </label>
              <input
                type="text"
                value={address.street}
                onChange={(e) => updateAddress("street", e.target.value)}
                placeholder="Av. Insurgentes Sur"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Número *
              </label>
              <input
                type="text"
                value={address.number}
                onChange={(e) => updateAddress("number", e.target.value)}
                placeholder="1234"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
          </div>

          {/* Interior + Neighborhood */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Interior (opcional)
              </label>
              <input
                type="text"
                value={address.interior}
                onChange={(e) => updateAddress("interior", e.target.value)}
                placeholder="Depto 4B"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Colonia *
              </label>
              <input
                type="text"
                value={address.neighborhood}
                onChange={(e) => updateAddress("neighborhood", e.target.value)}
                placeholder="Roma Norte"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
          </div>

          {/* ZIP code */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Código Postal *
            </label>
            <input
              type="text"
              value={address.zip_code}
              onChange={(e) => updateAddress("zip_code", e.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="06700"
              maxLength={5}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          {/* References */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Referencias (opcional)
            </label>
            <textarea
              value={address.references}
              onChange={(e) => updateAddress("references", e.target.value)}
              placeholder="Entre calles, color de fachada, etc."
              rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-none"
            />
          </div>

          <button
            onClick={() => setStep("schedule")}
            disabled={!isAddressValid}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Continuar
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ============ STEP 2: SCHEDULE ============ */}
      {step === "schedule" && (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            <Clock className="w-5 h-5 inline mr-2 text-brand-600" />
            ¿Cuándo entregamos?
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Elige la fecha y horario de entrega. Entrega estimada: 30–60 min.
          </p>

          {/* Date selection */}
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Fecha</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
            {getNextDays().map((day) => (
              <button
                key={day.value}
                onClick={() => setSchedule((s) => ({ ...s, date: day.value }))}
                className={`p-3 rounded-xl text-sm font-medium text-left transition-colors ${
                  schedule.date === day.value
                    ? "bg-brand-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>

          {/* Time selection */}
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Horario</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
            {DELIVERY_TIMES.map((time) => (
              <button
                key={time}
                onClick={() => setSchedule((s) => ({ ...s, time }))}
                className={`p-3 rounded-xl text-sm font-medium text-left transition-colors ${
                  schedule.time === time
                    ? "bg-brand-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {time}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("address")}
              className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Atrás
            </button>
            <button
              onClick={() => setStep("review")}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors"
            >
              Continuar
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ STEP 3: REVIEW ============ */}
      {step === "review" && (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            Revisa tu pedido
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Confirma que todo esté correcto antes de pagar.
          </p>

          {/* Address summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-brand-600" />
                Dirección
              </h3>
              <button
                onClick={() => setStep("address")}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                Editar
              </button>
            </div>
            <p className="text-sm text-gray-600">
              {address.street} {address.number}
              {address.interior ? `, ${address.interior}` : ""}
              <br />
              {address.neighborhood}, CP {address.zip_code}
              <br />
              {city.name}, {city.state}
              {address.references && (
                <>
                  <br />
                  <span className="text-gray-400 text-xs">Ref: {address.references}</span>
                </>
              )}
            </p>
          </div>

          {/* Schedule summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-600" />
                Entrega
              </h3>
              <button
                onClick={() => setStep("schedule")}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                Editar
              </button>
            </div>
            <p className="text-sm text-gray-600">
              {schedule.date === getNextDays()[0]?.value ? "Hoy" : schedule.date} — {schedule.time}
            </p>
          </div>

          {/* Items summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Productos ({itemCount})
            </h3>
            <ul className="space-y-2">
              {cart.items.map((item) => (
                <li key={item.product_id} className="flex justify-between text-sm">
                  <span className="text-gray-600 truncate mr-4">
                    {item.quantity}× {item.name}
                  </span>
                  <span className="font-medium text-gray-900 shrink-0">
                    ${((item.sale_price ?? item.price) * item.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Total */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-900">${subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-green-600">Descuento</span>
                <span className="text-green-600">-${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Envío</span>
              <span className="text-gray-900">${deliveryFee.toFixed(2)}</span>
            </div>
            <hr className="border-gray-100" />
            <div className="flex justify-between">
              <span className="text-lg font-bold text-gray-900">Total</span>
              <span className="text-lg font-bold text-brand-600">${total.toFixed(2)}</span>
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
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors"
            >
              Continuar al pago
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============ STEP 4: PAYMENT ============ */}
      {step === "payment" && (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            <CreditCard className="w-5 h-5 inline mr-2 text-brand-600" />
            Método de pago
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Elige cómo quieres pagar. Procesamiento seguro.
          </p>

          {/* Payment methods */}
          <div className="space-y-3 mb-6">
            {PAYMENT_METHODS.filter((m) => m.value !== "codi").map((method) => (
              <button
                key={method.value}
                onClick={() => setPaymentMethod(method.value)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors text-left ${
                  paymentMethod === method.value
                    ? "border-brand-600 bg-brand-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    paymentMethod === method.value
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {PAYMENT_ICONS[method.value]}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 text-sm">{method.label}</p>
                  <p className="text-xs text-gray-500">{method.description}</p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === method.value
                      ? "border-brand-600"
                      : "border-gray-300"
                  }`}
                >
                  {paymentMethod === method.value && (
                    <div className="w-3 h-3 rounded-full bg-brand-600" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Total reminder */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex justify-between">
              <span className="font-bold text-gray-900">Total a pagar</span>
              <span className="font-bold text-brand-600 text-lg">${total.toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Incluye ${deliveryFee.toFixed(2)} de envío</p>
          </div>

          {/* Payment method instructions */}
          {paymentMethod === "spei" && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm">
              <p className="text-blue-800 font-semibold mb-1">Pago vía SPEI</p>
              <p className="text-blue-600 text-xs">
                Al confirmar tu pedido recibirás la CLABE interbancaria para realizar la transferencia. Tu pedido se procesará cuando el pago sea confirmado (típicamente 5–30 minutos).
              </p>
            </div>
          )}

          {paymentMethod === "oxxo" && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 text-sm">
              <p className="text-orange-800 font-semibold mb-1">Pago en OXXO</p>
              <p className="text-orange-600 text-xs">
                Recibirás un código de barras para pagar en cualquier tienda OXXO. Tienes 24 horas para realizar el pago. Tu pedido se prepara al confirmar el pago.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep("review")}
              className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Atrás
            </button>
            <button
              onClick={handlePlaceOrder}
              disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 disabled:opacity-70 transition-colors"
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
          <p className="text-center text-xs text-gray-400 mt-4">
            Al confirmar aceptas nuestros Términos y Política de Privacidad.
          </p>
        </div>
      )}
    </div>
  )
}
