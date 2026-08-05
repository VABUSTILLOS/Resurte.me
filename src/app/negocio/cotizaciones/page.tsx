import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Box, Calculator, MessageCircle } from "lucide-react"

export const metadata: Metadata = {
  title: "Cotizaciones por volumen — Resurte.me",
  description:
    "¿Compras grandes volúmenes? Solicita una cotización especial para tu negocio. Mejores precios para pedidos al mayoreo en Resurte.me.",
}

export default function CotizacionesPage() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"

  return (
    <main className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Cotizaciones por{" "}
            <span className="text-[#108910]">volumen</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            ¿Compras al mayoreo? Te damos precio especial. Mientras más compras,
            más ahorras.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {[
            {
              icon: Calculator,
              title: "Precios a tu medida",
              desc: "Cotizaciones personalizadas según el volumen y frecuencia de tus pedidos. No hay dos negocios iguales.",
            },
            {
              icon: Box,
              title: "Cualquier volumen",
              desc: "Desde media tonelada de fruta hasta pedidos consolidados con múltiples proveedores. Lo manejamos todo.",
            },
            {
              icon: MessageCircle,
              title: "Ejecutivo dedicado",
              desc: "Un ejecutivo de cuenta exclusivo para tu negocio. Respuesta rápida directo por WhatsApp.",
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
            Solicita tu cotización
          </h2>
          <p className="text-[#5C6068] mb-6 max-w-lg mx-auto">
            Cuéntanos qué productos necesitas y en qué volumen. Te respondemos
            con una cotización personalizada en menos de 2 horas.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hola, quiero una cotización por volumen para mi negocio.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white font-semibold px-6 py-3 rounded-[10px] hover:bg-[#1DA851] transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Solicitar por WhatsApp
            </a>
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center gap-2 border border-[#108910] text-[#108910] font-semibold px-6 py-3 rounded-[10px] hover:bg-[#F0F7F0] transition-colors"
            >
              Crear cuenta
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
