import Link from "next/link"
import { ArrowRight, MapPin, MessageCircle } from "lucide-react"
import { WHATSAPP_HREF } from "@/lib/business"
import {
  CHIHUAHUA_DELIVERY_ZONES,
  LOCAL_CITY_NAME,
  LOCAL_COVERAGE_SCOPE,
  LOCAL_MODEL_PROSE,
  LOCAL_OPERATION_PROSE,
  getLocalFaq,
} from "@/lib/local-content"

/**
 * Bloque de contenido local de la landing.
 *
 * Existe para que la página de la ciudad responda por sí sola "¿dónde operan y
 * a quién le entregan?" — antes esa respuesta solo estaba en el pie de página.
 * El texto visible y el `FAQPage` del JSON-LD salen de la misma fuente
 * (`local-content.ts`), así que no pueden desincronizarse.
 */
export function LocalCoverage({ citySlug }: { citySlug: string }) {
  const faq = getLocalFaq()

  return (
    <section
      id="cobertura-local"
      className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20"
    >
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#0E7A0E] mb-2.5">
            Dónde operamos
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] tracking-tight text-balance">
            Central de abastos digital en {LOCAL_CITY_NAME}
          </h2>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-4 leading-relaxed">
            {LOCAL_OPERATION_PROSE}
          </p>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-3 leading-relaxed">
            {LOCAL_MODEL_PROSE}
          </p>

          <h3 className="text-base font-semibold text-[#242529] mt-8 mb-1">
            Toda la ciudad de {LOCAL_CITY_NAME}
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            {LOCAL_COVERAGE_SCOPE} Estas son algunas de las colonias donde ya
            tenemos ruta:
          </p>
          <ul className="flex flex-wrap gap-2">
            {CHIHUAHUA_DELIVERY_ZONES.map((zone) => (
              <li
                key={zone}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E9EB] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
              >
                <MapPin className="w-3 h-3 text-[#0E7A0E]" aria-hidden="true" />
                {zone}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--text-secondary)] mt-4">
            ¿No ves tu colonia? También llegamos.{" "}
            <a
              href={`${WHATSAPP_HREF}?text=${encodeURIComponent(
                "Hola, quiero confirmar el horario de entrega en mi colonia de Chihuahua."
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[#0E7A0E] hover:underline"
            >
              <MessageCircle className="w-3 h-3" aria-hidden="true" />
              Confirma el horario por WhatsApp
            </a>{" "}
            antes de armar el pedido.
          </p>
          <Link
            href={`/${citySlug}/zonas-de-entrega`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0E7A0E] hover:underline"
          >
            Ver zonas de entrega, horarios y preguntas
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div>
          <h3 className="text-base font-semibold text-[#242529] mb-3">
            Preguntas de la zona
          </h3>
          <dl className="divide-y divide-[#E8E9EB] border-y border-[#E8E9EB]">
            {faq.map((item) => (
              <div key={item.question} className="py-4">
                <dt className="text-sm font-semibold text-[#242529]">
                  {item.question}
                </dt>
                <dd className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
