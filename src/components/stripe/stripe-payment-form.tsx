"use client"

import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
import { useState, type FormEvent } from "react"
import { CreditCard, Lock, AlertCircle, ShieldCheck } from "lucide-react"
import { stripeErrorMessage } from "@/lib/stripe-errors"
import {
  parsePaymentNextAction,
  type PaymentNextAction,
} from "@/lib/payment-next-action"

interface StripePaymentFormProps {
  /** Total amount being charged (for display only) */
  amount: number
  /** Called after successful payment confirmation */
  onSuccess: (paymentIntentId: string) => void
  /** Called when the user cancels / goes back */
  onBack: () => void
  /**
   * Si el usuario dio consentimiento explícito para guardar su tarjeta
   * (setup_future_usage: "off_session"). Determina el aviso dentro del form.
   * El intent se crea ANTES de mostrar este form; el checkbox vive en el paso
   * previo del drawer y se envía vía `save_card` al crear el PaymentIntent.
   */
  saveCardConsent?: boolean
  /**
   * URL a la que Stripe devuelve al cliente cuando el método de pago exige
   * salir del navegador (CoDi, 3DS de la tarjeta). Sin ella `confirmPayment`
   * falla para esos métodos, así que los flujos que los habilitan deben
   * pasarla. Si se omite se usa la URL actual.
   */
  returnUrl?: string
  /**
   * Se invoca cuando el intent queda pendiente de una acción asíncrona
   * (voucher OXXO, CLABE SPEI) en lugar de confirmarse al instante. Si no se
   * pasa, se muestra un error: dejar al cliente sin instrucciones sería
   * peor que fallar de forma visible.
   */
  onNextAction?: (action: PaymentNextAction, paymentIntentId: string) => void
}

/**
 * Renders Stripe's PaymentElement inside an Elements provider
 * to collect and confirm card payments dynamically.
 *
 * No Stripe Products or Prices needed — uses the PaymentIntent's
 * dynamic amount set by the server.
 *
 * Wallets nativos (Apple Pay / Google Pay / Link) se habilitan automáticamente
 * vía `paymentMethodOrder` + `wallets`. OJO: los wallets NO son reutilizables
 * off-session para upsells 1-click; solo la tarjeta guardada lo es.
 */
export function StripePaymentForm({
  amount,
  onSuccess,
  onBack,
  saveCardConsent = false,
  returnUrl,
  onNextAction,
}: StripePaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      setError("Stripe aún no está listo. Intenta de nuevo.")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setError(stripeErrorMessage(submitError))
        setIsLoading(false)
        return
      }

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          // Stripe exige una return_url para los métodos que salen del
          // navegador (CoDi, y 3DS cuando no se puede resolver inline).
          // Pasarla siempre es seguro: con `redirect: "if_required"` Stripe
          // no redirige cuando no hace falta.
          return_url: returnUrl || window.location.href,
        },
        redirect: "if_required",
      })

      if (confirmError) {
        setError(stripeErrorMessage(confirmError))
        setIsLoading(false)
        return
      }

      if (!paymentIntent) {
        setError("Stripe no devolvió el estado del pago. Contacta a soporte.")
        setIsLoading(false)
        return
      }

      if (paymentIntent.status === "succeeded") {
        onSuccess(paymentIntent.id)
        return
      }

      // Método local asíncrono (OXXO/SPEI/CoDi): el cliente ya tiene las
      // instrucciones y el dinero se acredita después. Se delegan a quien
      // las renderiza; el estado real lo confirma el webhook.
      if (
        paymentIntent.status === "requires_action" ||
        paymentIntent.status === "processing"
      ) {
        const action = parsePaymentNextAction(paymentIntent.next_action)
        if (onNextAction && action) {
          onNextAction(action, paymentIntent.id)
          return
        }
        if (paymentIntent.status === "processing") {
          // Sin acción que mostrar pero el cobro ya está en curso: se trata
          // como confirmado; el webhook cierra el ciclo.
          onSuccess(paymentIntent.id)
          return
        }
        setError(
          "Tu método de pago requiere pasos adicionales que no pudimos mostrar. Contacta a soporte."
        )
        setIsLoading(false)
        return
      }

      setError(`El pago quedó en estado: ${paymentIntent.status}. Contacta a soporte.`)
      setIsLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado al procesar el pago.")
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Security badge */}
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
        <Lock className="w-3.5 h-3.5" />
        <span>Pago seguro con Stripe — encriptado SSL/TLS</span>
      </div>

      {/* Stripe Payment Element */}
      <PaymentElement
        options={{
          layout: "tabs",
          // Los métodos no listados (si están habilitados en el Dashboard de
          // Stripe) se muestran después de los listados, así que el orden no
          // oculta ninguno.
          paymentMethodOrder: [
            "card",
            "oxxo",
            "spei",
            "codi",
            "link",
            "applePay",
            "googlePay",
          ],
          wallets: { applePay: "auto", googlePay: "auto" },
        }}
      />

      {/* Save card consent notice (decision was made before intent creation) */}
      {saveCardConsent && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-xs text-emerald-700">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>
            Guardaremos tu tarjeta de forma segura para compras futuras y pagos
            1-clic.
          </span>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          Atrás
        </button>
        <button
          type="submit"
          disabled={!stripe || !elements || isLoading}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Pagar ${amount.toFixed(2)} MXN
            </>
          )}
        </button>
      </div>
    </form>
  )
}
