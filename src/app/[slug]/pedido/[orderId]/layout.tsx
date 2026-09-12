import type { Metadata } from "next"

// Ruta transaccional/privada: noindex + nofollow (mismo patrón que
// mis-pedidos). El enlace incluye un token capability, no debe indexarse.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
