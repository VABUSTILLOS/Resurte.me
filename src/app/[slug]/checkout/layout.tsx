import type { Metadata } from "next"

// Ruta transaccional/privada: noindex + nofollow. No se bloquea en robots.txt
// para que Google pueda rastrearla y respetar esta directiva.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
