import { NextResponse, type NextRequest } from "next/server"
import { getStripe } from "@/lib/stripe"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/payments/stripe/create-intent
 *
 * Crea un PaymentIntent de Stripe para procesar el pago con tarjeta.
 * Body: { amount: number (MXN), currency?: string, metadata?: Record<string, string> }
 *
 * Requiere sesión de usuario autenticado para evitar abuso del endpoint
 * (crear PaymentIntents anónimamente sin orden asociada).
 */
export async function POST(request: NextRequest) {
  try {
    // Solo usuarios autenticados pueden crear intents de pago.
    const supabaseClient = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const stripe = getStripe()
    const body = await request.json()
    const { amount, currency = "mxn", metadata = {} } = body

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Monto inválido" },
        { status: 400 }
      )
    }

    // Crear PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convertir MXN a centavos
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        ...metadata,
        source: "resurte.me",
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (error) {
    console.error("Stripe create-intent error:", error)
    const message =
      error instanceof Error ? error.message : "Error al crear PaymentIntent"

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
