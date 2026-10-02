import type { Metadata } from "next"
import Link from "next/link"
import { Camera } from "lucide-react"
import { IMAGE_CREDITS, exigeAtribucion } from "@/content/image-credits"

/**
 * Créditos de las fotos de producto.
 *
 * Las fotos de Wikimedia Commons (migración 00194) fueron reemplazadas entre
 * oct-2026 por imágenes generadas en casa (migraciones 00204–00210), así que
 * ya no queda ninguna imagen que exija atribución. La página se mantiene para
 * explicarlo y por si vuelve a entrar material con licencia: en ese caso su
 * entrada se agrega a `src/content/image-credits.ts` y vuelve a listarse aquí.
 *
 * Estática a propósito: sin `cookies()` ni `headers()`, para no romper el
 * prerender de la ruta.
 */
export const metadata: Metadata = {
  title: "Créditos de imágenes — Resurte.me",
  description:
    "De dónde vienen las fotografías de producto de Resurte.me: autor, licencia y enlace al archivo original en Wikimedia Commons.",
}

export default function CreditosPage() {
  const conAtribucion = IMAGE_CREDITS.filter((c) => exigeAtribucion(c.licencia))
  const sinAtribucion = IMAGE_CREDITS.filter((c) => !exigeAtribucion(c.licencia))

  return (
    <div className="min-h-screen bg-white">
      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Créditos de <span className="text-[#0E7A0E]">imágenes</span>
          </h1>
          <p className="text-[#5C6068] max-w-2xl mx-auto">
            Todas las fotografías de producto del catálogo son propias o generadas para
            Resurte.me: ya no usamos material de terceros que exija atribución. Esta página
            queda como registro de esa política.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <div className="bg-gradient-to-r from-[#E8F5E8] to-[#F0F7F0] border border-[#0E7A0E]/20 rounded-[16px] p-5 mb-8">
          <p className="text-sm text-[#242529] flex items-start gap-2">
            <Camera className="w-4 h-4 text-[#0E7A0E] mt-0.5 flex-shrink-0" />
            <span>
              Hasta septiembre de 2026 usamos algunas fotos de Wikimedia Commons con su
              atribución (CC BY / CC BY-SA). Desde octubre de 2026 el catálogo completo usa
              imágenes propias o generadas para Resurte.me, sin material de terceros y sin
              atribuciones pendientes.
            </span>
          </p>
        </div>

        {IMAGE_CREDITS.length > 0 && (
          <>
            <h2 className="text-xl font-bold text-[#242529] mb-1">Con atribución obligatoria</h2>
            <p className="text-sm text-[#5C6068] mb-4">
              {conAtribucion.length} imágenes bajo licencias Creative Commons que exigen nombrar
              al autor y enlazar la licencia.
            </p>
            <ul className="space-y-3 mb-10">
              {conAtribucion.map((c) => (
                <li key={c.slug} className="border border-[#e0dbd2] rounded-[12px] p-3">
                  <p className="text-sm font-semibold text-[#242529]">{c.slug}</p>
                  <p className="text-xs text-[#5C6068] mt-1">
                    {c.autor} ·{" "}
                    {c.licenciaUrl ? (
                      <a
                        href={c.licenciaUrl}
                        className="underline hover:text-[#0E7A0E]"
                        rel="license noopener noreferrer"
                        target="_blank"
                      >
                        {c.licencia}
                      </a>
                    ) : (
                      <span>{c.licencia}</span>
                    )}{" "}
                    ·{" "}
                    <a
                      href={c.origenUrl}
                      className="underline hover:text-[#0E7A0E]"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {c.tituloCommons}
                    </a>
                  </p>
                </li>
              ))}
            </ul>

            <h2 className="text-xl font-bold text-[#242529] mb-1">Sin atribución</h2>
            <p className="text-sm text-[#5C6068] mb-4">
              {sinAtribucion.length} imágenes en dominio público o CC0. Se listan igual, por
              trazabilidad.
            </p>
            <ul className="space-y-3">
              {sinAtribucion.map((c) => (
                <li key={c.slug} className="border border-[#e0dbd2] rounded-[12px] p-3">
                  <p className="text-sm font-semibold text-[#242529]">{c.slug}</p>
                  <p className="text-xs text-[#5C6068] mt-1">
                    {c.autor} · {c.licencia} ·{" "}
                    <a
                      href={c.origenUrl}
                      className="underline hover:text-[#0E7A0E]"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {c.tituloCommons}
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="text-xs text-[#5C6068] mt-10">
          ¿Falta un crédito o crees que una imagen no debería estar aquí?{" "}
          <Link href="/contact" className="underline hover:text-[#0E7A0E]">
            Escríbenos
          </Link>{" "}
          y la retiramos.
        </p>
      </section>
    </div>
  )
}
