import type { Metadata } from "next"
import { requireSellerOrAdmin } from "@/lib/roles"
import { ComercializacionLayoutClient } from "./comercializacion-layout-client"

export const metadata: Metadata = {
  title: "Comercialización | Resurte",
  description:
    "Panel de ventas: gestiona prospectos, registra llamadas y WhatsApp, y coloca pedidos para tus clientes restauranteros.",
}

// Los datos del CRM dependen de la sesión del vendedor: nunca prerender.
export const dynamic = "force-dynamic"

export default async function ComercializacionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Solo vendedores y admin (master). Clientes y no-autenticados son redirigidos.
  await requireSellerOrAdmin()
  return <ComercializacionLayoutClient>{children}</ComercializacionLayoutClient>
}
