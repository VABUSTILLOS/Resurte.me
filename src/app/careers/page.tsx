import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Users, TrendingUp, MapPin } from "lucide-react"

export const metadata: Metadata = {
  title: "Trabaja con nosotros — Resurte.me",
  description:
    "Súmate al team que está revolucionando la proveeduría en México. Vacantes en tecnología, ventas, logística y producto. Remoto y presencial.",
}

export default function CareersPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Construye el futuro del{" "}
            <span className="text-[#108910]">abasto en México</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            No somos una startup más. Estamos digitalizando la cadena de
            proveeduría más grande del país. Buscamos gente que quiera
            ensuciarse las manos y construir algo que de verdad impacte a miles
            de negocios mexicanos.
          </p>
        </div>
      </section>

      {/* Team stats */}
      <section className="max-w-4xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { icon: Users, value: "40+", label: "Personas en el equipo" },
            { icon: TrendingUp, value: "3x", label: "Crecimiento este año" },
            { icon: MapPin, value: "8", label: "Estados con presencia" },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[12px] p-4">
              <Icon className="w-5 h-5 text-[#108910] mx-auto mb-2" />
              <p className="text-2xl font-extrabold text-[#108910]">{value}</p>
              <p className="text-xs text-[#5C6068]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-16 space-y-8">
        <h2 className="text-2xl font-bold text-[#242529] mb-6">Vacantes abiertas</h2>
        {[
          {
            title: "Desarrollador Full Stack",
            area: "Tecnología",
            type: "Remoto — México",
            desc: "Next.js, TypeScript, PostgreSQL. Construye el marketplace B2B más rápido del país.",
          },
          {
            title: "Ejecutivo de Cuenta (Ventas B2B)",
            area: "Comercial",
            type: "CDMX / MTY / GDL",
            desc: "Responsable de abrir y crecer cuentas de restaurantes y hoteles. Bono por resultados.",
          },
          {
            title: "Coordinador de Logística",
            area: "Operaciones",
            type: "CDMX",
            desc: "Dueño de la última milla. Optimiza rutas, gestiona flotilla y asegura que cada pedido llegue a tiempo.",
          },
          {
            title: "Diseñador de Producto (UX/UI)",
            area: "Producto",
            type: "Remoto — México",
            desc: "Diseña la experiencia del tendero, el chef y el hotelero. Investigación, prototipado y handoff.",
          },
        ].map((job) => (
          <div
            key={job.title}
            className="border border-[#E5E7EB] rounded-[12px] p-6 hover:border-[#108910] transition-colors"
          >
            <h3 className="text-lg font-semibold text-[#242529] mb-1">
              {job.title}
            </h3>
            <p className="text-sm text-[#5C6068] mb-2">
              {job.area} · {job.type}
            </p>
            <p className="text-sm text-[#8F939B]">{job.desc}</p>
          </div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-20">
        <div className="bg-[#F9FAFB] rounded-[16px] p-8">
          <h2 className="text-xl font-bold text-[#242529] mb-4">¿Por qué trabajar aquí?</h2>
          <ul className="grid sm:grid-cols-2 gap-3 text-sm text-[#5C6068]">
            {[
              "Sueldo competitivo y equity",
              "Horario flexible y remoto",
              "Seguro de gastos médicos mayores",
              "Días libres ilimitados (de verdad)",
              "Crecimiento acelerado real",
              "Impacto directo en miles de PYMES",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-[#108910]">✓</span> {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center pt-8">
          <p className="text-[#5C6068] mb-4">
            ¿No ves tu rol pero quieres formar parte?
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 text-[#108910] font-semibold hover:underline"
          >
            Mándanos tu CV y cuéntanos por qué →
          </Link>
        </div>
      </section>
    </main>
  )
}
