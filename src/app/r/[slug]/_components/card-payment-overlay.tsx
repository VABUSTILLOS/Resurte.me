"use client"

import { StripeProvider } from "@/components/stripe/stripe-provider"
import { StripePaymentForm } from "@/components/stripe/stripe-payment-form"
import { formatMoney } from "@/lib/foodos"

export function CardPaymentOverlay({
  clientSecret,
  amount,
  onSuccess,
  onCancel,
}: {
  clientSecret: string
  amount: number
  onSuccess: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md">
        <h2 className="font-black text-stone-900 text-lg mb-1">Pago con tarjeta</h2>
        <p className="text-sm text-stone-500 mb-4">Total a pagar: {formatMoney(amount)}</p>
        <StripeProvider clientSecret={clientSecret}>
          <StripePaymentForm amount={amount} onSuccess={onSuccess} onBack={onCancel} />
        </StripeProvider>
      </div>
    </div>
  )
}
