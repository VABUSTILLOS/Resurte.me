import type { Metadata } from "next"
import Link from "next/link"
import {
  MessageCircle,
  Mail,
  Phone,
  Clock,
  MapPin,
  Package,
  RotateCcw,
  CreditCard,
  FileText,
  UserCog,
  Landmark,
  ChevronRight,
  ShieldCheck,
  ArrowRight,
} from "lucide-react"
import { ORGANIZATION_ID, SITE_NAME, SITE_URL } from "@/lib/author"
import { getFAQSchema } from "@/lib/blog-schema"
import { CREDIT_DAYS_PROSE, INVOICING, MIN_ORDER_MXN, formatMxn } from "@/lib/commercial-facts"

// Contenido estático: se prerenderiza una sola vez, sin lectura de
// cookies()/headers(), para no convertir la ruta en SSR por request.
export const dynamic = "force-static"

const PAGE_URL = `${SITE_URL}/soporte`
const PAGE_TITLE = "Soporte — Resurte.me"
const PAGE_DESCRIPTION =
  "Contacta a soporte de Resurte.me por WhatsApp, correo o teléfono. Horarios de atención, tiempos de respuesta y qué hacer si tu pedido, tu pago o tu factura no salieron como esperabas."

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    siteName: SITE_NAME,
  },
}

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"

/**
 * Datos de atención que exige Stripe en el sitio (nombre, contacto y
 * ubicación). Deben coincidir con los registrados en el panel de Stripe: si
 * cambias el teléfono, el correo o el domicilio allá, actualízalos aquí.
 */
const BUSINESS = {
  name: SITE_NAME,
  email: "hola@resurte.me",
  privacyEmail: "privacidad@resurte.me",
  phoneLabel: "+52 1 614 533 7486",
  phoneHref: "tel:+526145337486",
  whatsappHref: `https://wa.me/${WHATSAPP_NUMBER}`,
  location: "Chihuahua, México",
}

const HORARIO = [
  { dia: "Lunes a viernes", hora: "8:00 AM — 6:00 PM" },
  { dia: "Sábados", hora: "8:00 AM — 2:00 PM" },
  { dia: "Domingos y días festivos", hora: "Cerrado — el carrito sigue abierto 24/7" },
]

const CANALES = [
  {
    icon: MessageCircle,
    title: "WhatsApp",
    desc: "El canal más rápido. Te contestamos en minutos, no en horas. Manda foto, audio o lo que necesites.",
    href: BUSINESS.whatsappHref,
    label: "Abrir WhatsApp",
    bg: "bg-[#E8F5E8]",
    iconColor: "text-[#0F7A3D]",
    hoverBg: "hover:bg-[#0F7A3D] hover:text-white",
    external: true,
  },
  {
    icon: Mail,
    title: "Correo",
    desc: "¿Prefieres dejar todo por escrito? Te respondemos en un máximo de 4 horas hábiles, sin acuses automáticos.",
    href: `mailto:${BUSINESS.email}`,
    label: BUSINESS.email,
    bg: "bg-[#EEF2FF]",
    iconColor: "text-[#0E7A0E]",
    hoverBg: "hover:bg-[#0E7A0E] hover:text-white",
    external: false,
  },
  {
    icon: Phone,
    title: "Teléfono",
    desc: "Para lo urgente. Llamada directa, sin menú de extensiones, en horario de atención.",
    href: BUSINESS.phoneHref,
    label: BUSINESS.phoneLabel,
    bg: "bg-[#FFF7ED]",
    iconColor: "text-[#0E7A0E]",
    hoverBg: "hover:bg-[#0E7A0E] hover:text-white",
    external: false,
  },
]

const TEMAS = [
  {
    icon: Package,
    title: "Pedidos y entregas",
    desc: "Estado de tu pedido, cambios de dirección, horarios de reparto y entregas incompletas.",
    href: "/faq",
    label: "Ver preguntas frecuentes",
  },
  {
    icon: RotateCcw,
    title: "Devoluciones y reembolsos",
    desc: "Producto en mal estado o faltante: reponemos o reembolsamos dentro de 3 a 5 días hábiles.",
    href: "/terms#devoluciones",
    label: "Ver política de devoluciones",
  },
  {
    icon: CreditCard,
    title: "Pagos y cargos",
    desc: "Cargos duplicados, pagos rechazados, métodos de pago aceptados y comprobantes.",
    href: "/faq",
    label: "Cómo resolvemos un cargo",
  },
  {
    icon: FileText,
    title: "Facturación",
    desc: `Emitimos tu ${INVOICING} sin costo extra. Solo necesitamos tus datos fiscales una vez.`,
    href: "/negocio/facturacion",
    label: "Ver facturación electrónica",
  },
  {
    icon: UserCog,
    title: "Cuenta y acceso",
    desc: "Recuperar contraseña, cambiar datos de tu negocio, cerrar tu cuenta o pedir tus datos.",
    href: "/contact",
    label: "Escríbenos",
  },
  {
    icon: Landmark,
    title: "Crédito y pagos a plazo",
    desc: `Línea de crédito a ${CREDIT_DAYS_PROSE} días para clientes frecuentes. Sin aval ni garantías.`,
    href: "/negocio/credito",
    label: "Ver línea de crédito",
  },
]

const PASOS_REPORTE = [
  {
    title: "Ten a mano tu número de pedido",
    desc: "Lo recibes por correo y por WhatsApp al confirmar la compra. Es la referencia más rápida para localizarte.",
  },
  {
    title: "Escríbenos por WhatsApp",
    desc: "Manda tu número de pedido, una foto del producto y una frase de qué pasó. Con eso basta para abrir el reporte.",
  },
  {
    title: "Reporta dentro de 24 horas",
    desc: "Aceptamos reportes de productos en mal estado o faltantes dentro de las 24 horas posteriores a la entrega.",
  },
  {
    title: "Elegimos juntos la solución",
    desc: "Reponemos el producto en tu siguiente entrega o te devolvemos el dinero al método de pago original.",
  },
]

const FAQS_SOPORTE = [
  {
    q: "¿Cómo contacto a soporte de Resurte.me?",
    a: `Por WhatsApp al ${BUSINESS.phoneLabel} (la vía más rápida), por correo a ${BUSINESS.email} o por teléfono al ${BUSINESS.phoneLabel} en horario de atención: lunes a viernes de 8:00 AM a 6:00 PM y sábados de 8:00 AM a 2:00 PM.`,
  },
  {
    q: "¿En cuánto tiempo me responde soporte?",
    a: "Por WhatsApp respondemos en minutos durante el horario de atención. Por correo, en un máximo de 4 horas hábiles. Si escribes fuera de horario, tu mensaje se atiende en cuanto abrimos y el carrito sigue disponible 24/7.",
  },
  {
    q: "¿Qué hago si mi pedido llegó incompleto o en mal estado?",
    a: "Repórtalo dentro de las 24 horas posteriores a la entrega por WhatsApp con tu número de pedido y una foto. Reponemos el producto en tu siguiente entrega o te devolvemos el dinero; el reembolso o la reposición se procesa en un plazo de 3 a 5 días hábiles.",
  },
  {
    q: "¿Cómo pido mi factura (CFDI)?",
    a: `Todas tus compras se pueden facturar. Solicítala a soporte y te emitimos tu ${INVOICING} sin costo extra; solo necesitamos RFC, razón social, régimen fiscal, uso de CFDI y código postal fiscal. Puedes adelantar tus datos desde la sección de facturación electrónica.`,
  },
  {
    q: "¿Cómo cancelo o modifico un pedido ya hecho?",
    a: "Escríbenos por WhatsApp lo antes posible con tu número de pedido. Si todavía no salió a ruta, ajustamos o cancelamos sin costo. Si ya está en camino, lo tratamos como devolución.",
  },
  {
    q: "¿Cuál es el pedido mínimo y tiene costo el envío?",
    a: `El pedido mínimo es ${formatMxn(MIN_ORDER_MXN)} y el envío corre por nuestra cuenta a partir de ese monto. No hay cuota de membresía ni suscripción.`,
  },
]

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "@id": `${PAGE_URL}#contactpage`,
    name: "Soporte de Resurte.me",
    url: PAGE_URL,
    description: PAGE_DESCRIPTION,
    inLanguage: "es-MX",
    about: { "@id": ORGANIZATION_ID },
  },
  getFAQSchema(FAQS_SOPORTE.map(({ q, a }) => ({ question: q, answer: a }))),
]

export default function SoportePage() {
  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd.filter(Boolean)) }}
      />

      {/* Hero */}
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-block bg-[#E8F5E8] text-[#0E7A0E] text-sm font-semibold px-4 py-1.5 rounded-full mb-4">
            Atención humana, sin bots
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Soporte de <span className="text-[#0E7A0E]">Resurte.me</span>
          </h1>
          <p className="text-lg text-[#5C6068] leading-relaxed max-w-xl mx-auto">
            Todo lo que necesitas para contactarnos: canales, horarios, tiempos
            de respuesta y qué hacer si tu pedido, tu pago o tu factura no
            salieron como esperabas.
          </p>
        </div>
      </section>

      {/* Trust summary */}
      <section className="max-w-4xl mx-auto px-4 pb-12">
        <div className="bg-white border border-[#E5E7EB] rounded-[16px] p-6 grid grid-cols-3 gap-4 text-center">
          {[
            { value: "< 5 min", label: "Respuesta en WhatsApp" },
            { value: "< 4 h", label: "Respuesta por correo" },
            { value: "24 h", label: "Para reportar un pedido" },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-2xl font-extrabold text-[#0E7A0E]">{value}</p>
              <p className="text-xs text-[#5C6068] mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Canales de soporte */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] mb-2 text-center">
          Canales de atención
        </h2>
        <p className="text-[#5C6068] text-center mb-10">
          Elige el que más te acomode. Los tres llegan a personas reales que
          conocen tu negocio.
        </p>
        <div className="grid sm:grid-cols-3 gap-6">
          {CANALES.map(({ icon: Icon, title, desc, href, label, bg, iconColor, hoverBg, external }) => (
            <a
              key={title}
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className={`block border border-[#E5E7EB] rounded-[16px] p-8 text-center hover:shadow-lg transition-all group ${hoverBg}`}
            >
              <div className={`w-16 h-16 ${bg} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-white/20 transition-colors`}>
                <Icon className={`w-7 h-7 ${iconColor} group-hover:text-white transition-colors`} aria-hidden="true" />
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

      {/* Horario y ubicación */}
      <section className="bg-[#F9FAFB] py-20 px-4">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-10">
          <div className="bg-white border border-[#E5E7EB] rounded-[16px] p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#E8F5E8] rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-[#0E7A0E]" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold text-[#242529]">Horario de atención</h2>
            </div>
            <div className="space-y-3">
              {HORARIO.map(({ dia, hora }) => (
                <div
                  key={dia}
                  className="flex items-center justify-between gap-4 py-2 border-b border-[#F3F4F6] last:border-0"
                >
                  <span className="text-sm text-[#5C6068]">{dia}</span>
                  <span className="text-sm font-semibold text-[#242529] text-right">{hora}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-[#E5E7EB] rounded-[16px] p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#E8F5E8] rounded-xl flex items-center justify-center">
                <MapPin className="w-5 h-5 text-[#0E7A0E]" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold text-[#242529]">Dónde estamos</h2>
            </div>
            <p className="text-sm text-[#5C6068] leading-relaxed mb-4">
              Somos una operación 100% digital con cobertura en toda la
              República. Atendemos a distancia por WhatsApp, correo y teléfono.
            </p>
            <p className="text-sm font-semibold text-[#242529]">{BUSINESS.location}</p>
            <p className="text-xs text-[#5C6068] mt-1">
              Domicilio fiscal disponible en tu CFDI o a solicitud de soporte.
            </p>
          </div>
        </div>
      </section>

      {/* Temas de ayuda */}
      <section className="max-w-4xl mx-auto px-4 py-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] mb-2 text-center">
          ¿Con qué te ayudamos?
        </h2>
        <p className="text-[#5C6068] text-center mb-10">
          Los temas que más nos escriben, con la respuesta o la política a un
          clic.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMAS.map(({ icon: Icon, title, desc, href, label }) => (
            <Link
              key={title}
              href={href}
              className="flex flex-col bg-white border border-[#E5E7EB] rounded-[12px] p-6 hover:border-[#0E7A0E] hover:shadow-sm transition-all group"
            >
              <div className="w-10 h-10 bg-[#E8F5E8] rounded-xl flex items-center justify-center mb-3">
                <Icon className="w-5 h-5 text-[#0E7A0E]" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-[#242529] mb-1">{title}</h3>
              <p className="text-sm text-[#5C6068] leading-relaxed flex-1">{desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#0E7A0E]">
                {label}
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Cómo reportar un problema */}
      <section className="bg-[#F9FAFB] py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] mb-3">
              Si algo sale mal con tu pedido
            </h2>
            <p className="text-[#5C6068]">
              Sin vueltas y sin letras chiquitas. Así se resuelve.
            </p>
          </div>
          <ol className="space-y-4">
            {PASOS_REPORTE.map(({ title, desc }, index) => (
              <li
                key={title}
                className="flex items-start gap-4 bg-white border border-[#E5E7EB] rounded-[12px] p-5"
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[#0E7A0E] text-white text-sm font-bold flex items-center justify-center">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-[#242529] mb-1">{title}</h3>
                  <p className="text-sm text-[#5C6068] leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <a
              href={`${BUSINESS.whatsappHref}?text=${encodeURIComponent("Hola, necesito reportar un problema con mi pedido.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#0E7A0E] text-white font-semibold px-6 py-3 rounded-[10px] hover:bg-[#0D720D] transition-colors min-h-[44px]"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
              Reportar por WhatsApp
            </a>
            <a
              href={`mailto:${BUSINESS.email}?subject=${encodeURIComponent("Problema con mi pedido")}`}
              className="inline-flex items-center justify-center gap-2 bg-white border border-[#E5E7EB] text-[#242529] font-semibold px-6 py-3 rounded-[10px] hover:border-[#0E7A0E] transition-colors min-h-[44px]"
            >
              <Mail className="w-4 h-4" aria-hidden="true" />
              Escribir por correo
            </a>
          </div>
        </div>
      </section>

      {/* Políticas y enlaces legales */}
      <section className="max-w-4xl mx-auto px-4 py-20">
        <div className="bg-gradient-to-r from-[#E8F5E8] to-[#F0F7F0] border border-[#0E7A0E]/20 rounded-[16px] p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-6 h-6 text-[#0E7A0E]" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-[#242529]">Políticas y transparencia</h2>
          </div>
          <p className="text-sm text-[#5C6068] leading-relaxed mb-6">
            Queremos que sepas exactamente qué esperar de nosotros. Estas son
            las reglas que aplican a tu compra y a tus datos.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { label: "Términos y condiciones", href: "/terms" },
              { label: "Política de privacidad", href: "/privacy" },
              { label: "Devoluciones y reembolsos", href: "/terms#devoluciones" },
              { label: "Preguntas frecuentes", href: "/faq" },
            ].map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="inline-flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-[10px] px-4 py-3 text-sm font-medium text-[#242529] hover:border-[#0E7A0E] hover:text-[#0E7A0E] transition-colors min-h-[44px]"
              >
                <FileText className="w-4 h-4 text-[#0E7A0E]" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Datos de contacto del negocio (requisito de Stripe) */}
      <section className="max-w-3xl mx-auto px-4 pb-20">
        <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[16px] p-8">
          <h2 className="text-lg font-semibold text-[#242529] mb-4">Datos de contacto</h2>
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs uppercase tracking-wider text-[#5C6068] mb-1">Negocio</dt>
              <dd className="text-sm font-medium text-[#242529]">{BUSINESS.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-[#5C6068] mb-1">Soporte al cliente</dt>
              <dd className="text-sm font-medium text-[#242529]">
                <a href={`mailto:${BUSINESS.email}`} className="text-[#0E7A0E] hover:underline">
                  {BUSINESS.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-[#5C6068] mb-1">Teléfono / WhatsApp</dt>
              <dd className="text-sm font-medium text-[#242529]">
                <a href={BUSINESS.phoneHref} className="text-[#0E7A0E] hover:underline">
                  {BUSINESS.phoneLabel}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-[#5C6068] mb-1">Privacidad y datos personales</dt>
              <dd className="text-sm font-medium text-[#242529]">
                <a href={`mailto:${BUSINESS.privacyEmail}`} className="text-[#0E7A0E] hover:underline">
                  {BUSINESS.privacyEmail}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-[#5C6068] mb-1">Ubicación</dt>
              <dd className="text-sm font-medium text-[#242529]">{BUSINESS.location}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-[#5C6068] mb-1">Sitio</dt>
              <dd className="text-sm font-medium text-[#242529]">
                <a href={SITE_URL} className="text-[#0E7A0E] hover:underline">
                  resurte.me
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* FAQ de soporte */}
      <section className="bg-[#F9FAFB] py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] mb-8 text-center">
            Preguntas frecuentes de soporte
          </h2>
          <div className="space-y-4">
            {FAQS_SOPORTE.map(({ q, a }) => (
              <details
                key={q}
                className="bg-white border border-[#E5E7EB] rounded-[12px] p-6 group open:border-[#0E7A0E] transition-colors cursor-pointer"
              >
                <summary className="text-lg font-semibold text-[#242529] list-none flex items-center justify-between gap-4">
                  {q}
                  <span className="text-[#0E7A0E] text-xl group-open:rotate-45 transition-transform flex-shrink-0" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-4 text-[#5C6068] leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-[#0E7A0E] py-16 px-4 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            ¿No encontraste lo que buscabas?
          </h2>
          <p className="text-white/90 mb-6">
            Escríbenos y te contesta una persona real. Sin menús, sin bots, sin
            dejarte esperando.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 bg-white text-[#0E7A0E] font-semibold px-6 py-3 rounded-[10px] hover:bg-[#F0F7F0] transition-colors min-h-[44px]"
            >
              Ver todos los canales
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <Link
              href="/faq"
              className="inline-flex items-center justify-center gap-2 bg-transparent border border-white/60 text-white font-semibold px-6 py-3 rounded-[10px] hover:bg-white hover:text-[#0E7A0E] transition-colors min-h-[44px]"
            >
              Preguntas frecuentes
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
