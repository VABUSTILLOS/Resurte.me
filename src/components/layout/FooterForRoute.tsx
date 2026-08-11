"use client"

import { usePathname } from "next/navigation"
import { Footer } from "@/components/layout/footer"

/**
 * Route-aware site footer. The /panel section renders its own compact sliding
 * footer (PanelCompactFooter) inside the panel layout, so the tall public
 * footer is suppressed there.
 */
export function FooterForRoute() {
  const pathname = usePathname()
  if (pathname?.startsWith("/panel")) return null
  return <Footer />
}
