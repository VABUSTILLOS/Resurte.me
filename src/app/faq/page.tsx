import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Preguntas frecuentes — Resurte.me",
  description:
    "Respuestas a las dudas más comunes sobre pedidos, entregas, devoluciones, pagos y programa de recompensas en Resurte.me.",
}

const FAQS = [
  {
    q: "¿Cómo hago un pedido?",
    a: "Elige tu ciudad, navega por categorías o busca productos, agrégalos al carrito y finaliza tu compra. También puedes pedir por WhatsApp.",
  },
  {
    q: "¿Cuánto tardan en entregar?",
    a: "Las entregas se realizan al día siguiente hábil en la mayoría de las zonas. En CDMX ofrecemos entregas express el mismo día para pedidos antes de las 11 AM.",
  },
  {
    q: "¿Cuál es el pedido mínimo?",
    a: "El pedido mínimo es de $500 MXN. Para pedidos mayores a $3,000 MXN el envío es gratis.",
  },
  {
    q: "¿Qué pasa si un producto llega en mal estado?",
    a: "Tienes 24 horas desde la entrega para reportarlo. Tomamos foto del producto y te lo reponemos en tu siguiente pedido o te reembolsamos el importe.",
  },
  {
    q: "¿Cómo funciona el programa de recompensas?",
    a: "Por cada compra acumulas puntos que puedes canjear por descuentos, productos gratis y beneficios exclusivos. Mientras más compras, más ganas.",
  },
  {
    q: "¿Ofrecen crédito?",
    a: "Sí. Para negocios recurrentes ofrecemos línea de crédito a 7, 15 y 30 días. Contáctanos para activar tu línea.",
  },
  {
    q: "¿Facturan?",
    a: "Sí, todas las compras incluyen factura electrónica (CFDI 4.0). Solo necesitas proporcionar tu RFC y uso de CFDI al registrarte.",
  },
  {
    q: "¿Cómo me registro como negocio?",
    a: "Crea tu cuenta en Resurte.me, completa los datos de tu negocio y en menos de 5 minutos ya puedes hacer tu primer pedido.",
  },
]

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Preguntas <span className="text-[#108910]">frecuentes</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Todo lo que necesitas saber para surtir tu negocio con Resurte.me.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-16 space-y-4">
        {FAQS.map(({ q, a }) => (
          <details
            key={q}
            className="border border-[#E5E7EB] rounded-[12px] p-6 group open:border-[#108910] open:bg-[#F9FAFB] transition-colors cursor-pointer"
          >
            <summary className="text-lg font-semibold text-[#242529] list-none flex items-center justify-between">
              {q}
              <span className="text-[#108910] text-xl group-open:rotate-45 transition-transform">
                +
              </span>
            </summary>
            <p className="mt-4 text-[#5C6068] leading-relaxed">{a}</p>
          </details>
        ))}
      </section>

      <section className="max-w-xl mx-auto px-4 pb-20 text-center">
        <p className="text-[#5C6068] mb-4">¿No encontraste lo que buscabas?</p>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 bg-[#108910] text-white font-semibold px-6 py-3 rounded-[10px] hover:bg-[#0D720D] transition-colors"
        >
          Contáctanos
        </Link>
      </section>
    </main>
  )
}
