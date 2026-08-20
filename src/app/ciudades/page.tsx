import type { Metadata } from "next"
import Link from "next/link"
import { MapPin, Truck, Building2 } from "lucide-react"

// ISR: catálogo revalidado cada 5 min (alineado con src/lib/catalog-cache.ts).
export const revalidate = 300

export const metadata: Metadata = {
  title: "Zonas de entrega — Resurte.me",
  description:
    "Entregamos en CDMX, Monterrey, Guadalajara y más ciudades. Revisa si tu colonia está en nuestra cobertura y empieza a pedir hoy.",
}

const CITIES = [
  { name: "CDMX", slug: "cdmx", zonas: "Benito Juárez, Cuauhtémoc, Miguel Hidalgo, Coyoacán, Álvaro Obregón, Iztapalapa, Gustavo A. Madero y más", entrega: "Mismo día (antes de 11 AM) o siguiente día" },
  { name: "Monterrey", slug: "monterrey", zonas: "San Pedro, Santa Catarina, San Nicolás, Guadalupe, Apodaca, Centro de MTY", entrega: "Siguiente día hábil" },
  { name: "Guadalajara", slug: "guadalajara", zonas: "Zapopan, Tlaquepaque, Tonalá, Tlajomulco, Centro de GDL", entrega: "Siguiente día hábil" },
  { name: "Puebla", slug: "puebla", zonas: "Centro, Angelópolis, Cholula, San Andrés, Cuautlancingo", entrega: "Siguiente día hábil" },
  { name: "Querétaro", slug: "queretaro", zonas: "Centro, Juriquilla, El Refugio, Zibatá, Corregidora", entrega: "Siguiente día hábil" },
  { name: "Mérida", slug: "merida", zonas: "Centro, Norte, Montebello, Altabrisa, Caucel", entrega: "Siguiente día hábil" },
]

export default function CiudadesPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            ¿Entregamos{" "}
            <span className="text-[#0E7A0E]">en tu colonia?</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Estas son las ciudades y zonas donde ya estamos. Cada mes activamos
            cobertura nueva. Si no ves la tuya, avísanos y te notificamos en
            cuanto lleguemos.
          </p>
        </div>
      </section>

      {/* Trust stats */}
      <section className="max-w-4xl mx-auto px-4 pb-10">
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { icon: MapPin, value: "6", label: "Ciudades activas" },
            { icon: Truck, value: "98%", label: "Entregas a tiempo" },
            { icon: Building2, value: "+30", label: "Colonias con cobertura" },
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CITIES.map((city) => (
            <Link
              key={city.slug}
              href={`/${city.slug}`}
              className="block border border-[#E5E7EB] rounded-[12px] p-6 hover:border-[#0E7A0E] hover:shadow-md transition-all group"
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

        <div className="mt-12 text-center p-8 bg-[#F9FAFB] rounded-[12px]">
          <p className="text-[#5C6068]">
            ¿No ves tu ciudad?{" "}
            <Link href="/contact" className="text-[#0E7A0E] font-semibold hover:underline">
              Avísanos
            </Link>{" "}
            y te mandamos un mensaje en cuanto active mos cobertura en tu zona.
          </p>
        </div>
      </section>
    </div>
  )
}
