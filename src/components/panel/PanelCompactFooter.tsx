import Link from "next/link"
import { Heart } from "lucide-react"
import { FOOTER_LINKS } from "@/components/layout/footer"

/**
 * Compact sliding footer for the /panel section only.
 * Brand row on top, link columns in a horizontal snap carousel (swipeable),
 * thin bottom bar. Mobile keeps padding below the PanelQuickNav bar.
 */
export function PanelCompactFooter() {
  return (
    <footer className="bg-[#242529] text-[#C7C8CD] panel-compact-footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 pb-[calc(4.5rem+var(--inset-bottom)+1.5rem)] lg:pb-6">
        {/* Brand — single compact row */}
        <div className="flex items-baseline gap-2 mb-4">
          <Link href="/" className="inline-block shrink-0" aria-label="Resurte.me — Ir al inicio">
            <span className="text-lg font-bold text-[#3CC73C]">Resurte</span>
            <span className="text-lg font-bold text-[#E8E9EB]">.me</span>
          </Link>
          <p className="min-w-0 truncate text-[12px] text-[#8F939B]">
            Central de Abastos Digital. Tu aliado en proveeduría para negocio.
          </p>
        </div>

        {/* Link columns — horizontal swipeable carousel */}
        <div className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory -mx-4 px-4">
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <nav key={title} aria-label={title} className="shrink-0 min-w-[58%] sm:min-w-[30%] snap-start">
              <h2 className="font-semibold text-[#E8E9EB] mb-1.5 text-[11px] uppercase tracking-wider">
                {title}
              </h2>
              <ul className="space-y-1">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[12px] leading-snug text-[#8F939B] hover:text-[#0E7A0E] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom bar — thin */}
        <div className="mt-4 pt-3 border-t border-[#343538] text-center text-[12px] text-[#A0A4AD]">
          <p className="flex items-center justify-center gap-1">
            Hecho con <Heart className="w-3 h-3 text-red-500 fill-red-500" aria-hidden="true" /> en México —
            Resurte.me © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </footer>
  )
}
