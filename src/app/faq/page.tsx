import type { Metadata } from "next"
import Link from "next/link"

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
    a: "El mínimo son $500 MXN. Y si tu pedido supera los $3,000 MXN, el envío va por nuestra cuenta.",
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
    a: "Claro. Si surtes con frecuencia, te abrimos línea de crédito a 7, 15 o 30 días. Sin aval, sin garantías rebuscadas. Evaluamos tu historial en la plataforma y en 24 horas tienes respuesta.",
  },
  {
    q: "¿Facturan mis compras?",
    a: "Todas. Cada pedido genera automáticamente tu CFDI 4.0. Solo registras tu RFC y uso de CFDI una vez, y de ahí en adelante nos encargamos de todo. Tus facturas listas para deducir, sin mover un dedo.",
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
    a: "CDMX, Monterrey, Guadalajara, Puebla, Querétaro y Mérida. Y cada mes sumamos colonias nuevas. Si tu zona aún no aparece, avísanos y te notificamos cuando lleguemos.",
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
            Lo que todos nos preguntan. Si no encuentras tu respuesta, échanos un mensaje.
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
        <p className="text-[#5C6068] mb-4">¿Faltó algo? Escríbenos sin pena.</p>
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
