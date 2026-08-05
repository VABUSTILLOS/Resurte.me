import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Términos y condiciones — Resurte.me",
  description:
    "Las reglas del juego, en español claro. Condiciones de uso de Resurte.me para que sepas exactamente qué esperar de nosotros y qué esperamos de ti.",
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Términos y <span className="text-[#108910]">condiciones</span>
          </h1>
          <p className="text-[#5C6068]">
            Última actualización: enero 2026
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-16 space-y-10">
        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">1. Aceptación de los términos</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Al acceder y utilizar Resurte.me, aceptas estos Términos y
            Condiciones. Si no estás de acuerdo, no debes utilizar la plataforma.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">2. Descripción del servicio</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Resurte.me es una plataforma digital que conecta compradores
            (negocios) con proveedores de productos de abasto. No somos
            productores ni almacenamos inventario; facilitamos la transacción
            entre las partes.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">3. Registro y cuenta</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Para realizar pedidos debes crear una cuenta con información veraz y
            actualizada. Eres responsable de mantener la confidencialidad de tu
            contraseña y de todas las actividades que ocurran bajo tu cuenta.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">4. Pedidos y pagos</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Todos los precios están en pesos mexicanos (MXN) e incluyen IVA. Los
            pedidos se confirman una vez recibido el pago. Nos reservamos el
            derecho de cancelar pedidos por falta de inventario o inconsistencias
            en el pago.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">5. Entregas</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Las entregas se realizan en las zonas y horarios especificados al
            momento del pedido. No nos hacemos responsables por demoras causadas
            por fuerza mayor, condiciones climáticas o información de entrega
            incorrecta.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">6. Devoluciones y reembolsos</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Aceptamos reportes de productos en mal estado dentro de las 24 horas
            posteriores a la entrega. El reembolso o reposición se procesa en un
            plazo de 3 a 5 días hábiles.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">7. Programa de recompensas</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Los puntos y recompensas no tienen valor monetario y no son
            transferibles. Nos reservamos el derecho de modificar o cancelar el
            programa en cualquier momento, notificándolo con al menos 15 días de
            anticipación.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">8. Limitación de responsabilidad</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Resurte.me no será responsable por daños indirectos, incidentales o
            consecuentes derivados del uso de la plataforma. Nuestra
            responsabilidad total se limita al valor del pedido en cuestión.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">9. Modificaciones</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Podemos modificar estos términos en cualquier momento. Los cambios
            entrarán en vigor al ser publicados en la plataforma. El uso
            continuado de Resurte.me implica la aceptación de los nuevos
            términos.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#242529] mb-3">10. Legislación aplicable</h2>
          <p className="text-[#5C6068] leading-relaxed">
            Estos términos se rigen por las leyes de los Estados Unidos
            Mexicanos. Cualquier controversia se resolverá ante los tribunales
            competentes de la Ciudad de México.
          </p>
        </div>
      </section>
    </main>
  )
}
