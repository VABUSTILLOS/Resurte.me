"use client"

import { CreditCard, CheckCircle2, ArrowLeft } from "lucide-react"
import { PAYMENT_METHODS, type PaymentMethod } from "@/types"
import { StripeProvider } from "@/components/stripe/stripe-provider"
import { StripePaymentForm } from "@/components/stripe/stripe-payment-form"
import { PAYMENT_ICONS } from "./checkout-shared"

interface PaymentStepProps {
  paymentMethod: PaymentMethod
  total: number
  deliveryFee: number
  checkoutError: string | null
  isProcessing: boolean
  showStripeForm: boolean
  stripeClientSecret: string | null
  onSelectMethod: (method: PaymentMethod) => void
  onPlaceOrder: () => void
  onBack: () => void
  onStripeSuccess: (paymentIntentId: string) => void
  onStripeBack: () => void
}

export function PaymentStep({
  paymentMethod,
  total,
  deliveryFee,
  checkoutError,
  isProcessing,
  showStripeForm,
  stripeClientSecret,
  onSelectMethod,
  onPlaceOrder,
  onBack,
  onStripeSuccess,
  onStripeBack,
}: PaymentStepProps) {
  return (
    <div>
      {/* Stripe Card Form */}
      {showStripeForm && stripeClientSecret ? (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            <CreditCard className="w-5 h-5 inline mr-2 text-brand-600" />
            Pago con tarjeta
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Ingresa los datos de tu tarjeta. Pago seguro con Stripe.
          </p>

          <StripeProvider clientSecret={stripeClientSecret}>
            <StripePaymentForm
              amount={total}
              onSuccess={onStripeSuccess}
              onBack={onStripeBack}
            />
          </StripeProvider>
        </div>
      ) : (
        <>
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
                onClick={() => onSelectMethod(method.value)}
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

          {/* Trust badges — payment security assurance */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 space-y-3">
            <div className="flex items-center gap-2 text-xs text-[#6b6b6b]">
              <CheckCircle2 className="w-4 h-4 text-[#108910]" />
              <span>Pago seguro con encriptación SSL</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#6b6b6b]">
              <CheckCircle2 className="w-4 h-4 text-[#108910]" />
              <span>Factura electrónica (CFDI 4.0) incluida</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#6b6b6b]">
              <CheckCircle2 className="w-4 h-4 text-[#108910]" />
              <span>Soporte vía WhatsApp antes, durante y después del pedido</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#6b6b6b]">
              <CheckCircle2 className="w-4 h-4 text-[#108910]" />
              <span>Garantía de frescura: si algo no llega bien, te lo reponemos</span>
            </div>
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

          {/* Error display */}
          {checkoutError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
              {checkoutError}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Atrás
            </button>
            <button
              onClick={onPlaceOrder}
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
        </>
      )}
    </div>
  )
}
