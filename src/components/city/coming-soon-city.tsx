import Link from "next/link"
import { ArrowRight, MapPin, Truck } from "lucide-react"

import { DEFAULT_CITY_SLUG } from "@/lib/cities"
import type { City } from "@/types"

/**
 * Página de una ciudad que todavía no tiene cobertura. Sustituye al catálogo
 * completo: no hay productos, carrito ni checkout, solo la promesa de llegada
 * y un puente a la ciudad que sí opera hoy (Chihuahua).
 */
export function ComingSoonCity({ city }: { city: City }) {
  return (
    <div className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0E7A0E]/20 bg-[#E9FBE9] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#0E7A0E]">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Próximamente
          </span>
          <h1 className="mt-5 text-4xl font-bold text-[#242529] sm:text-5xl">
            Muy pronto en{" "}
            <span className="text-[#0E7A0E]">{city.name}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-[#5C6068]">
            Por ahora operamos solo en Chihuahua, Chihuahua. Estamos preparando
            la cobertura para {city.name}, {city.state}: mismo catálogo de
            abarrotes, frutas, verduras, carnes y desechables por mayoreo, con
            entrega el mismo día.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={`/${DEFAULT_CITY_SLUG}`}
              className="inline-flex items-center gap-2 rounded-full bg-[#0E7A0E] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0D720D]"
            >
              Ver catálogo en Chihuahua
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full border border-[#E8E9EB] px-6 py-3 text-sm font-semibold text-[#343538] transition-colors hover:border-[#0E7A0E]/40 hover:text-[#0E7A0E]"
            >
              Avísame cuando lleguen
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20">
        <div className="flex flex-col items-center gap-3 rounded-[16px] border border-[#E8E9EB] bg-[#F9FAFB] p-8 text-center">
          <Truck className="h-6 w-6 text-[#0E7A0E]" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-[#5C6068]">
            ¿Tienes un negocio en {city.name}? Escríbenos y te avisamos en
            cuanto activemos la cobertura. Mientras tanto, si compras desde
            Chihuahua, ya puedes pedir hoy.
          </p>
          <Link
            href="/ciudades"
            className="text-sm font-semibold text-[#0E7A0E] hover:underline"
          >
            Ver zonas de entrega
          </Link>
        </div>
      </section>
    </div>
  )
}
