import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getUserRole } from "@/lib/roles"
import { getPanelOperatingState } from "@/lib/foodos-tier"
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

  // Nivel de compras del restaurante que se está operando. Se resuelve una
  // sola vez aquí y baja a todo el panel por contexto: el hub y las
  // herramientas premium comparten el mismo dato sin volver a consultar la
  // base. La misma lectura devuelve si la sesión es de soporte (P14).
  const { entitlements, impersonating, operatingRestaurantName } =
    await getPanelOperatingState()

  // El admin de plataforma no tiene restaurante propio (su nivel real es
  // Verde), pero necesita ver y probar todo para dar soporte. El desbloqueo
  // se resuelve en el contexto, no falseando el nivel.
  //
  // Mientras impersona, la exención se apaga en las dos capas: el servidor
  // (`requireFoodosFeature`) y aquí. Si el cliente siguiera desbloqueado, el
  // admin vería la herramienta disponible y el guardado fallaría con un error
  // del servidor que la UI no puede explicar.
  const isAdmin = role === "admin" && !impersonating

  return (
    <PanelLayoutClient
      entitlements={entitlements}
      isAdmin={isAdmin}
      operatingRestaurantName={operatingRestaurantName}
    >
      {children}
    </PanelLayoutClient>
  )
}
