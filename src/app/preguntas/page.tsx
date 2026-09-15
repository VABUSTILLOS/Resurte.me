import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, MessageCircleQuestion } from "lucide-react"
import { getPreguntaGroups, PREGUNTAS } from "@/lib/preguntas"
import { getFAQSchema, getBlogBreadcrumbSchema, getSpeakableSpec } from "@/lib/blog-schema"
import { getItemListSchema } from "@/lib/structured-data"
import { SITE_URL } from "@/lib/author"
import {
  CREDIT_DAYS_PROSE,
  DELIVERY_CITIES,
  FREE_SHIPPING_MXN,
  INVOICING,
  MIN_ORDER_MXN,
  formatMxn,
} from "@/lib/commercial-facts"

// Contenido estático: se prerenderiza una sola vez, sin lectura de
// cookies()/headers(), para no convertir la ruta en SSR por request.
export const dynamic = "force-static"

const PAGE_URL = `${SITE_URL}/preguntas`
const PAGE_TITLE = "Preguntas de restauranteros, respondidas — Resurte.me"
const PAGE_DESCRIPTION =
  "Respuestas directas a las preguntas más comunes de dueños de restaurante en México: food cost, precios, mayoreo, mermas, inventario, delivery y proveeduría."

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "article",
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    siteName: "Resurte.me",
  },
}

export default function PreguntasPage() {
  const groups = getPreguntaGroups()

  const faqSchema = getFAQSchema(
    PREGUNTAS.map((p) => ({ question: p.question, answer: p.answer }))
  )
  const listSchema = getItemListSchema(
    "Preguntas de dueños de restaurante en México",
    PAGE_URL,
    // Sin `description`: las 54 respuestas ya viajan en el FAQPage (que es el
    // tipo con derecho a rich result) y en el HTML visible. Repetirlas aquí
    // duplicaba ~42 KB de payload sin aportar información nueva.
    PREGUNTAS.map((p) => ({
      name: p.question,
      url: `${PAGE_URL}#${p.slug}`,
    })),
    "Question"
  )
  const breadcrumbSchema = getBlogBreadcrumbSchema("blog")

  // FAQPage con speakable: indica a los asistentes de voz y a los motores de
  // respuesta qué fragmentos leer en voz alta o citar en bloque.
  const faqWithSpeakable = faqSchema
    ? { ...faqSchema, speakable: getSpeakableSpec(["#respuesta-rapida", "article h3"]) }
    : null

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            [faqWithSpeakable, listSchema, breadcrumbSchema].filter(Boolean)
          ),
        }}
      />

      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-[#0E7A0E]/20 text-[#0E7A0E] text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
            <MessageCircleQuestion className="w-4 h-4" />
            {PREGUNTAS.length} respuestas directas
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Preguntas de restauranteros,{" "}
            <span className="text-[#0E7A0E]">respondidas sin rodeos</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Lo que un dueño de restaurante en México realmente pregunta sobre
            costos, compras, operación y crecimiento. Cada respuesta se
            entiende sola, sin leer el resto de la página.
          </p>
        </div>
      </section>

      {/* Respuesta rápida: el bloque que los motores de respuesta citan primero */}
      <section className="max-w-3xl mx-auto px-4 pb-10">
        <div
          id="respuesta-rapida"
          className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[16px] p-6"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#0E7A0E] mb-2">
            Respuesta rápida
          </h2>
          <p className="text-[#242529] leading-relaxed">
            Resurte.me es una proveeduría en línea de insumos para restaurantes en
            México: abarrotes, frutas, verduras, carnes, lácteos y desechables al
            mayoreo, con entrega a domicilio en {DELIVERY_CITIES} ciudades, sin
            membresía, pedido mínimo de {formatMxn(MIN_ORDER_MXN)}, envío gratis
            desde {formatMxn(FREE_SHIPPING_MXN)}, facturación {INVOICING} y crédito
            a {CREDIT_DAYS_PROSE} días. Incluye herramientas gratuitas de
            costeo e inventario para sus clientes.
          </p>
        </div>
      </section>

      {/* Navegación por tema */}
      <nav aria-label="Temas" className="max-w-3xl mx-auto px-4 pb-12">
        <ul className="flex flex-wrap gap-2 justify-center">
          {groups.map(({ theme, preguntas }) => (
            <li key={theme.slug}>
              <a
                href={`#${theme.slug}`}
                className="inline-flex items-center gap-2 border border-[#E5E7EB] rounded-full px-4 py-2 text-sm text-[#242529] hover:border-[#0E7A0E] hover:text-[#0E7A0E] transition-colors"
              >
                <span aria-hidden="true">{theme.emoji}</span>
                {theme.label}
                <span className="text-[#5C6068]">({preguntas.length})</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="max-w-3xl mx-auto px-4 pb-20 space-y-16">
        {groups.map(({ theme, preguntas }) => (
          <section key={theme.slug} aria-labelledby={`tema-${theme.slug}`}>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] mb-2 scroll-mt-24">
              <span aria-hidden="true">{theme.emoji}</span>{" "}
              <span id={theme.slug} className="scroll-mt-24">
                {theme.label}
              </span>
            </h2>
            <p className="text-[#5C6068] mb-8">{theme.description}</p>

            <div className="space-y-6">
              {preguntas.map((pregunta) => (
                <article
                  key={pregunta.slug}
                  id={pregunta.slug}
                  className="border border-[#E5E7EB] rounded-[16px] p-6 scroll-mt-24"
                >
                  <h3 className="text-lg font-semibold text-[#242529] mb-3">
                    {pregunta.question}
                  </h3>
                  <p className="text-[#5C6068] leading-relaxed">{pregunta.answer}</p>
                  {pregunta.links.length > 0 && (
                    <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                      {pregunta.links.map((link) => (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0E7A0E] hover:text-[#0D720D]"
                          >
                            {link.label}
                            <ArrowRight className="w-4 h-4" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="max-w-xl mx-auto px-4 pb-20 text-center">
        <h2 className="text-xl font-bold text-[#242529] mb-2">
          ¿Tu pregunta no está aquí?
        </h2>
        <p className="text-[#5C6068] mb-6">
          Escríbenos por WhatsApp y te responde una persona del equipo, no un bot.
        </p>
        <Link
          href="/faq"
          className="inline-flex items-center gap-2 bg-[#0E7A0E] text-white font-semibold px-6 py-3 rounded-[10px] hover:bg-[#0D720D] transition-colors"
        >
          Ver preguntas frecuentes
          <ArrowRight className="w-4 h-4" />
        </Link>
      </section>
    </div>
  )
}
