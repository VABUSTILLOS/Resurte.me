import Link from "next/link"

export function AliadoNegocio() {
  return (
      <section className="bg-[#F7F5F0] py-12 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8 sm:mb-12">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#0E7A0E] mb-2.5">
              Aliado de tu negocio
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] tracking-tight text-balance">
              Tu negocio no puede parar. Nosotros tampoco.
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-3 max-w-xl mx-auto leading-relaxed">
              Calidad consistente, precios que no brincan, facturación automática y un ejecutivo que te contesta en minutos. Así de simple.
            </p>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-10">
            {/* Left: image */}
            <div className="w-full md:w-1/2">
              <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-[#E8F5E8] to-[#D4F0D4] flex items-center justify-center overflow-hidden">
                <div className="text-center px-8">
                  <span className="text-6xl">🚛</span>
                  <p className="mt-4 text-[#0E7A0E] font-semibold text-lg">
                   La central de abastos, sin salir de tu cocina
                  </p>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                   Pide hoy, recibe mañana. Frescura directo del productor.
                  </p>
                </div>
              </div>
            </div>

            {/* Right: copy */}
            <div className="w-full md:w-1/2">
              <ul className="space-y-3 text-sm text-[#5C6068]">
                {[
                  {
                    title: "Calidad consistente",
                    desc: "Cada entrega pasa por control de calidad. Frescura garantizada, siempre.",
                  },
                  {
                    title: "Precios estables",
                    desc: "Sin sorpresas. Bloqueamos precios por semana para que planees tus costos.",
                  },
                  {
                    title: "Facturación fiscal",
                    desc: "Todos los pedidos incluyen CFDI. Deduce tus compras sin complicaciones.",
                  },
                  {
                    title: "Pedidos recurrentes",
                    desc: "Programa entregas semanales. Tus básicos siempre en stock, sin preocuparte.",
                  },
                  {
                    title: "Atención directa",
                    desc: "Un ejecutivo de cuenta para tu negocio. Resolvemos dudas por WhatsApp en minutos.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="mt-0.5 text-[#0E7A0E] shrink-0">✓</span>
                    <div>
                      <strong className="text-[#242529]">{item.title}</strong>
                      <span className="block text-[13px] sm:text-sm text-[var(--text-secondary)] mt-0.5">{item.desc}</span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Action CTA */}
              <div className="mt-6 flex gap-3">
                <Link
                  href="/auth/register"
                  className="inline-flex items-center gap-2 bg-[#0E7A0E] text-white text-sm font-semibold px-5 py-2.5 rounded-[10px] hover:bg-[#0D720D] transition-colors"
                >
                  Registra tu negocio
                </Link>
                <a
                  href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"}?text=${encodeURIComponent("Me interesa conocer su catálogo de productos y programa de recompensas")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 border border-[#C7CACD] text-[#5C6068] text-sm font-semibold px-5 py-2.5 rounded-[10px] hover:border-[#0E7A0E] hover:text-[#0E7A0E] transition-colors"
                >
                  Agenda una llamada
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
  )
}
