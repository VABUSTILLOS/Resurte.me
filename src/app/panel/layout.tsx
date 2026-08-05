import type { Metadata } from "next"
import { PanelLayoutClient } from "./panel-layout-client"

export const metadata: Metadata = {
  title: "Panel de Herramientas | Resurte",
  description:
    "Herramientas inteligentes para restauranteros: costea tu menú, planifica pedidos, calcula mermas y más.",
}

// Must be dynamic — all panel tools are interactive client components
// wrapped in RestaurantProvider that SSR cannot prerender.
export const dynamic = "force-dynamic"

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PanelLayoutClient>{children}</PanelLayoutClient>
}
