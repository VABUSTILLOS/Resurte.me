import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Clock, CreditCard, ShieldCheck } from "lucide-react"

export const metadata: Metadata = {
  title: "Línea de crédito — Resurte.me",
  description:
    "Accede a una línea de crédito para surtir tu negocio. Paga a 7, 15 o 30 días sin complicaciones. Crédito ágil para negocios mexicanos.",
}

export default function CreditoPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Línea de <span className="text-[#108910]">crédito</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Surtir tu negocio nunca fue tan fácil. Paga después, crece hoy.
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {[
            {
              icon: Clock,
              title: "Paga a 7, 15 o 30 días",
              desc: "Tú eliges el plazo que mejor se adapte al flujo de tu negocio. Sin letras chiquitas.",
            },
            {
              icon: ShieldCheck,
              title: "Sin garantías complicadas",
              desc: "No pedimos aval ni propiedades en garantía. Evaluamos tu historial de compras en la plataforma.",
            },
            {
              icon: CreditCard,
              title: "Crédito creciente",
              desc: "Tu línea de crédito crece conforme crece tu negocio. Mientras más compras, más crédito tienes.",
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

        {/* How it works */}
        <div className="bg-[#F9FAFB] rounded-[16px] p-8 mb-12">
          <h2 className="text-2xl font-bold text-[#242529] text-center mb-8">
            ¿Cómo funciona?
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Solicítalo", desc: "Llena el formulario desde tu cuenta. Sin papeleo." },
              { step: "2", title: "Actívalo", desc: "Revisamos tu historial y activamos tu línea en 24 horas." },
              { step: "3", title: "Compra", desc: "Elige \"pago a crédito\" al finalizar tu pedido." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-10 h-10 bg-[#108910] text-white rounded-full flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                  {step}
                </div>
                <h3 className="font-semibold text-[#242529] mb-1">{title}</h3>
                <p className="text-sm text-[#5C6068]">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center">
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 bg-[#108910] text-white font-semibold px-8 py-3 rounded-[10px] hover:bg-[#0D720D] transition-colors"
          >
            Crear cuenta y solicitar crédito
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </main>
  )
}
