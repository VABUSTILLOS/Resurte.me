import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, FileText, CheckCircle, Download, Shield } from "lucide-react"

export const metadata: Metadata = {
  title: "Facturación electrónica (CFDI 4.0) — Resurte.me",
  description:
    "Todas tus compras se pueden facturar. Pide tu CFDI 4.0 y te lo emitimos listo para deducir. Sin costo extra.",
}

export default function FacturacionPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-12 sm:py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl sm:text-5xl font-bold text-[#242529] mb-4">
            Facturación{" "}
            <span className="text-[#0E7A0E]">sin costo extra</span>
          </h1>
          <p className="text-base sm:text-lg text-[#5C6068]">
            Nos mandas tus datos fiscales una sola vez y te emitimos tu CFDI 4.0
            cuando lo pidas. Sin costo, sin recordatorios, sin estrés fiscal.
          </p>
        </div>
      </section>

      {/* Trust badge */}
      <section className="max-w-xl mx-auto px-4 pb-10">
        <div className="bg-gradient-to-r from-[#E8F5E8] to-[#F0F7F0] border border-[#0E7A0E]/20 rounded-[16px] p-4 flex items-center gap-3 sm:gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 bg-[#0E7A0E] rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#242529]">CFDI 4.0 sin costo</p>
            <p className="text-xs text-[#5C6068]">Emitimos comprobantes válidos ante el SAT, 100% deducibles. Si algo sale mal con tu factura, la corregimos y te la reemitimos.</p>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-10 sm:py-16">
        <div className="grid sm:grid-cols-3 gap-6 sm:gap-8 mb-10 sm:mb-16">
          {[
            {
              icon: FileText,
              title: "CFDI 4.0 sin falta",
              desc: "Facturas electrónicas que cumplen al pie de la letra con los requisitos más recientes del SAT. 100% deducibles. Sin excepciones.",
            },
            {
              icon: CheckCircle,
              title: "Facturamos a tu nombre",
              desc: "Emitimos con tus datos fiscales: RFC, razón social, régimen fiscal, uso de CFDI y código postal. Nos los mandas una vez y quedan guardados para tus siguientes compras.",
            },
            {
              icon: Download,
              title: "En PDF y XML",
              desc: "Te entregamos tu factura en PDF y XML, listos para tu contador y para deducir. Si prefieres, te la enviamos por correo.",
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

        <div className="bg-[#F9FAFB] rounded-[16px] p-5 sm:p-8 mb-8 sm:mb-12">
          <h2 className="text-lg sm:text-xl font-bold text-[#242529] mb-3 sm:mb-4">
            ¿Qué necesitas para facturar?
          </h2>
          <ul className="space-y-2.5 text-[13px] sm:text-sm text-[#5C6068]">
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
          <p className="mt-4 text-[13px] sm:text-sm text-[#5C6068]">
            Mándanoslos con el número de tu pedido y te emitimos la factura.
          </p>
        </div>

        <div className="text-center">
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 bg-[#0E7A0E] text-white font-semibold px-6 sm:px-8 py-3 rounded-[10px] hover:bg-[#0D720D] transition-colors"
          >
            Crear cuenta y facturar mis compras
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
