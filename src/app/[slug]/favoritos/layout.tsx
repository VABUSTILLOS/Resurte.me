import type { Metadata } from "next"

// Lista personal del comprador: noindex (mismo patrón que mis-pedidos).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
