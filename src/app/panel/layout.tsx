import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getUserRole } from "@/lib/roles"
import { PanelLayoutClient } from "./panel-layout-client"

export const metadata: Metadata = {
  title: "Mi Restaurante | Resurte",
  description:
    "Herramientas inteligentes para restauranteros: costea tu menú, planifica pedidos, calcula mermas y más.",
}

// Must be dynamic — all panel tools are interactive client components
// wrapped in RestaurantProvider that SSR cannot prerender.
export const dynamic = "force-dynamic"

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Los vendedores viven su trabajo en /comercializacion: no acceden a
  // "Mi Restaurante". Master/admin y clientes sí.
  const role = await getUserRole()
  if (role === "vendedor") {
    redirect("/comercializacion")
  }
  return <PanelLayoutClient>{children}</PanelLayoutClient>
}
