import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Leaf, Truck, Users } from "lucide-react"

export const metadata: Metadata = {
  title: "Sobre nosotros — Resurte.me",
  description:
    "Resurte.me es la Central de Abastos Digital que conecta negocios locales con proveedores de confianza, con entregas puntuales y programa de recompensas.",
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-6">
            Tu Central de Abastos{" "}
            <span className="text-[#108910]">Digital</span>
          </h1>
          <p className="text-lg text-[#5C6068] leading-relaxed">
            Nacimos para simplificar la proveeduría de los negocios mexicanos.
            Conectamos restaurantes, hoteles, cafeterías y pequeños comercios con
            los mejores proveedores, eliminando intermediarios y haciendo que
            surtir tu negocio sea más rápido, fácil y rentable.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <div className="grid md:grid-cols-3 gap-10">
          {[
            {
              icon: Leaf,
              title: "Frescura garantizada",
              desc: "Productos seleccionados y entregados en el punto justo de maduración. Trabajamos solo con proveedores que cumplen nuestros estándares de calidad.",
            },
            {
              icon: Truck,
              title: "Entrega puntual",
              desc: "Sabemos que tu negocio no puede esperar. Entregas programadas con puntualidad para que nunca te quedes sin insumos.",
            },
            {
              icon: Users,
              title: "Hecho para ti",
              desc: "Entendemos las necesidades del negocio mexicano. Crédito, facturación y atención personalizada para que solo te preocupes por crecer.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="text-center">
              <div className="w-14 h-14 bg-[#E8F5E8] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Icon className="w-7 h-7 text-[#108910]" />
              </div>
              <h3 className="text-lg font-semibold text-[#242529] mb-2">
                {title}
              </h3>
              <p className="text-sm text-[#5C6068] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#108910] py-16 px-4 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            ¿Listo para surtir tu negocio sin complicaciones?
          </h2>
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 bg-white text-[#108910] font-semibold px-8 py-3 rounded-[10px] hover:bg-[#F0F7F0] transition-colors"
          >
            Crear cuenta gratis
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </main>
  )
}
