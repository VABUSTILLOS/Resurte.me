"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CreditCard, Loader2 } from "lucide-react"
import { StripeProvider } from "@/components/stripe/stripe-provider"
import { StripePaymentForm } from "@/components/stripe/stripe-payment-form"
import { ensureGuestToken } from "@/lib/guest-address"
import { trackEvent } from "@/lib/analytics"

interface CompletePaymentButtonProps {
  orderId: number
  /** Total del pedido (solo para mostrar en el formulario). */
  amount: number
  className?: string
}

/**
 * Permite completar el cobro de un pedido con tarjeta que quedó pendiente
 * (payment_status = "pending"). Llama a create-intent con el order_id
 * (+ guest_token para pedidos anónimos), monta el PaymentElement con el
 * clientSecret devuelto y, al confirmar, el webhook de Stripe marca el
 * pedido como pagado y abona el cashback.
 *
 * No requiere credenciales nuevas: reutiliza el PaymentIntent y el webhook
 * existentes del checkout.
 */
export function CompletePaymentButton({ orderId, amount, className }: CompletePaymentButtonProps) {
  const router = useRouter()
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startPayment() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/payments/stripe/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          type: "main",
          guest_token: ensureGuestToken() ?? undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar el pago")
        return
      }
      setClientSecret(data.clientSecret as string)
    } catch {
      setError("Error de conexión. Intenta de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  function handleSuccess() {
    trackEvent("payment_retry_success", { order_id: orderId })
    // El webhook confirma el pago; refrescamos para reflejar el nuevo estado.
    router.refresh()
    setClientSecret(null)
  }

  if (clientSecret) {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
        <StripeProvider clientSecret={clientSecret}>
          <StripePaymentForm
            amount={amount}
            onSuccess={handleSuccess}
            onBack={() => setClientSecret(null)}
          />
        </StripeProvider>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={startPayment}
        disabled={loading}
        className={
          className ??
          "flex w-full items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-50"
        }
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Preparando pago…
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" />
            Completar pago · ${amount.toFixed(2)}
          </>
        )}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
