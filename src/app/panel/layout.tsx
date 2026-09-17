import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getUserRole } from "@/lib/roles"
import { getMyEntitlements } from "@/lib/foodos-tier"
import { PanelLayoutClient } from "./panel-layout-client"

export const metadata: Metadata = {
  title: "Mi Restaurante | Resurte",
  description:
    "Herramientas inteligentes para restauranteros: costea tu menú, planifica pedidos, calcula mermas y más.",
  // Área privada (requiere sesión): fuera del índice de buscadores.
  robots: { index: false, follow: false },
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

  // Nivel de compras del restaurante dueño. Se resuelve una sola vez aquí y
  // baja a todo el panel por contexto: el hub y las herramientas premium
  // comparten el mismo dato sin volver a consultar la base.
  const entitlements = await getMyEntitlements()

  return <PanelLayoutClient entitlements={entitlements}>{children}</PanelLayoutClient>
}
