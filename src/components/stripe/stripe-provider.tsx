"use client"

import { loadStripe, type Stripe } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import { useState, useEffect, type ReactNode } from "react"

let stripePromise: Promise<Stripe | null> | null = null

function getStripePromise() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!key) {
      console.error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set")
      return Promise.resolve(null)
    }
    stripePromise = loadStripe(key)
  }
  return stripePromise
}

interface StripeProviderProps {
  clientSecret: string
  children: ReactNode
}

/**
 * Wraps children with Stripe Elements, loading Stripe.js on demand.
 * Only renders once clientSecret is provided.
 */
export function StripeProvider({ clientSecret, children }: StripeProviderProps) {
  const [stripe, setStripe] = useState<Stripe | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getStripePromise()
      .then((s) => {
        if (!cancelled) {
          if (!s) setError("No se pudo cargar Stripe")
          setStripe(s)
        }
      })
      .catch(() => {
        if (!cancelled) setError("Error al inicializar Stripe")
      })
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        {error}. Recarga la página e intenta de nuevo.
      </div>
    )
  }

  if (!stripe) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-brand-600/30 border-t-brand-600 rounded-full animate-spin" />
        <span className="ml-3 text-sm text-gray-500">Cargando pasarela de pago...</span>
      </div>
    )
  }

  return (
    <Elements stripe={stripe} options={{ clientSecret }}>
      {children}
    </Elements>
  )
}
