import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Zonas de entrega — Resurte.me",
  description:
    "Entregamos en CDMX, Monterrey, Guadalajara y más ciudades. Revisa si tu colonia está en nuestra cobertura y empieza a pedir hoy.",
}

const CITIES = [
  { name: "CDMX", slug: "cdmx", zonas: "Benito Juárez, Cuauhtémoc, Miguel Hidalgo, Coyoacán, Álvaro Obregón, Iztapalapa, Gustavo A. Madero y más" },
  { name: "Monterrey", slug: "monterrey", zonas: "San Pedro, Santa Catarina, San Nicolás, Guadalupe, Apodaca, Centro de MTY" },
  { name: "Guadalajara", slug: "guadalajara", zonas: "Zapopan, Tlaquepaque, Tonalá, Tlajomulco, Centro de GDL" },
  { name: "Puebla", slug: "puebla", zonas: "Centro, Angelópolis, Cholula, San Andrés, Cuautlancingo" },
  { name: "Querétaro", slug: "queretaro", zonas: "Centro, Juriquilla, El Refugio, Zibatá, Corregidora" },
  { name: "Mérida", slug: "merida", zonas: "Centro, Norte, Montebello, Altabrisa, Caucel" },
]

export default function CiudadesPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            ¿Entregamos{" "}
            <span className="text-[#108910]">en tu colonia?</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Estas son las ciudades y zonas donde ya estamos. Cada mes activamos
            cobertura nueva. Si no ves la tuya, avísanos y te notificamos en
            cuanto lleguemos.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CITIES.map((city) => (
            <Link
              key={city.slug}
              href={`/${city.slug}`}
              className="block border border-[#E5E7EB] rounded-[12px] p-6 hover:border-[#108910] hover:shadow-md transition-all group"
            >
              <h3 className="text-xl font-bold text-[#242529] group-hover:text-[#108910] transition-colors mb-2">
                {city.name}
              </h3>
              <p className="text-sm text-[#5C6068] leading-relaxed">
                {city.zonas}
              </p>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center p-8 bg-[#F9FAFB] rounded-[12px]">
          <p className="text-[#5C6068]">
            ¿No ves tu ciudad?{" "}
            <Link href="/contact" className="text-[#108910] font-semibold hover:underline">
              Avísanos
            </Link>{" "}
            y te mandamos un mensaje en cuanto active mos cobertura en tu zona.
          </p>
        </div>
      </section>
    </main>
  )
}
