export function PricingBanner() {
  return (
      <section className="bg-[#0E7A0E] text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl shrink-0">
                💰
              </div>
              <div>
                <h3 className="text-lg font-bold">Precios de mayoreo, directo a tu negocio</h3>
                <p className="text-white/90 text-sm">Sin membresías, sin mínimo de compra. Facturación electrónica incluida.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm font-medium">
              <span className="flex items-center gap-1.5 bg-black/15 rounded-full px-4 py-2">
                <span className="w-2 h-2 rounded-full bg-[#3CC73C]" />
                Envío gratis desde $2,500
              </span>
              <span className="flex items-center gap-1.5 bg-black/15 rounded-full px-4 py-2">
                <span className="w-2 h-2 rounded-full bg-[#3CC73C]" />
                Entrega el mismo día
              </span>
              <span className="flex items-center gap-1.5 bg-black/15 rounded-full px-4 py-2">
                <span className="w-2 h-2 rounded-full bg-[#3CC73C]" />
                Pago seguro
              </span>
            </div>
          </div>
        </div>
      </section>
  )
}
