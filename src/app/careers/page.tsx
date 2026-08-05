import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Trabaja con nosotros — Resurte.me",
  description:
    "Únete al equipo de Resurte.me. Buscamos talento apasionado por la tecnología y el comercio local para transformar la proveeduría en México.",
}

export default function CareersPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Trabaja con <span className="text-[#108910]">nosotros</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Estamos construyendo la Central de Abastos Digital más grande de
            México. Súmate a un equipo que está transformando cómo los negocios
            locales se surten.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-16 space-y-8">
        {[
          {
            title: "Desarrollador Full Stack",
            area: "Tecnología",
            type: "Remoto — México",
          },
          {
            title: "Ejecutivo de Cuenta (Ventas B2B)",
            area: "Comercial",
            type: "CDMX / Monterrey / GDL",
          },
          {
            title: "Coordinador de Logística",
            area: "Operaciones",
            type: "CDMX",
          },
          {
            title: "Diseñador de Producto (UX/UI)",
            area: "Producto",
            type: "Remoto — México",
          },
        ].map((job) => (
          <div
            key={job.title}
            className="border border-[#E5E7EB] rounded-[12px] p-6 hover:border-[#108910] transition-colors"
          >
            <h3 className="text-lg font-semibold text-[#242529] mb-1">
              {job.title}
            </h3>
            <p className="text-sm text-[#5C6068]">
              {job.area} · {job.type}
            </p>
          </div>
        ))}

        <div className="text-center pt-8 p-8 bg-[#F9FAFB] rounded-[12px]">
          <p className="text-[#5C6068] mb-4">
            ¿No ves una posición para ti pero crees que puedes aportar?
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 text-[#108910] font-semibold hover:underline"
          >
            Escríbenos →
          </Link>
        </div>
      </section>
    </main>
  )
}
