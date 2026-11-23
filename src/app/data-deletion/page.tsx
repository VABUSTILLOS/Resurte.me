import type { Metadata } from "next"
import Link from "next/link"
import { Trash2, Mail, Clock } from "lucide-react"
import {
  BUSINESS_EMAIL,
  PHONE_DISPLAY,
  PHONE_TEL_HREF,
} from "@/lib/business"

export const metadata: Metadata = {
  title: "Eliminación de datos de usuario — Resurte.me",
  description:
    "Cómo solicitar la eliminación de tus datos personales de Resurte.me: qué se elimina, cómo pedirlo y en qué plazo.",
}

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Eliminación de <span className="text-[#0E7A0E]">datos de usuario</span>
          </h1>
          <p className="text-[#5C6068]">
            Última actualización: noviembre 2026
          </p>
        </div>
      </section>

      {/* Trust summary */}
      <section className="max-w-3xl mx-auto px-4 pb-12">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Trash2, title: "Tú decides", desc: "Puedes pedir la eliminación de tus datos personales cuando quieras, sin costo." },
            { icon: Mail, title: "Un solo mensaje", desc: "Basta un correo o un WhatsApp con tus datos de cuenta para iniciar el proceso." },
            { icon: Clock, title: "Máximo 20 días hábiles", desc: "Confirmamos la recepción y completamos la eliminación conforme a la LFPDPPP." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[12px] p-5 text-center">
              <div className="w-10 h-10 bg-[#E8F5E8] rounded-xl flex items-center justify-center mx-auto mb-3">
                <Icon className="w-5 h-5 text-[#0E7A0E]" />
              </div>
              <h3 className="text-sm font-semibold text-[#242529] mb-1">{title}</h3>
              <p className="text-xs text-[#5C6068] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-16 space-y-10">
        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">1. Qué datos puedes eliminar</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Puedes solicitar la eliminación de los datos personales asociados
            a tu cuenta de Resurte.me: nombre, correo electrónico, teléfono,
            direcciones de entrega, datos de tu negocio y el historial de
            conversaciones de WhatsApp vinculado a tu número. Esta solicitud
            corresponde al derecho de Cancelación de tus derechos ARCO,
            conforme a la Ley Federal de Protección de Datos Personales en
            Posesión de los Particulares (LFPDPPP).
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">2. Cómo solicitar la eliminación</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Envía un correo a{" "}
            <a href={`mailto:${BUSINESS_EMAIL}`} className="text-[#0E7A0E] hover:underline">
              {BUSINESS_EMAIL}
            </a>{" "}
            con el asunto «Eliminación de datos», indicando tu nombre, el
            teléfono y el correo asociados a tu cuenta. También puedes
            pedirlo por WhatsApp al{" "}
            <a href={PHONE_TEL_HREF} className="text-[#0E7A0E] hover:underline">
              {PHONE_DISPLAY}
            </a>
            . Podemos pedirte que confirmes tu identidad como titular de la
            cuenta antes de proceder.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">3. Plazo y confirmación</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Confirmaremos la recepción de tu solicitud y completaremos la
            eliminación en un plazo máximo de 20 días hábiles. Te avisaremos
            por el mismo medio cuando el proceso haya concluido.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">4. Datos que debemos conservar</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Los registros fiscales y contables que la ley mexicana nos obliga
            a conservar (por ejemplo, las facturas CFDI emitidas a tu nombre)
            se mantendrán únicamente por el plazo legal aplicable y separados
            de tu cuenta eliminada. Todo lo demás se borra de forma
            permanente.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">5. Más información</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Consulta cómo tratamos tus datos en nuestra{" "}
            <Link href="/privacy" className="text-[#0E7A0E] hover:underline">
              política de privacidad
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  )
}
