import { Search, Store, Truck } from "lucide-react"

export function HowItWorks() {
  return (
      <section className="bg-white py-5 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-3.5 sm:mb-12">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#0E7A0E] mb-2.5">
              Así de fácil
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] tracking-tight text-balance">
              Abastece tu negocio en 3 pasos
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-1.5 sm:mt-3 max-w-xl mx-auto leading-relaxed">
              Sin membresías, sin mínimo de compra. Solo los ingredientes que necesitas, cuando los necesitas.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-8">
            {[
              {
                icon: Search,
                title: "Elige tus insumos",
                desc: "Explora frutas, verduras, carnes y abarrotes. Por caja, bulto o pieza — como en la central de abastos.",
              },
              {
                icon: Store,
                title: "Arma tu pedido",
                desc: "Agrega lo que necesitas al carrito. Sin mínimo de compra. Facturación electrónica incluida.",
              },
              {
                icon: Truck,
                title: "Recibe en tu negocio",
                desc: "Entrega el mismo día. Frescura garantizada. Listo para tu operación del día.",
              },
            ].map((step, i) => (
              <div
                key={step.title}
                className="text-center p-2.5 sm:p-6 rounded-xl hover:-translate-y-1 transition-all duration-200 ease-out will-change-transform"
              >
                <div className="w-10 h-10 sm:w-14 sm:h-14 mx-auto mb-1.5 sm:mb-4 rounded-full bg-[#E9FBE9] flex items-center justify-center">
                  <step.icon className="w-5 h-5 sm:w-6 sm:h-6 text-[#0E7A0E]" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-[#242529] mb-0.5 sm:mb-2">
                  {i + 1}. {step.title}
                </h3>
                <p className="text-[var(--text-secondary)] text-[13px] sm:text-sm leading-snug">{step.desc}</p>
              </div>
            ))}
          </div>

          {/* Trust bar — business-focused */}
          <div className="mt-3 sm:mt-14 flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-8 gap-y-1 text-[13px] sm:text-sm text-[var(--text-secondary)]">
            {["Sin membresía", "Envío gratis desde $2,500", "Facturación electrónica", "Pago seguro", "Calidad garantizada"].map((label) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#E9FBE9] flex items-center justify-center text-[#0E7A0E] text-[10px] sm:text-xs font-bold" aria-hidden="true">✓</span>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>
  )
}
