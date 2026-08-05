import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Leaf, Truck, Users, Star, Shield, Building2 } from "lucide-react"

export const metadata: Metadata = {
  title: "Sobre nosotros — Resurte.me",
  description:
    "Somos la Central de Abastos Digital que le ahorra tiempo y dinero a miles de negocios mexicanos. Proveeduría inteligente, sin intermediarios, con entregas al siguiente día.",
}

const STATS = [
  { value: "5,000+", label: "Negocios activos" },
  { value: "98%", label: "Entregas a tiempo" },
  { value: "6", label: "Ciudades con cobertura" },
  { value: "24h", label: "Respuesta en crédito" },
]

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

      {/* Trust stats */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <div className="bg-white border border-[#E5E7EB] rounded-[20px] p-8 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {STATS.map(({ value, label }) => (
              <div key={label}>
                <p className="text-3xl sm:text-4xl font-extrabold text-[#108910] mb-1">
                  {value}
                </p>
                <p className="text-sm text-[#5C6068]">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-center text-[#9CA3AF] mt-6">
            * Cifras actualizadas al primer semestre de 2026
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
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
            <div key={title} className="text-center group">
              <div className="w-14 h-14 bg-[#E8F5E8] rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-[#108910] transition-colors">
                <Icon className="w-7 h-7 text-[#108910] group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-[#242529] mb-2">
                {title}
              </h3>
              <p className="text-sm text-[#5C6068] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Guarantee */}
      <section className="bg-[#F9FAFB] py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-16 h-16 bg-[#E8F5E8] rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-[#108910]" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] mb-4">
            Nuestra garantía,{" "}
            <span className="text-[#108910]">sin letras chiquitas</span>
          </h2>
          <div className="grid sm:grid-cols-3 gap-6 text-left mt-8">
            {[
              { emoji: "📸", title: "Producto en mal estado", desc: "Mándanos una foto en las primeras 24h. Te lo reponemos sin costo en tu siguiente entrega o te devolvemos el dinero." },
              { emoji: "⏱️", title: "Entrega tardía", desc: "Si tu pedido no llega en la ventana prometida, te avisamos antes y ajustamos. Y si el retraso es nuestro, esa entrega lleva descuento." },
              { emoji: "❌", title: "No te gustó", desc: "Primer pedido con garantía de satisfacción. Si algo no cumple, lo reportas y te damos crédito para tu siguiente compra." },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="bg-white border border-[#E5E7EB] rounded-[12px] p-5">
                <span className="text-2xl mb-2 block">{emoji}</span>
                <h3 className="font-semibold text-[#242529] mb-1">{title}</h3>
                <p className="text-sm text-[#5C6068] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How we started */}
      <section className="max-w-3xl mx-auto px-4 py-20">
        <div className="flex items-center gap-3 mb-6">
          <Building2 className="w-6 h-6 text-[#108910]" />
          <h2 className="text-2xl font-bold text-[#242529]">De la central al celular</h2>
        </div>
        <p className="text-[#5C6068] leading-relaxed mb-4">
          Resurte.me nació de una frustración compartida por cientos de dueños de
          negocios: madrugar, cargar, regatear y rezar porque el jitomate llegara
          entero. La Central de Abastos es el corazón del abasto mexicano, pero su
          modelo no había cambiado en 40 años.
        </p>
        <p className="text-[#5C6068] leading-relaxed mb-4">
          Decidimos construir el puente: una plataforma que mantiene la calidad y
          el precio de la central, pero elimina el tráfico, las 4 AM y la
          incertidumbre. Mismos proveedores, mismos precios, pero desde tu celular,
          con entrega al siguiente día y factura automática.
        </p>
        <p className="text-[#5C6068] leading-relaxed">
          Hoy más de 5,000 negocios nos confían su proveeduría. Y apenas vamos
          empezando.
        </p>
      </section>

      {/* CTA */}
      <section className="bg-[#108910] py-16 px-4 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Deja de madrugar para surtir. Pide en 5 minutos desde tu cel.
          </h2>
          <p className="text-white/80 mb-6">
            Date de alta gratis. Sin mensualidad, sin compromiso. Tu primer pedido
            con garantía de satisfacción.
          </p>
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
