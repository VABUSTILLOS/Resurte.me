"use client"

import dynamic from "next/dynamic"

// Estos overlays (drawer de checkout, upsell post-compra y cupón exit-intent)
// solo se muestran tras una interacción del usuario. Cargarlos con `next/dynamic`
// + `ssr: false` mantiene framer-motion, Stripe y el código de checkout fuera del
// bundle JS inicial de todas las páginas. Deben vivir en un Client Component:
// `ssr: false` no está permitido en Server Components.
const CheckoutDrawer = dynamic(
  () =>
    import("@/components/checkout/CheckoutDrawer").then((m) => m.CheckoutDrawer),
  { ssr: false }
)
const UpsellModal = dynamic(
  () =>
    import("@/components/checkout/UpsellModal").then((m) => m.UpsellModal),
  { ssr: false }
)
const ExitIntentCoupon = dynamic(
  () =>
    import("@/components/checkout/ExitIntentCoupon").then((m) => m.ExitIntentCoupon),
  { ssr: false }
)

export function CheckoutOverlays() {
  return (
    <>
      <CheckoutDrawer />
      <UpsellModal />
      <ExitIntentCoupon />
    </>
  )
}
