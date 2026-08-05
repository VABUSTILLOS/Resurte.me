import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Leaf, Truck, Users } from "lucide-react"

export const metadata: Metadata = {
  title: "Sobre nosotros — Resurte.me",
  description:
    "Somos la Central de Abastos Digital que le ahorra tiempo y dinero a miles de negocios mexicanos. Proveeduría inteligente, sin intermediarios, con entregas al siguiente día.",
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-6">
            La Central de Abastos{" "}
            <span className="text-[#108910]">que sí entiende tu negocio</span>
          </h1>
          <p className="text-lg text-[#5C6068] leading-relaxed">
            Sabemos lo que es levantarse a las 4 AM para ir a la central. Por eso
            construimos Resurte.me: la plataforma que elimina las vueltas, los
            intermediarios y las sorpresas. Conectamos a restaurantes, hoteles,
            cafeterías y changarros con los mejores proveedores del país. Pides
            desde el cel, te llega al siguiente día y pagas como más te convenga.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <div className="grid md:grid-cols-3 gap-10">
          {[
            {
              icon: Leaf,
              title: "Calidad que tu cliente nota",
              desc: "Seleccionamos cada producto en su punto justo. Solo trabajamos con proveedores que pasan nuestra prueba de calidad. Si no nos lo comeríamos nosotros, no te lo mandamos.",
            },
            {
              icon: Truck,
              title: "Tu cocina nunca se para",
              desc: "Pedidos antes de las 5 PM se entregan al día siguiente. En CDMX tenemos entregas express el mismo día. Porque un restaurante sin insumos es un restaurante cerrado.",
            },
            {
              icon: Users,
              title: "Hecho a la medida del negocio mexicano",
              desc: "Crédito a 30 días, facturación automática, cotizaciones por volumen y un ejecutivo dedicado que te resuelve por WhatsApp. Así de simple.",
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
            Deja de madrugar para surtir. Pide en 5 minutos desde tu cel.
          </h2>
          <p className="text-white/80 mb-6">Date de alta gratis y haz tu primer pedido hoy.</p>
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 bg-white text-[#108910] font-semibold px-8 py-3 rounded-[10px] hover:bg-[#F0F7F0] transition-colors"
          >
            Quiero empezar
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </main>
  )
}
