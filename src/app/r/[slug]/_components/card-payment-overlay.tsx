"use client"

import { useState } from "react"
import { StripeProvider } from "@/components/stripe/stripe-provider"
import { StripePaymentForm } from "@/components/stripe/stripe-payment-form"
import { formatMoney } from "@/lib/foodos"
import type { PaymentNextAction } from "@/lib/payment-next-action"
import { LocalPaymentInstructions } from "./local-payment-instructions"

/**
 * Overlay de pago del micrositio FoodOS. Cubre los dos desenlaces posibles de
 * un PaymentIntent:
 *
 *  - Confirmación inmediata (tarjeta, wallets) → `onSuccess`.
 *  - Método local asíncrono (OXXO, SPEI, CoDi) → el intent queda pendiente de
 *    acción y se muestran las instrucciones (voucher, CLABE, QR). El pago se
 *    acredita después, por webhook, así que aquí solo se informa.
 *
 * `returnUrl` es obligatoria para los métodos que salen del navegador (CoDi y
 * el 3DS de la tarjeta); sin ella `confirmPayment` falla.
 */
export function CardPaymentOverlay({
  clientSecret,
  amount,
  returnUrl,
  orderId,
  slug,
  onSuccess,
  onCancel,
}: {
  clientSecret: string
  amount: number
  /** URL de retorno que exige Stripe para métodos con redirect. */
  returnUrl: string
  /** Pedido FoodOS en curso; se usa para consultar su estado real. */
  orderId: string
  /** Slug del restaurante, requerido por el endpoint de tracking. */
  slug: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const [nextAction, setNextAction] = useState<PaymentNextAction | null>(null)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md my-auto">
        {nextAction ? (
          <LocalPaymentInstructions
            action={nextAction}
            amount={amount}
            orderId={orderId}
            slug={slug}
            onPaid={onSuccess}
            onClose={onCancel}
          />
        ) : (
          <>
            <h2 className="font-black text-stone-900 text-lg mb-1">Pago con tarjeta</h2>
            <p className="text-sm text-stone-500 mb-4">
              Total a pagar: {formatMoney(amount)}
            </p>
            <StripeProvider clientSecret={clientSecret}>
              <StripePaymentForm
                amount={amount}
                returnUrl={returnUrl}
                onNextAction={(action) => setNextAction(action)}
                onSuccess={onSuccess}
                onBack={onCancel}
              />
            </StripeProvider>
          </>
        )}
      </div>
    </div>
  )
}
