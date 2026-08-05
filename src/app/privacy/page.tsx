import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Política de privacidad — Resurte.me",
  description:
    "Conoce cómo Resurte.me recopila, usa y protege tus datos personales y los de tu negocio conforme a la legislación mexicana.",
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Política de <span className="text-[#108910]">privacidad</span>
          </h1>
          <p className="text-[#5C6068]">
            Última actualización: enero 2026
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-16 space-y-10">
        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">1. Responsable del tratamiento</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Resurte.me, con domicilio en Ciudad de México, es el responsable del
            tratamiento de los datos personales que nos proporciones, conforme a
            la Ley Federal de Protección de Datos Personales en Posesión de los
            Particulares (LFPDPPP).
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">2. Datos que recopilamos</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Recopilamos nombre, correo electrónico, teléfono, RFC, dirección de
            entrega e información de tu negocio. También recopilamos datos de uso
            de la plataforma para mejorar tu experiencia.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">3. Finalidad del tratamiento</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Tus datos se utilizan para procesar pedidos, emitir facturas, enviar
            comunicaciones sobre tu cuenta, mejorar nuestros servicios y, con tu
            consentimiento, enviarte promociones y novedades.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">4. Derechos ARCO</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Tienes derecho a Acceder, Rectificar, Cancelar y Oponerte al
            tratamiento de tus datos personales. Envía tu solicitud a{" "}
            <a href="mailto:privacidad@resurte.me" className="text-[#108910] hover:underline">
              privacidad@resurte.me
            </a>{" "}
            y la atenderemos en un plazo máximo de 20 días hábiles.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">5. Seguridad</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Implementamos medidas técnicas, administrativas y físicas para
            proteger tus datos contra acceso no autorizado, pérdida o alteración.
            Sin embargo, ningún sistema es 100% seguro.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">6. Cambios a esta política</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Nos reservamos el derecho de modificar esta política en cualquier
            momento. Te notificaremos los cambios por correo electrónico o
            mediante un aviso en la plataforma.
          </p>
        </div>
      </section>
    </main>
  )
}
