import type { Metadata } from "next"
import { AdminShell } from "./admin-shell"

// Backoffice interno: noindex + nofollow. No se bloquea en robots.txt para
// que Google pueda rastrearlo y respetar la directiva.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
