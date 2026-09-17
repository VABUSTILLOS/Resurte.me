import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Clock, CreditCard, MessageCircle, ShieldCheck, Star } from "lucide-react"
import { CREDIT_DAYS_PROSE } from "@/lib/commercial-facts"

export const metadata: Metadata = {
  title: "Línea de crédito para tu negocio — Resurte.me",
  description:
    "Paga tus insumos a 7, 15 o 30 días. Sin aval, sin consulta a buró. Arreglamos tu línea con un ejecutivo según tu historial de compras.",
}

export default function CreditoPage() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"

  return (
    <div className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-12 sm:py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl sm:text-5xl font-bold text-[#242529] mb-4">
            Surtir hoy,{" "}
            <span className="text-[#0E7A0E]">pagar después</span>
          </h1>
          <p className="text-base sm:text-lg text-[#5C6068]">
            Tu negocio no debería frenarse porque la caja está apretada.
            Arreglamos tu línea de crédito a {CREDIT_DAYS_PROSE} días con un
            ejecutivo, según tu historial de compras.
          </p>
        </div>
      </section>

      {/* Trust stats */}
      <section className="max-w-3xl mx-auto px-4 pb-10">
        <div className="bg-white border border-[#E5E7EB] rounded-[16px] p-4 sm:p-6 grid gap-4 text-center sm:grid-cols-3">
          {[
            { value: `${CREDIT_DAYS_PROSE} días`, label: "Plazos a elegir" },
            { value: "Sin aval", label: "Sin garantías ni papeleo" },
            { value: "Sin buró", label: "Sin consulta a buró de crédito" },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-xl sm:text-2xl font-extrabold text-[#0E7A0E]">{value}</p>
              <p className="text-[13px] text-[#5C6068] mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-10 sm:py-16">
        <div className="grid sm:grid-cols-3 gap-6 sm:gap-8 mb-10 sm:mb-16">
          {[
            {
              icon: Clock,
              title: "Paga a 7, 15 o 30 días",
              desc: "Tú eliges la fecha que mejor se acopla a tu flujo. ¿Cierres quincenales? ¿Cobranza a 30 días? Lo armamos a tu ritmo, sin letras chiquitas.",
            },
            {
              icon: ShieldCheck,
              title: "Cero garantías, cero papeleo",
              desc: "Nada de aval, propiedades en garantía ni trámites eternos. Miramos tu historial de compras en la plataforma y acordamos tu línea por WhatsApp.",
            },
            {
              icon: CreditCard,
              title: "Tu crédito crece contigo",
              desc: "Empiezas con una línea base y, conforme compras y pagas a tiempo, revisamos tu línea al alza. Como debe ser.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 text-left sm:block sm:text-center">
              <div className="w-12 h-12 bg-[#E8F5E8] rounded-2xl flex items-center justify-center flex-shrink-0 sm:mx-auto sm:mb-4 sm:w-14 sm:h-14">
                <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-[#0E7A0E]" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-[#242529] sm:mb-2">
                  {title}
                </h3>
                <p className="text-[13px] sm:text-sm text-[#5C6068] leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="bg-[#F9FAFB] rounded-[16px] p-5 sm:p-8 mb-8 sm:mb-12">
          <h2 className="text-xl sm:text-2xl font-bold text-[#242529] text-center mb-4 sm:mb-8">
            Tres pasos. Cero vueltas.
          </h2>
          <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
            {[
              { step: "1", title: "Solicítalo", desc: "Escríbenos por WhatsApp con tu RFC y el volumen que compras al mes." },
              { step: "2", title: "Acordamos tu línea", desc: "Revisamos tu historial con nosotros y definimos monto y plazo contigo." },
              { step: "3", title: "Súrtete", desc: "Tus siguientes pedidos se facturan a crédito con la fecha de pago que acordamos." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#0E7A0E] text-white rounded-full flex items-center justify-center mx-auto mb-2.5 sm:mb-3 text-base sm:text-lg font-bold">
                  {step}
                </div>
                <h3 className="font-semibold text-[#242529] mb-1">{title}</h3>
                <p className="text-[13px] sm:text-sm text-[#5C6068]">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ about credit */}
        <div className="max-w-3xl mx-auto mt-8 sm:mt-12 bg-[#FFF7ED] border border-[#F59E0B]/20 rounded-[16px] p-4 sm:p-6">
          <h3 className="font-semibold text-[#242529] mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-[#F59E0B]" />
            Lo que siempre preguntan sobre el crédito
          </h3>
          <div className="space-y-2.5 text-[13px] sm:text-sm text-[#5C6068]">
            <p><strong className="text-[#242529]">¿Revisan buró de crédito?</strong> No. Evaluamos tu historial de compras dentro de Resurte.me, no tu score externo.</p>
            <p><strong className="text-[#242529]">¿Necesito aval?</strong> Cero. Tu historial con nosotros es tu mejor aval.</p>
            <p><strong className="text-[#242529]">¿Cuánto crédito me dan?</strong> Empiezas con una línea base que revisamos al alza conforme compras y pagas a tiempo.</p>
          </div>
        </div>

        <div className="text-center mt-8 sm:mt-10">
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hola, quiero información sobre la línea de crédito para mi negocio.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#0E7A0E] text-white font-semibold px-6 sm:px-8 py-3 rounded-[10px] hover:bg-[#0D720D] transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Pedir mi línea de crédito
            </a>
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center gap-2 border border-[#E5E7EB] text-[#242529] font-semibold px-6 sm:px-8 py-3 rounded-[10px] hover:bg-[#F9FAFB] transition-colors"
            >
              Crear cuenta
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
