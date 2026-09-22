import Stripe from "stripe"
import { allowsLiveStripeKey } from "@/lib/deploy-env"

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not defined")
  }
  // Una llave live fuera de producción cobra de verdad: en un preview de
  // staging eso es dinero real por una prueba. Se corta aquí, en el único
  // punto donde se construye el cliente, y no en cada llamador.
  if (key.startsWith("sk_live_") && !allowsLiveStripeKey()) {
    throw new Error(
      "STRIPE_SECRET_KEY es una llave live y este entorno no es producción. " +
        "Usa una llave de modo test (sk_test_…) o, si de verdad quieres probar " +
        "contra la cuenta real desde tu máquina, define ALLOW_LIVE_STRIPE=1."
    )
  }
  if (!_stripe) {
    _stripe = new Stripe(key, {
      apiVersion: "2026-08-26.dahlia",
      typescript: true,
    })
  }
  return _stripe
}
