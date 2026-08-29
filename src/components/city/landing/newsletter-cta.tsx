import { ArrowRight } from "lucide-react"

export function NewsletterCta({ citySlug }: { citySlug: string }) {
  return (
      <section className="bg-[#1A1A1A] py-10 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#3CC73C] mb-2.5">
            Mantente al día
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text-balance">
            Recibe nuestra lista de precios semanal
          </h2>
          <p className="text-sm sm:text-base text-white/60 mt-3 max-w-lg mx-auto leading-relaxed">
            Cada lunes te enviamos los precios actualizados. Sin spam, solo lo que necesitas para planear tus compras.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <a
              href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"}?text=Quiero%20recibir%20la%20lista%20de%20precios%20semanal`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#0F7A3D] text-white text-sm font-semibold px-6 py-3 rounded-[10px] hover:bg-[#0F6B3A] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Recibir por WhatsApp
            </a>
            <span className="text-sm text-white/40">o</span>
            <a
              href={`/${citySlug}/buscar`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-white/20 text-white text-sm font-semibold px-6 py-3 rounded-[10px] hover:bg-white/10 transition-colors"
            >
              Ver catálogo
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <p className="mt-6 text-[13px] text-white/60">
            Sin spam. Solo actualizaciones de precios cada lunes. Cancela cuando quieras.
          </p>
        </div>
      </section>
  )
}
