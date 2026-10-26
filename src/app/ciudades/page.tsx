import type { Metadata } from "next"
import Link from "next/link"
import { MapPin, Truck, Building2 } from "lucide-react"

import {
  ACTIVE_CITIES,
  COMING_SOON_CITIES,
} from "@/lib/cities"
import { getBreadcrumbSchema, getCityLandingSchema } from "@/lib/structured-data"

// ISR: catálogo revalidado cada 5 min (alineado con src/lib/catalog-cache.ts).
export const revalidate = 300

export const metadata: Metadata = {
  title: "Zonas de entrega en Chihuahua — Resurte.me",
  description:
    "Hoy entregamos solo en Chihuahua, Chihuahua. Revisa la cobertura actual, confirma tu colonia por WhatsApp y avísanos dónde te gustaría pedir.",
  alternates: {
    canonical: "https://resurte.me/ciudades",
  },
}

// Derivado de ACTIVE_CITIES: cuando se active una ciudad nueva aparece aquí
// sola. Antes era un array escrito a mano que se desincronizaba del sitemap.
const ACTIVE_ZONES = ACTIVE_CITIES.map((city) => ({
  name: city.name,
  state: city.state,
  slug: city.slug,
  zonas: `Toda la ciudad de ${city.name} y su zona conurbada. Confirma tu colonia por WhatsApp y te decimos la ruta y el horario de entrega.`,
  entrega: "Entrega el mismo día",
}))

export default function CiudadesPage() {
  const jsonLd = [
    getBreadcrumbSchema([
      { name: "Inicio", url: "https://resurte.me" },
      { name: "Zonas de entrega", url: "https://resurte.me/ciudades" },
    ]),
    ...ACTIVE_CITIES.map((city) =>
      getCityLandingSchema(city.name, city.state, city.lat, city.lng),
    ),
  ]

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            ¿Entregamos{" "}
            <span className="text-[#0E7A0E]">en tu colonia?</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Hoy operamos solo en Chihuahua, Chihuahua. Muy pronto en tu ciudad:
            estamos preparando la cobertura nueva. Si no ves la tuya, avísanos y
            te notificamos en cuanto lleguemos.
          </p>
        </div>
      </section>

      {/* Trust stats */}
      <section className="max-w-4xl mx-auto px-4 pb-10">
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { icon: MapPin, value: String(ACTIVE_CITIES.length), label: "Ciudad activa" },
            { icon: Truck, value: "Mismo día", label: "Tiempo de entrega" },
            {
              icon: Building2,
              value: String(COMING_SOON_CITIES.length),
              label: "Ciudades próximamente",
            },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[12px] p-4">
              <Icon className="w-5 h-5 text-[#0E7A0E] mx-auto mb-2" />
              <p className="text-2xl font-extrabold text-[#0E7A0E]">{value}</p>
              <p className="text-xs text-[#5C6068]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-[#242529] mb-6">
          Disponible ahora
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {ACTIVE_ZONES.map((city) => (
            <Link
              key={city.slug}
              href={`/${city.slug}`}
              className="block border border-[#0E7A0E]/30 rounded-[12px] p-6 hover:border-[#0E7A0E] hover:shadow-md transition-all group"
            >
              <h3 className="text-xl font-bold text-[#242529] group-hover:text-[#0E7A0E] transition-colors mb-2">
                {city.name}
              </h3>
              <p className="text-sm text-[#5C6068] leading-relaxed mb-2">
                {city.zonas}
              </p>
              <p className="text-xs text-[#0E7A0E] font-medium">
                🚚 {city.entrega}
              </p>
            </Link>
          ))}
        </div>

        <h2 className="text-2xl font-bold text-[#242529] mt-14 mb-2">
          Muy pronto en tu ciudad
        </h2>
        <p className="text-sm text-[#5C6068] mb-6">
          Estas ciudades todavía no tienen cobertura. Te avisamos en cuanto
          activemos la operación.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {COMING_SOON_CITIES.map((city) => (
            <Link
              key={city.slug}
              href={`/${city.slug}`}
              className="flex items-center justify-between gap-2 border border-[#E5E7EB] rounded-[12px] px-4 py-3 hover:border-[#0E7A0E]/40 transition-colors"
            >
              <span className="text-sm font-medium text-[#343538]">
                {city.name}
              </span>
              <span className="shrink-0 rounded-full bg-[#F1F0EC] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5C6068]">
                Próximamente
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center p-8 bg-[#F9FAFB] rounded-[12px]">
          <p className="text-[#5C6068]">
            ¿No ves tu ciudad?{" "}
            <Link href="/contact" className="text-[#0E7A0E] font-semibold hover:underline">
              Avísanos
            </Link>{" "}
            y te mandamos un mensaje en cuanto activemos cobertura en tu zona.
          </p>
        </div>
      </section>
    </div>
  )
}
