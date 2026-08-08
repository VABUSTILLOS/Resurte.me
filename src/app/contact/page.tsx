import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Clock, MapPin, MessageCircle, Mail, Phone, ChevronRight } from "lucide-react"

export const metadata: Metadata = {
  title: "Contacto — Resurte.me",
  description:
    "Háblanos sin miedo. Estamos en WhatsApp, correo y teléfono para resolver tus dudas, cotizar por volumen o ayudarte con tu pedido. Respuesta en minutos, sin bots.",
}

const QUICK_ACTIONS = [
  {
    icon: "🛒",
    label: "Ayuda con mi pedido",
    message: "Hola, necesito ayuda con mi pedido.",
  },
  {
    icon: "💰",
    label: "Quiero cotizar por volumen",
    message: "Hola, quiero una cotización por volumen para mi negocio.",
  },
  {
    icon: "📋",
    label: "Quiero mi línea de crédito",
    message: "Hola, me interesa solicitar una línea de crédito.",
  },
  {
    icon: "🧾",
    label: "Duda con mi factura",
    message: "Hola, tengo una duda con mi facturación.",
  },
  {
    icon: "🔄",
    label: "Reportar un problema",
    message: "Hola, necesito reportar un problema con mi entrega.",
  },
  {
    icon: "⭐",
    label: "Programa de recompensas",
    message: "Hola, quiero saber más sobre el programa de recompensas.",
  },
]

const HORARIO = [
  { dia: "Lunes a viernes", hora: "8:00 AM — 6:00 PM" },
  { dia: "Sábados", hora: "8:00 AM — 2:00 PM" },
  { dia: "Domingos", hora: "Cerrado — pero el carrito sigue abierto 24/7" },
]

export default function ContactPage() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-block bg-[#E8F5E8] text-[#0E7A0E] text-sm font-semibold px-4 py-1.5 rounded-full mb-4">
            Respuesta en menos de 5 minutos
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Aquí hay personas reales,{" "}
            <span className="text-[#0E7A0E]">no un chat bot</span>
          </h1>
          <p className="text-lg text-[#5C6068] leading-relaxed max-w-xl mx-auto">
            Del otro lado hay un equipo que conoce tu negocio, tu zona y tus
            productos favoritos. Escríbenos como si le hablaras a tu proveedor
            de confianza — porque eso somos.
          </p>
        </div>
      </section>

      {/* Response guarantee */}
      <section className="max-w-4xl mx-auto px-4 pb-8">
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { value: "< 5 min", label: "Respuesta en WhatsApp" },
            { value: "< 4h", label: "Respuesta por correo" },
            { value: "100%", label: "Humanos, cero bots" },
          ].map(({ value, label }) => (
            <div key={label} className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[12px] p-4">
              <p className="text-2xl font-extrabold text-[#0E7A0E]">{value}</p>
              <p className="text-xs text-[#5C6068] mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact cards */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              icon: MessageCircle,
              title: "WhatsApp",
              desc: "El más rápido. Te contestamos en minutos, no en horas. Manda foto, audio, lo que necesites.",
              href: `https://wa.me/${whatsappNumber}`,
              label: "Abrir WhatsApp",
              bg: "bg-[#E8F5E8]",
              hoverBg: "hover:bg-[#0F7A3D] hover:text-white",
              iconColor: "text-[#0F7A3D]",
            },
            {
              icon: Mail,
              title: "Correo",
              desc: "¿Prefieres dejar todo por escrito? Máximo 4 horas y tienes respuesta. Sin acuses automáticos.",
              href: "mailto:hola@resurte.me",
              label: "hola@resurte.me",
              bg: "bg-[#EEF2FF]",
              hoverBg: "hover:bg-[#0E7A0E] hover:text-white",
              iconColor: "text-[#0E7A0E]",
            },
            {
              icon: Phone,
              title: "Teléfono",
              desc: "Para lo urgente. Una llamada directa, sin menú de extensiones. Atendemos en horario laboral.",
              href: "tel:+526145337486",
              label: "614 533 7486",
              bg: "bg-[#FFF7ED]",
              hoverBg: "hover:bg-[#0E7A0E] hover:text-white",
              iconColor: "text-[#0E7A0E]",
            },
          ].map(({ icon: Icon, title, desc, href, label, bg, hoverBg, iconColor }) => (
            <a
              key={title}
              href={href}
              target={href.startsWith("mailto") || href.startsWith("tel") ? undefined : "_blank"}
              rel={href.startsWith("mailto") || href.startsWith("tel") ? undefined : "noopener noreferrer"}
              className={`block border border-[#E5E7EB] rounded-[16px] p-8 text-center hover:shadow-lg transition-all group ${hoverBg}`}
            >
              <div className={`w-16 h-16 ${bg} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-white/20 transition-colors`}>
                <Icon className={`w-7 h-7 ${iconColor} group-hover:text-white transition-colors`} />
              </div>
              <h3 className="text-lg font-semibold text-[#242529] mb-2 group-hover:text-white transition-colors">
                {title}
              </h3>
              <p className="text-sm text-[#5C6068] mb-3 group-hover:text-white/80 transition-colors leading-relaxed">
                {desc}
              </p>
              <span className="text-sm font-semibold text-[#0E7A0E] group-hover:text-white transition-colors">
                {label} →
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* Quick action buttons */}
      <section className="bg-[#F9FAFB] py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] mb-3">
              Dinos qué necesitas y{" "}
              <span className="text-[#0E7A0E]">te llevamos directo</span>
            </h2>
            <p className="text-[#5C6068]">
              Cada botón abre WhatsApp con un mensaje listo. Solo pones enviar y
              en minutos te resolvemos.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {QUICK_ACTIONS.map(({ icon, label, message }) => (
              <a
                key={label}
                href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 bg-white border border-[#E5E7EB] rounded-[12px] p-4 hover:border-[#25D366] hover:shadow-sm transition-all group"
              >
                <span className="text-2xl flex-shrink-0">{icon}</span>
                <span className="text-sm font-medium text-[#242529] group-hover:text-[#0E7A0E] transition-colors flex-1">
                  {label}
                </span>
                <ChevronRight className="w-4 h-4 text-[#C4C7CC] group-hover:text-[#0F7A3D] transition-colors flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Business hours + location */}
      <section className="max-w-4xl mx-auto px-4 py-20">
        <div className="grid md:grid-cols-2 gap-10">
          <div className="bg-white border border-[#E5E7EB] rounded-[16px] p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#E8F5E8] rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-[#0E7A0E]" />
              </div>
              <h3 className="text-lg font-semibold text-[#242529]">
                Horario de atención
              </h3>
            </div>
            <div className="space-y-3">
              {HORARIO.map(({ dia, hora }) => (
                <div
                  key={dia}
                  className="flex items-center justify-between py-2 border-b border-[#F3F4F6] last:border-0"
                >
                  <span className="text-sm text-[#5C6068]">{dia}</span>
                  <span className="text-sm font-semibold text-[#242529]">
                    {hora}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-[16px] p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#E8F5E8] rounded-xl flex items-center justify-center">
                <MapPin className="w-5 h-5 text-[#0E7A0E]" />
              </div>
              <h3 className="text-lg font-semibold text-[#242529]">
                Oficina
              </h3>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-[#5C6068] leading-relaxed">
                No tenemos sucursal abierta al público — somos 100% digitales.
                Pero si necesitas visitarnos para una reunión de negocio o
                conocer nuestra operación, agenda con tu ejecutivo y te
                recibimos.
              </p>
              <p className="text-xs text-[#9CA3AF]">
                Chihuahua, México
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ teaser */}
      <section className="bg-gradient-to-t from-[#F0F7F0] to-white py-16 px-4 text-center">
        <div className="max-w-lg mx-auto">
          <h2 className="text-xl font-bold text-[#242529] mb-3">
            ¿Quizá tu duda ya tiene respuesta?
          </h2>
          <p className="text-sm text-[#5C6068] mb-6">
            Pedidos, entregas, devoluciones, facturación, crédito. Las dudas más
            comunes ya las resolvimos.
          </p>
          <Link
            href="/faq"
            className="inline-flex items-center gap-2 bg-[#0E7A0E] text-white font-semibold px-6 py-3 rounded-[10px] hover:bg-[#0D720D] transition-colors"
          >
            Ver preguntas frecuentes
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-[#0E7A0E] py-16 px-4 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            ¿Todavía no tienes cuenta?
          </h2>
          <p className="text-white/90 mb-6">
            Regístrate gratis en 5 minutos y empieza a pedir hoy. Sin
            compromiso, sin mensualidades.
          </p>
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 bg-white text-[#0E7A0E] font-semibold px-8 py-3 rounded-[10px] hover:bg-[#F0F7F0] transition-colors"
          >
            Crear cuenta gratis
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
