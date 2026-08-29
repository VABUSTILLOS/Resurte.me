export function CustomerSegments() {
  return (
      <section className="bg-white py-12 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8 sm:mb-12">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#0E7A0E] mb-2.5">
              Hecho para ti
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] tracking-tight text-balance">
              ¿Para quién es?
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-3 max-w-xl mx-auto leading-relaxed">
              Si tu negocio sirve comida, Resurte es tu proveedor. Sin mínimo, sin membresía, sin complicaciones.
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: "🍽️",
                title: "Restaurantes",
                desc: "Frutas, verduras, carnes y abarrotes para tu cocina. Por mayoreo, sin mínimo.",
              },
              {
                icon: "🏨",
                title: "Hoteles",
                desc: "Despensa completa para servicio de alimentos. Calidad consistente, entregas programadas.",
              },
              {
                icon: "🏪",
                title: "Tienditas",
                desc: "Surtimos tu changarro con productos de alta rotación. Precios de central de abastos.",
              },
              {
                icon: "🏢",
                title: "Oficinas y comedores",
                desc: "Insumos para cocina industrial. Facturación electrónica, línea de crédito disponible.",
              },
            ].map((seg) => (
              <div
                key={seg.title}
                className="group p-4 sm:p-6 rounded-xl border border-[#E8E9EB] hover:border-[#0E7A0E]/30 hover:shadow-sm hover:-translate-y-1 transition-all duration-200"
              >
                <div className="text-3xl mb-3">{seg.icon}</div>
                <h3 className="font-semibold text-[#242529] mb-1.5 group-hover:text-[#0E7A0E] transition-colors text-sm sm:text-base">
                  {seg.title}
                </h3>
                <p className="text-[13px] sm:text-sm text-[var(--text-secondary)] leading-relaxed">{seg.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
  )
}
