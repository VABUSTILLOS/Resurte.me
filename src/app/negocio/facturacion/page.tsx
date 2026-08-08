import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, FileText, CheckCircle, Download, Shield } from "lucide-react"

export const metadata: Metadata = {
  title: "Facturación electrónica (CFDI 4.0) — Resurte.me",
  description:
    "Cada compra genera tu factura automáticamente. CFDI 4.0, listo para deducir. Sin costo extra, sin pasos extra.",
}

export default function FacturacionPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Facturación{" "}
            <span className="text-[#0E7A0E]">sin mover un dedo</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Registras tu RFC una sola vez y olvídate. Cada pedido genera tu CFDI
            4.0 automáticamente. Sin costo, sin recordatorios, sin estrés fiscal.
          </p>
        </div>
      </section>

      {/* Trust badge */}
      <section className="max-w-xl mx-auto px-4 pb-10">
        <div className="bg-gradient-to-r from-[#E8F5E8] to-[#F0F7F0] border border-[#0E7A0E]/20 rounded-[16px] p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-[#0E7A0E] rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#242529]">CFDI 4.0 garantizado</p>
            <p className="text-xs text-[#5C6068]">Cumplimos con todos los requisitos del SAT. Tus facturas son 100% deducibles. Si el SAT te rechaza una factura nuestra, la corregimos en menos de 4 horas.</p>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {[
            {
              icon: FileText,
              title: "CFDI 4.0 sin falta",
              desc: "Facturas electrónicas que cumplen al pie de la letra con los requisitos más recientes del SAT. 100% deducibles. Sin excepciones.",
            },
            {
              icon: CheckCircle,
              title: "Automático de verdad",
              desc: "Registras tu RFC y uso de CFDI al crear tu cuenta. A partir de ahí, cada pedido dispara tu factura sin que tengas que pedirla. Cero clics.",
            },
            {
              icon: Download,
              title: "Siempre disponibles",
              desc: "Todas tus facturas viven en tu panel. Descarga PDF y XML cuando quieras. También te las mandamos por correo si lo prefieres.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="text-center">
              <div className="w-14 h-14 bg-[#E8F5E8] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Icon className="w-7 h-7 text-[#0E7A0E]" />
              </div>
              <h3 className="text-lg font-semibold text-[#242529] mb-2">
                {title}
              </h3>
              <p className="text-sm text-[#5C6068] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-[#F9FAFB] rounded-[16px] p-8 mb-12">
          <h2 className="text-xl font-bold text-[#242529] mb-4">
            ¿Qué necesitas para facturar?
          </h2>
          <ul className="space-y-3 text-[#5C6068]">
            {[
              "RFC de tu negocio (persona física o moral)",
              "Razón social (nombre o denominación fiscal)",
              "Régimen fiscal (lo encuentras en tu Constancia de Situación Fiscal)",
              "Uso de CFDI (el más común para compras es G03 — Gastos en general)",
              "Código postal de tu domicilio fiscal",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-[#0E7A0E] mt-0.5">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-center">
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 bg-[#0E7A0E] text-white font-semibold px-8 py-3 rounded-[10px] hover:bg-[#0D720D] transition-colors"
          >
            Crear cuenta y automatizar mi facturación
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
