import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"
import {
  describeMuestra,
  filterByCiudad,
  formatFecha,
  formatPrecio,
  getPriceIndex,
  getPriceIndexUrlSlugs,
} from "@/lib/price-index"
import { getBreadcrumbSchema, getItemListSchema } from "@/lib/structured-data"
import { getSpeakableSpec } from "@/lib/blog-schema"
import { SITE_URL } from "@/lib/author"

export const revalidate = 3600
export const dynamicParams = false

export async function generateStaticParams() {
  const { ciudades } = await getPriceIndexUrlSlugs()
  return ciudades.map((ciudad) => ({ ciudad }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ciudad: string }>
}): Promise<Metadata> {
  const { ciudad } = await params
  const snapshot = await getPriceIndex()
  const puntos = filterByCiudad(snapshot.points, ciudad)
  const primero = puntos[0]
  if (!primero) return {}

  const url = `${SITE_URL}/precios/ciudad/${ciudad}`
  const nombre = primero.ciudad
  const title = `Precios de insumos para restaurantes en ${nombre} — Resurte.me`
  const description = `Cuánto cuestan los insumos de un restaurante en ${nombre}: ${puntos.length} precios de referencia por unidad, con fecha, rango observado y número de tiendas.`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: "Resurte.me",
      locale: "es_MX",
    },
  }
}

export default async function PreciosCiudadPage({
  params,
}: {
  params: Promise<{ ciudad: string }>
}) {
  const { ciudad } = await params
  const snapshot = await getPriceIndex()
  const puntos = filterByCiudad(snapshot.points, ciudad)
  const primero = puntos[0]
  if (!primero) notFound()

  const nombre = primero.ciudad
  const url = `${SITE_URL}/precios/ciudad/${ciudad}`

  // Agrupa por categoría conservando el orden alfabético de insumo dentro de
  // cada grupo, para que la tabla se lea como una lista de compras.
  const porCategoria = new Map<string, typeof puntos>()
  for (const punto of puntos) {
    const clave = punto.categoria ?? "Otros insumos"
    const lista = porCategoria.get(clave)
    if (lista) lista.push(punto)
    else porCategoria.set(clave, [punto])
  }

  const precios = puntos.map((p) => p.precio)
  const precioMin = Math.min(...precios)
  const precioMax = Math.max(...precios)
  const muestraTotal = puntos.reduce((sum, p) => sum + p.muestra, 0)
  const masBarato = puntos.reduce((a, b) => (b.precio < a.precio ? b : a), primero)
  const masCaro = puntos.reduce((a, b) => (b.precio > a.precio ? b : a), primero)

  const jsonLd = [
    getItemListSchema(
      `Precios de insumos para restaurantes en ${nombre}`,
      url,
      puntos.map((p) => ({
        name: `${p.insumo} — ${formatPrecio(p.precio)} por ${p.unidad ?? "unidad"}`,
        url: `${SITE_URL}/precios/${p.insumoSlug}`,
        description: `${p.insumo} en ${nombre}: ${formatPrecio(p.precio)} por ${p.unidad ?? "unidad"}. ${describeMuestra(p.muestra)}`,
      })),
      "Product"
    ),
    {
      "@type": "WebPage",
      "@id": `${url}#page`,
      url,
      name: `Precios de insumos para restaurantes en ${nombre}`,
      inLanguage: "es-MX",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/precios#dataset` },
      speakable: getSpeakableSpec(["#respuesta-rapida"]),
    },
    getBreadcrumbSchema([
      { name: "Inicio", url: SITE_URL },
      { name: "Índice de precios", url: `${SITE_URL}/precios` },
      { name: nombre, url },
    ]),
  ]

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd.filter(Boolean)) }}
      />

      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <nav aria-label="Ruta" className="mb-6 text-sm text-[#5C6068]">
            <Link href="/precios" className="hover:text-[#0E7A0E]">
              Índice de precios
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            <span className="text-[#242529]">{nombre}</span>
          </nav>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Precios de insumos para restaurantes en{" "}
            <span className="text-[#0E7A0E]">{nombre}</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            {puntos.length} {puntos.length === 1 ? "insumo" : "insumos"} con precio de
            referencia, por unidad y con número de tiendas observadas
            {snapshot.fecha ? ` · semana del ${formatFecha(snapshot.fecha)}` : ""}
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-10">
        <div
          id="respuesta-rapida"
          className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[16px] p-6"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#0E7A0E] mb-2">
            Respuesta rápida
          </h2>
          <p className="text-[#242529] leading-relaxed">
            Resurte.me publica {puntos.length} precios de referencia de insumos para
            restaurantes en {nombre}
            {snapshot.fecha ? `, en la semana del ${formatFecha(snapshot.fecha)}` : ""}.
            Los precios por unidad van de {formatPrecio(precioMin)} (
            {masBarato.insumo}) a {formatPrecio(precioMax)} ({masCaro.insumo}), sobre{" "}
            {muestraTotal} {muestraTotal === 1 ? "precio observado" : "precios observados"}{" "}
            entre las tiendas que abastecen la ciudad. Cada cifra es la mediana de las
            tiendas activas: cuando solo hay un precio, la tabla lo indica en la
            columna «tiendas».
          </p>
        </div>
      </section>

      {[...porCategoria.entries()].map(([categoria, lista]) => (
        <section key={categoria} className="max-w-3xl mx-auto px-4 pb-12">
          <h2 className="text-2xl font-bold text-[#242529] mb-4">{categoria}</h2>
          <div className="overflow-x-auto border border-[#E5E7EB] rounded-[16px]">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Precios de referencia de {categoria.toLowerCase()} en {nombre}, con
                unidad, precio y número de tiendas con precio.
              </caption>
              <thead className="bg-[#F9FAFB] text-[#242529]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Insumo
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Unidad
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Precio de referencia
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Tiendas
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {lista.map((punto) => (
                  <tr key={punto.insumoSlug}>
                    <th scope="row" className="px-4 py-3 font-medium">
                      <Link
                        href={`/precios/${punto.insumoSlug}`}
                        className="text-[#0E7A0E] hover:text-[#0D720D] hover:underline"
                      >
                        {punto.insumo}
                      </Link>
                    </th>
                    <td className="px-4 py-3 text-[#5C6068]">{punto.unidad ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold text-[#242529]">
                      {formatPrecio(punto.precio)}
                    </td>
                    <td className="px-4 py-3 text-[#5C6068]">
                      {punto.muestra === 0 ? "—" : punto.muestra}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="max-w-3xl mx-auto px-4 pb-20">
        <p className="text-sm text-[#5C6068] mb-6">
          {describeMuestra(muestraTotal)} Los precios son de referencia: el precio final
          depende de la cantidad y del plazo de pago.{" "}
          <Link href="/precios" className="font-semibold text-[#0E7A0E] hover:underline">
            Ver la metodología completa
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Link
            href="/blog/categoria/proveeduria"
            className="inline-flex items-center gap-2 font-semibold text-[#0E7A0E] hover:text-[#0D720D]"
          >
            Cómo comprar al mayoreo en {nombre}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/preguntas"
            className="inline-flex items-center gap-2 font-semibold text-[#0E7A0E] hover:text-[#0D720D]"
          >
            Preguntas de restauranteros, respondidas
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
