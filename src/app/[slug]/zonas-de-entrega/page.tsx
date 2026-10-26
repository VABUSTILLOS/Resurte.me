import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import { Clock, MapPin, MessageCircle, Truck } from "lucide-react"

import { MEXICO_CITIES, isCityActive } from "@/lib/cities"
import {
  CHIHUAHUA_DELIVERY_ZONES,
  LOCAL_COVERAGE_SCOPE,
  LOCAL_MODEL_PROSE,
  LOCAL_OPERATION_PROSE,
  getLocalFaq,
  getLocalFaqSchema,
} from "@/lib/local-content"
import {
  BUSINESS_HOURS_NOTE,
  BUSINESS_HOURS_SUMMARY,
  BUSINESS_LOCATION_LABEL,
  WHATSAPP_HREF,
} from "@/lib/business"
import { FREE_SHIPPING_MXN, MIN_ORDER_MXN, formatMxn } from "@/lib/commercial-facts"
import { getBreadcrumbSchema, getDeliveryZonesSchema } from "@/lib/structured-data"

// ISR: la cobertura cambia con el catálogo, no por request.
export const revalidate = 300

export function generateStaticParams() {
  return MEXICO_CITIES.map((city) => ({ slug: city.slug }))
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) return { title: "Zonas de entrega — Resurte.me" }

  const url = `https://resurte.me/${city.slug}/zonas-de-entrega`

  // Solo la ciudad sede tiene cobertura publicada. Las demás conservan la URL
  // para no romper enlaces, pero no se indexan: anunciar colonias de una ciudad
  // donde no operamos sería inventar cobertura.
  if (!isCityActive(city.slug)) {
    return {
      title: `Zonas de entrega en ${city.name} — Resurte.me`,
      description: `Todavía no entregamos en ${city.name}, ${city.state}. Hoy Resurte.me opera en ${BUSINESS_LOCATION_LABEL}.`,
      robots: { index: false, follow: true },
      alternates: { canonical: url },
    }
  }

  const title = `Zonas de entrega en ${city.name}: toda la ciudad — Resurte.me`
  const description =
    `Entregamos insumos por mayoreo el mismo día en toda la ciudad de ${city.name}: ` +
    `${CHIHUAHUA_DELIVERY_ZONES.slice(0, 5).join(", ")} y más colonias. ` +
    `Pedido mínimo ${formatMxn(MIN_ORDER_MXN)}, envío gratis desde ${formatMxn(FREE_SHIPPING_MXN)}.`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Resurte.me",
      locale: "es_MX",
      type: "website",
      images: [
        {
          url: "https://resurte.me/opengraph-image",
          width: 1200,
          height: 630,
          alt: `Zonas de entrega de Resurte.me en ${city.name}`,
        },
      ],
    },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default async function ZonasDeEntregaPage({ params }: Props) {
  const { slug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) notFound()

  const pageUrl = `https://resurte.me/${city.slug}/zonas-de-entrega`
  const active = isCityActive(city.slug)
  const faq = active ? getLocalFaq() : []

  const jsonLd = [
    getBreadcrumbSchema([
      { name: "Inicio", url: "https://resurte.me" },
      { name: city.name, url: `https://resurte.me/${city.slug}` },
      { name: "Zonas de entrega", url: pageUrl },
    ]),
    ...(active ? [getDeliveryZonesSchema(pageUrl), getLocalFaqSchema(pageUrl)] : []),
  ]

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-16 sm:py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#0E7A0E] mb-3">
            Cobertura
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold text-[#242529] mb-4 text-balance">
            Zonas de entrega en{" "}
            <span className="text-[#0E7A0E]">{city.name}</span>
          </h1>
          <p className="text-base sm:text-lg text-[#5C6068] leading-relaxed">
            {active
              ? `Entregamos insumos por mayoreo el mismo día en toda la ciudad de ${city.name}. No hay colonias excluidas dentro del municipio: si tu negocio está en ${city.name} capital, tienes cobertura.`
              : `Todavía no entregamos en ${city.name}, ${city.state}. Hoy operamos en ${BUSINESS_LOCATION_LABEL}.`}
          </p>
        </div>
      </section>

      {active && (
        <>
          <section className="max-w-4xl mx-auto px-4 pb-10">
            <div className="grid grid-cols-3 gap-3 sm:gap-4 text-center">
              {[
                {
                  icon: MapPin,
                  value: "Toda la ciudad",
                  label: "Cobertura",
                },
                { icon: Truck, value: "Mismo día", label: "Tiempo de entrega" },
                { icon: Clock, value: "Lun–Sáb", label: "Días de reparto" },
              ].map(({ icon: Icon, value, label }) => (
                <div
                  key={label}
                  className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[12px] p-4"
                >
                  <Icon className="w-5 h-5 text-[#0E7A0E] mx-auto mb-2" />
                  <p className="text-xl sm:text-2xl font-extrabold text-[#0E7A0E]">
                    {value}
                  </p>
                  <p className="text-xs text-[#5C6068]">{label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="max-w-4xl mx-auto px-4 py-10">
            <h2 className="text-2xl font-bold text-[#242529] mb-2">
              Colonias donde ya tenemos ruta
            </h2>
            <p className="text-sm text-[#5C6068] leading-relaxed mb-4">
              {LOCAL_COVERAGE_SCOPE} Esta lista es una muestra de las colonias
              con entrega más frecuente, no el límite del servicio.
            </p>
            <ul className="flex flex-wrap gap-2">
              {CHIHUAHUA_DELIVERY_ZONES.map((zone) => (
                <li
                  key={zone}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E9EB] bg-white px-3 py-2 text-sm text-[#343538]"
                >
                  <MapPin className="w-3 h-3 text-[#0E7A0E]" />
                  {zone}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-[#5C6068] leading-relaxed">
              ¿No ves tu colonia? También llegamos.{" "}
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#0E7A0E] hover:underline"
              >
                Confirma el horario por WhatsApp
              </a>{" "}
              y te decimos la ruta y el horario exacto de reparto.
            </p>
          </section>

          <section className="max-w-3xl mx-auto px-4 py-10">
            <h2 className="text-2xl font-bold text-[#242529] mb-4">
              Cómo funciona el reparto
            </h2>
            <p className="text-[#5C6068] leading-relaxed mb-4">
              {LOCAL_OPERATION_PROSE}
            </p>
            <p className="text-[#5C6068] leading-relaxed mb-6">
              {LOCAL_MODEL_PROSE}
            </p>
            <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F9FAFB] p-5">
              <p className="text-sm font-semibold text-[#242529] mb-1">
                Horario de atención
              </p>
              <p className="text-sm text-[#5C6068]">{BUSINESS_HOURS_SUMMARY}</p>
              <p className="text-xs text-[#8F939B] mt-1">{BUSINESS_HOURS_NOTE}</p>
            </div>
          </section>

          <section className="max-w-3xl mx-auto px-4 py-10">
            <h2 className="text-2xl font-bold text-[#242529] mb-6">
              Preguntas sobre la entrega
            </h2>
            <dl className="space-y-5">
              {faq.map((item) => (
                <div key={item.question}>
                  <dt className="font-semibold text-[#242529] mb-1">
                    {item.question}
                  </dt>
                  <dd className="text-sm text-[#5C6068] leading-relaxed">
                    {item.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="max-w-3xl mx-auto px-4 pb-20">
            <div className="rounded-[12px] bg-[#0E7A0E] p-8 text-center">
              <p className="text-white text-lg font-semibold mb-2">
                Pide hoy y recibe hoy
              </p>
              <p className="text-white/80 text-sm mb-5">
                Pedido mínimo {formatMxn(MIN_ORDER_MXN)} · envío gratis desde{" "}
                {formatMxn(FREE_SHIPPING_MXN)}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href={`/${city.slug}`}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0E7A0E] hover:bg-white/90 transition-colors"
                >
                  Ver el catálogo
                </Link>
                <a
                  href={WHATSAPP_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-white px-5 py-2.5 text-sm font-semibold text-white hover:bg-white hover:text-[#0E7A0E] transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Confirmar mi colonia
                </a>
              </div>
            </div>
          </section>
        </>
      )}

      {!active && (
        <section className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-[#5C6068] mb-6">
            Mientras tanto, puedes ver el catálogo completo y los precios de
            referencia de la ciudad donde sí operamos.
          </p>
          <Link
            href="/ciudades"
            className="inline-flex items-center gap-2 rounded-full bg-[#0E7A0E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0B5F0B] transition-colors"
          >
            Ver zonas de entrega activas
          </Link>
        </section>
      )}
    </div>
  )
}
