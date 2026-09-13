import Link from "next/link"
import { Heart, MessageCircle, Mail } from "lucide-react"

const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486").replace(/\D/g, "")

export const FOOTER_LINKS = {
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
    { label: "Marketplace hoyquecomemos", href: "/comer" },
  ],
  Recursos: [
    { label: "Blog", href: "/blog" },
    { label: "RSS", href: "/rss.xml" },
  ],
}

export function Footer() {
  return (
    <footer className="bg-[#242529] text-[#C7C8CD] mt-auto site-footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-[calc(2.25rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-5 sm:gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-block mb-2 sm:mb-4" aria-label="Resurte.me — Ir al inicio">
              <span className="text-xl font-bold text-[#3CC73C]">Resurte</span>
              <span className="text-xl font-bold text-[#E8E9EB]">.me</span>
            </Link>
            <p className="text-[13px] sm:text-sm text-[#8F939B]">
              Central de Abastos Digital. Tu aliado en proveeduría para negocio.
            </p>
            {/* Contacto directo: los dos canales que más usa un restaurantero */}
            <div className="mt-3 flex flex-col gap-2">
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("¡Hola! Necesito ayuda con Resurte.me")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[13px] text-[#3CC73C] hover:text-[#7ADE7A] transition-colors"
              >
                <MessageCircle className="w-4 h-4" aria-hidden="true" />
                WhatsApp directo
              </a>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 text-[13px] text-[#8F939B] hover:text-[#E8E9EB] transition-colors"
              >
                <Mail className="w-4 h-4" aria-hidden="true" />
                Escríbenos
              </Link>
            </div>
          </div>

          {/* Link sections */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <nav key={title} aria-label={title}>
              <h2 className="font-semibold text-[#E8E9EB] mb-1.5 sm:mb-3 text-[13px] sm:text-sm uppercase tracking-wider">
                {title}
              </h2>
              <ul className="space-y-1 sm:space-y-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-block text-[13px] sm:text-sm leading-snug text-[#8F939B] hover:text-[#0E7A0E] hover:underline underline-offset-4 decoration-[#0E7A0E]/40 transition-colors py-1 sm:py-0"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-5 sm:mt-10 pt-4 sm:pt-6 border-t border-[#343538] text-center text-sm text-[#A0A4AD]">
          <p className="flex items-center justify-center gap-1">
            Hecho con <Heart className="w-3 h-3 text-red-500 fill-red-500" aria-hidden="true" /> en
            México — Resurte.me — Central de Abastos Digital © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </footer>
  )
}
