import Link from "next/link"
import { Heart } from "lucide-react"

const FOOTER_LINKS = {
  Compañía: [
    { label: "Sobre nosotros", href: "/about" },
    { label: "Zonas de entrega", href: "/ciudades" },
    { label: "Trabaja con nosotros", href: "/careers" },
  ],
  Ayuda: [
    { label: "Preguntas frecuentes", href: "/faq" },
    { label: "Contacto", href: "/contact" },
    { label: "Política de privacidad", href: "/privacy" },
    { label: "Términos y condiciones", href: "/terms" },
  ],
  "Para tu negocio": [
    { label: "Línea de crédito", href: "/negocio/credito" },
    { label: "Facturación electrónica", href: "/negocio/facturacion" },
    { label: "Cotizaciones por volumen", href: "/negocio/cotizaciones" },
  ],
}

export function Footer() {
  return (
    <footer className="bg-[#242529] text-[#C7C8CD] mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <Link href="/" className="inline-block mb-4">
              <span className="text-xl font-bold text-[#108910]">Resurte</span>
              <span className="text-xl font-bold text-[#E8E9EB]">.me</span>
            </Link>
            <p className="text-sm text-[#8F939B]">
              Central de Abastos Digital. Tu aliado en proveeduría para negocio.
            </p>
          </div>

          {/* Link sections */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h3 className="font-semibold text-[#E8E9EB] mb-3 text-sm uppercase tracking-wider">
                {title}
              </h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-[#8F939B] hover:text-[#108910] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-[#343538] text-center text-sm text-[#72767E]">
          <p className="flex items-center justify-center gap-1">
            Hecho con <Heart className="w-3 h-3 text-red-500 fill-red-500" /> en
            México — Resurte.me — Central de Abastos Digital © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </footer>
  )
}
