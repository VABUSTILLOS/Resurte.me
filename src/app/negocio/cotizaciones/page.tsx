import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Box, Calculator, MessageCircle, Clock, Star } from "lucide-react"

export const metadata: Metadata = {
  title: "Cotizaciones por volumen — Resurte.me",
  description:
    "¿Compras por tonelada? Te damos precio de mayoreo real. Cotización personalizada en menos de 2 horas con ejecutivo dedicado.",
}

export default function CotizacionesPage() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"

  return (
    <main className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Precio de mayoreo,{" "}
            <span className="text-[#108910]">trato personal</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Mientras más compras, menos pagas. Te asignamos un ejecutivo
            dedicado que te arma la cotización a tu medida. Sin menú del día,
            sin precios fijos: tu volumen manda.
          </p>
        </div>
      </section>

      {/* Guarantee strip */}
      <section className="max-w-xl mx-auto px-4 pb-10">
        <div className="bg-gradient-to-r from-[#E8F5E8] to-[#F0F7F0] border border-[#108910]/20 rounded-[16px] p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-[#108910] rounded-xl flex items-center justify-center flex-shrink-0">
            <Clock className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#242529]">Cotización en menos de 2 horas, garantizado</p>
            <p className="text-xs text-[#5C6068]">Si en 2 horas no tienes tu cotización, te mandamos un cupón de $200 para tu primer pedido. Así de seguros estamos.</p>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {[
            {
              icon: Calculator,
              title: "Precio a tu medida",
              desc: "Nada de tablas genéricas. Tu cotización se calcula según lo que compras, qué tan seguido y en qué volumen. Más justo, imposible.",
            },
            {
              icon: Box,
              title: "Del kilo a la tonelada",
              desc: "Fruta, verdura, abarrotes, lácteos, carnes. Manejamos desde entregas unitarias hasta pedidos por tonelada, consolidando todo en una sola entrega.",
            },
            {
              icon: MessageCircle,
              title: "Tu propio ejecutivo",
              desc: "Una persona real, dedicada a tu cuenta. Te contesta por WhatsApp, te resuelve cambios de último minuto y te consigue lo que necesites aunque no esté en catálogo.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="text-center">
              <div className="w-14 h-14 bg-[#E8F5E8] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Icon className="w-7 h-7 text-[#108910]" />
              </div>
              <h3 className="text-lg font-semibold text-[#242529] mb-2">
                {title}
              </h3>
              <p className="text-sm text-[#5C6068] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-[#F9FAFB] rounded-[16px] p-8 text-center">
          <h2 className="text-2xl font-bold text-[#242529] mb-3">
            ¿Listo para pagar menos?
          </h2>
          <p className="text-[#5C6068] mb-6 max-w-lg mx-auto">
            Mándanos un WhatsApp con lo que necesitas y en menos de 2 horas te
            mandamos tu cotización. Sin compromiso, sin letras chiquitas.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hola, quiero una cotización por volumen para mi negocio.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white font-semibold px-6 py-3 rounded-[10px] hover:bg-[#1DA851] transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Pedir cotización por WhatsApp
            </a>
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center gap-2 border border-[#108910] text-[#108910] font-semibold px-6 py-3 rounded-[10px] hover:bg-[#F0F7F0] transition-colors"
            >
              Crear cuenta primero
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
