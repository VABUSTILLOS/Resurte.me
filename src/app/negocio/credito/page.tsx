import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Clock, CreditCard, ShieldCheck, Star } from "lucide-react"

export const metadata: Metadata = {
  title: "Línea de crédito para tu negocio — Resurte.me",
  description:
    "Paga tus insumos a 7, 15 o 30 días. Sin aval, sin garantías. Crédito que crece con tu negocio. Actívalo en 24 horas.",
}

export default function CreditoPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Surtir hoy,{" "}
            <span className="text-[#108910]">pagar después</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Tu negocio no debería frenarse porque la caja está apretada.
            Activa tu línea de crédito en 24 horas y paga cuando te funcione.
          </p>
        </div>
      </section>

      {/* Trust stats */}
      <section className="max-w-3xl mx-auto px-4 pb-10">
        <div className="bg-white border border-[#E5E7EB] rounded-[16px] p-6 grid gap-4 text-center sm:grid-cols-3">
          {[
            { value: "24h", label: "Respuesta máxima" },
            { value: "85%", label: "Tasa de aprobación" },
            { value: "Sin buró", label: "Sin consulta a buró de crédito" },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-2xl font-extrabold text-[#108910]">{value}</p>
              <p className="text-xs text-[#5C6068] mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {[
            {
              icon: Clock,
              title: "Paga a 7, 15 o 30 días",
              desc: "Tú eliges la fecha que mejor se acopla a tu flujo. ¿Cierres quincenales? ¿Cobranza a 30 días? Lo armamos a tu ritmo, sin letras chiquitas.",
            },
            {
              icon: ShieldCheck,
              title: "Cero garantías, cero papeleo",
              desc: "Nada de aval, propiedades en garantía ni trámites eternos. Miramos tu historial de compras en la plataforma y te damos respuesta en 24 horas.",
            },
            {
              icon: CreditCard,
              title: "Tu crédito crece contigo",
              desc: "Empiezas con una línea base y, conforme compras y pagas a tiempo, tu crédito se expande automáticamente. Como debe ser.",
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
            Tres pasos. Cero vueltas.
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Solicítalo", desc: "Desde tu cuenta, llenas un formulario de 2 minutos." },
              { step: "2", title: "Actívalo", desc: "Revisamos tu historial y en máximo 24 horas tienes tu línea activa." },
              { step: "3", title: "Súrtete", desc: "Eliges \"pago a crédito\" al finalizar. Así de simple." },
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

        {/* FAQ about credit */}
        <div className="max-w-3xl mx-auto mt-12 bg-[#FFF7ED] border border-[#F59E0B]/20 rounded-[16px] p-6">
          <h3 className="font-semibold text-[#242529] mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-[#F59E0B]" />
            Lo que siempre preguntan sobre el crédito
          </h3>
          <div className="space-y-3 text-sm text-[#5C6068]">
            <p><strong className="text-[#242529]">¿Revisan buró de crédito?</strong> No. Evaluamos tu historial de compras dentro de Resurte.me, no tu score externo.</p>
            <p><strong className="text-[#242529]">¿Necesito aval?</strong> Cero. Tu historial con nosotros es tu mejor aval.</p>
            <p><strong className="text-[#242529]">¿Cuánto crédito me dan?</strong> Empiezas con una línea base que crece automáticamente conforme compras y pagas a tiempo.</p>
          </div>
        </div>

        <div className="text-center mt-10">
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 bg-[#108910] text-white font-semibold px-8 py-3 rounded-[10px] hover:bg-[#0D720D] transition-colors"
          >
            Crear cuenta y activar mi crédito
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </main>
  )
}
