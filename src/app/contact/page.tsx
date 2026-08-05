import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contacto — Resurte.me",
  description:
    "Háblanos sin miedo. Estamos en WhatsApp, correo y teléfono para resolver tus dudas, cotizar por volumen o ayudarte con tu pedido.",
}

export default function ContactPage() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"

  return (
    <main className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            <span className="text-[#108910]">Contáctanos</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Elige cómo prefieres hablarnos. Contestamos rápido, sin bots.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-16">
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              icon: "💬",
              title: "WhatsApp",
              desc: "El más rápido. Contestamos en minutos, en horario laboral.",
              href: `https://wa.me/${whatsappNumber}`,
              label: "Mandar WhatsApp",
            },
            {
              icon: "📧",
              title: "Correo",
              desc: "¿Prefieres formalidad? Te respondemos en máximo 4 horas.",
              href: "mailto:hola@resurte.me",
              label: "Escribir correo",
            },
            {
              icon: "📞",
              title: "Teléfono",
              desc: "Llamada directa. Lunes a viernes, 8 AM a 6 PM.",
              href: "tel:+526145337486",
              label: "Llamar",
            },
          ].map(({ icon, title, desc, href, label }) => (
            <a
              key={title}
              href={href}
              target={href.startsWith("mailto") || href.startsWith("tel") ? undefined : "_blank"}
              rel={href.startsWith("mailto") || href.startsWith("tel") ? undefined : "noopener noreferrer"}
              className="block border border-[#E5E7EB] rounded-[12px] p-6 text-center hover:border-[#108910] hover:shadow-md transition-all group"
            >
              <span className="text-3xl mb-3 block">{icon}</span>
              <h3 className="text-lg font-semibold text-[#242529] mb-1">
                {title}
              </h3>
              <p className="text-sm text-[#5C6068] mb-3">{desc}</p>
              <span className="text-sm font-semibold text-[#108910] group-hover:underline">
                {label} →
              </span>
            </a>
          ))}
        </div>
      </section>
    </main>
  )
}
