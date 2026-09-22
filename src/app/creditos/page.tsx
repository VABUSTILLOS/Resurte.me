import type { Metadata } from "next"
import Link from "next/link"
import { Camera } from "lucide-react"
import { IMAGE_CREDITS, exigeAtribucion } from "@/content/image-credits"

/**
 * Créditos de las fotos de producto.
 *
 * No es una página de cortesía: **17 de las 22 fotos de AB Foods son CC BY o
 * CC BY-SA**, y esas licencias exigen atribución. Publicar la foto sin decir de
 * quién es y bajo qué licencia la convierte en una infracción, así que esta
 * página es la mitad visible del cumplimiento y
 * `src/content/image-credits.ts` es la mitad verificable.
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
            Las fotografías de producto que no son nuestras vienen de Wikimedia Commons y se
            usan bajo su licencia original. Aquí está el autor y la licencia de cada una.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <div className="bg-gradient-to-r from-[#E8F5E8] to-[#F0F7F0] border border-[#0E7A0E]/20 rounded-[16px] p-5 mb-8">
          <p className="text-sm text-[#242529] flex items-start gap-2">
            <Camera className="w-4 h-4 text-[#0E7A0E] mt-0.5 flex-shrink-0" />
            <span>
              Son fotos reales del <strong>tipo</strong> de alimento, no del producto exacto: unas
              papas curly, no la caja de 13.61 kg de un proveedor concreto. No usamos el material
              gráfico de otras marcas porque sería engañoso.
            </span>
          </p>
        </div>

        <h2 className="text-xl font-bold text-[#242529] mb-1">Con atribución obligatoria</h2>
        <p className="text-sm text-[#5C6068] mb-4">
          {conAtribucion.length} imágenes bajo licencias Creative Commons que exigen nombrar al
          autor y enlazar la licencia.
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
