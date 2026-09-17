import type { Metadata } from "next"
import Link from "next/link"
import { Shield } from "lucide-react"
import { PREGUNTAS } from "@/lib/preguntas"
import { CREDIT_DAYS_PROSE, DELIVERY_CITIES, FREE_SHIPPING_MXN, INVOICING, MIN_ORDER_MXN, formatMxn } from "@/lib/commercial-facts"

export const metadata: Metadata = {
  title: "Preguntas frecuentes — Resurte.me",
  description:
    "¿Cómo pido? ¿Entregan en mi zona? ¿Aceptan devoluciones? Encuentra aquí las respuestas a las dudas más comunes sobre Resurte.me.",
}

const FAQS = [
  {
    q: "¿Cómo hago mi primer pedido?",
    a: "Facilísimo. Elige tu ciudad, explora las categorías o busca el producto que necesitas, agrégalo al carrito y finaliza. En 3 clics ya está hecho. ¿Prefieres trato directo? Pide por WhatsApp y te lo armamos nosotros.",
  },
  {
    q: "¿En cuánto tiempo me entregan?",
    a: "Pedidos antes de las 5 PM se entregan al siguiente día hábil en todas nuestras zonas. En CDMX tenemos ruta express: pides antes de las 11 AM y te llega el mismo día. Así no te quedas nunca sin insumos.",
  },
  {
    q: "¿Hay pedido mínimo?",
    a: `El mínimo son ${formatMxn(MIN_ORDER_MXN)}. Y si tu pedido supera los ${formatMxn(FREE_SHIPPING_MXN)}, el envío va por nuestra cuenta.`,
  },
  {
    q: "¿Qué pasa si algo llega mal?",
    a: "Tranquilo. Tienes 24 horas para reportarlo. Solo mándanos una foto y elegimos juntos: te lo reponemos en tu siguiente entrega o te devolvemos el dinero. Sin peros, sin vueltas.",
  },
  {
    q: "¿Cómo funciona el programa de recompensas?",
    a: "Cada compra suma puntos. Los canjeas por descuentos, productos gratis y beneficios exclusivos. Mientras más constante seas surtiendo con nosotros, más grande es la recompensa. Es nuestra forma de decir gracias.",
  },
  {
    q: "¿Me pueden dar crédito?",
    a: `Claro. Si surtes con frecuencia, te abrimos línea de crédito a ${CREDIT_DAYS_PROSE} días. Sin aval, sin garantías rebuscadas. Evaluamos tu historial en la plataforma y te decimos si aplica.`,
  },
  {
    q: "¿Facturan mis compras?",
    a: `Sí. Todas las compras se pueden facturar: solicítala y te emitimos tu ${INVOICING} sin costo extra. Necesitamos RFC, razón social, régimen fiscal, uso de CFDI y código postal fiscal.`,
  },
  {
    q: "¿Cómo registro mi negocio?",
    a: "Das clic en crear cuenta, pones los datos de tu negocio y en menos de 5 minutos estás listo para pedir. Sin visitas, sin papeleo, sin llamadas. Todo desde donde estés.",
  },
  {
    q: "¿Puedo cotizar por volumen?",
    a: "Sí. Si manejas volúmenes grandes, te asignamos un ejecutivo dedicado que te arma una cotización a la medida. Escríbenos por WhatsApp y en menos de 2 horas la tienes.",
  },
  {
    q: "¿En qué ciudades entregan?",
    a: `Estamos en ${DELIVERY_CITIES} ciudades: CDMX, Guadalajara, Monterrey, Puebla, Toluca, Querétaro, León, Tijuana, Mérida, San Luis Potosí, Aguascalientes, Hermosillo, Saltillo, Culiacán, Morelia, Chihuahua, Veracruz, Villahermosa, Cancún y Torreón. Y cada mes sumamos zonas nuevas. Si la tuya aún no aparece, avísanos y te notificamos cuando lleguemos.`,
  },
]

// Datos estructurados FAQPage: ayuda a los buscadores y a los motores de IA
// (AI Overviews, ChatGPT, Perplexity) a entender y citar estas respuestas.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
}

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Preguntas <span className="text-[#0E7A0E]">frecuentes</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Lo que todos nos preguntan. Si no encuentras tu respuesta, échanos un mensaje.
          </p>
        </div>
      </section>

      {/* Trust bar */}
      <section className="max-w-3xl mx-auto px-4 pb-8">
        <div className="bg-white border border-[#E5E7EB] rounded-[16px] p-6 grid grid-cols-3 gap-4 text-center">
          {[
            { value: "98%", label: "Entregas a tiempo" },
            { value: "< 5 min", label: "Respuesta en WhatsApp" },
            { value: "24h", label: "Garantía de devolución" },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-2xl font-extrabold text-[#0E7A0E]">{value}</p>
              <p className="text-xs text-[#5C6068] mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-16 space-y-4">
        {FAQS.map(({ q, a }) => (
          <details
            key={q}
            className="border border-[#E5E7EB] rounded-[12px] p-6 group open:border-[#0E7A0E] open:bg-[#F9FAFB] transition-colors cursor-pointer"
          >
            <summary className="text-lg font-semibold text-[#242529] list-none flex items-center justify-between">
              {q}
              <span className="text-[#0E7A0E] text-xl group-open:rotate-45 transition-transform">
                +
              </span>
            </summary>
            <p className="mt-4 text-[#5C6068] leading-relaxed">{a}</p>
          </details>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/preguntas"
          className="block border border-[#E5E7EB] rounded-[16px] p-6 hover:border-[#0E7A0E] transition-colors group"
        >
          <h2 className="font-semibold text-[#242529] mb-1 flex items-center gap-2">
            ¿Buscas algo más específico?
            <span className="text-[#0E7A0E] group-hover:translate-x-0.5 transition-transform">
              &rarr;
            </span>
          </h2>
          <p className="text-sm text-[#5C6068] leading-relaxed">
            Tenemos {PREGUNTAS.length} respuestas directas sobre costos, proveeduría, operación,
            inventario, marketing y herramientas para restaurantes.
          </p>
        </Link>
        <Link
          href="/precios"
          className="block border border-[#E5E7EB] rounded-[16px] p-6 hover:border-[#0E7A0E] transition-colors group"
        >
          <h2 className="font-semibold text-[#242529] mb-1 flex items-center gap-2">
            ¿Cuánto cuesta cada insumo?
            <span className="text-[#0E7A0E] group-hover:translate-x-0.5 transition-transform">
              &rarr;
            </span>
          </h2>
          <p className="text-sm text-[#5C6068] leading-relaxed">
            Consulta el índice de precios de referencia por insumo, unidad y ciudad, con fecha de
            corte, rango observado y número de tiendas comparadas.
          </p>
        </Link>
      </section>

      {/* Guarantee highlight */}
      <section className="max-w-xl mx-auto px-4 pb-8">
        <div className="bg-gradient-to-r from-[#E8F5E8] to-[#F0F7F0] border border-[#0E7A0E]/20 rounded-[16px] p-6 flex items-start gap-4">
          <div className="w-10 h-10 bg-[#0E7A0E] rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-[#242529] mb-1">Garantía sin letras chiquitas</h3>
            <p className="text-sm text-[#5C6068] leading-relaxed">
              Producto en mal estado: te lo reponemos o te devolvemos el dinero.
              ¿Entrega tarde? Esa va con descuento. Tu primer pedido tiene
              garantía de satisfacción total. Sin peros.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-xl mx-auto px-4 pb-20 text-center">
        <p className="text-[#5C6068] mb-4">¿Faltó algo? Escríbenos sin pena.</p>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 bg-[#0E7A0E] text-white font-semibold px-6 py-3 rounded-[10px] hover:bg-[#0D720D] transition-colors"
        >
          Contáctanos
        </Link>
      </section>
    </div>
  )
}
