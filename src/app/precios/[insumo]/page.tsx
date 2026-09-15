import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"
import {
  describeMuestra,
  filterByInsumo,
  formatFecha,
  formatPrecio,
  getPriceIndex,
  getPriceIndexHistory,
  getPriceIndexUrlSlugs,
  promedio,
  variacionPct,
} from "@/lib/price-index"
import { getBreadcrumbSchema, getItemListSchema } from "@/lib/structured-data"
import { getSpeakableSpec } from "@/lib/blog-schema"
import { SITE_URL } from "@/lib/author"

// Las páginas de insumo se generan desde `price_index`. `dynamicParams` va en
// false para que un slug inexistente responda 404 real: con true, Next sirve
// 200 con la UI de "no encontrado" (soft 404) y eso es peor para SEO que no
// publicar la URL.
//
// Los slugs salen de `getPriceIndexUrlSlugs` (congelado por despliegue), el
// mismo conjunto que publica el sitemap, para que nunca anuncie una URL 404.
// Un insumo nuevo entra en el siguiente deploy.
export const revalidate = 3600
export const dynamicParams = false

export async function generateStaticParams() {
  const { insumos } = await getPriceIndexUrlSlugs()
  return insumos.map((insumo) => ({ insumo }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ insumo: string }>
}): Promise<Metadata> {
  const { insumo } = await params
  const snapshot = await getPriceIndex()
  const puntos = filterByInsumo(snapshot.points, insumo)
  const primero = puntos[0]
  if (!primero) return {}

  const url = `${SITE_URL}/precios/${insumo}`
  const nombre = primero.insumo
  const unidad = primero.unidad ?? "unidad"
  const title = `Precio de ${nombre} para restaurantes en México (por ${unidad}) — Resurte.me`
  const description = `Cuánto cuesta ${nombre} al mayoreo para un restaurante en México: precio de referencia por ${unidad} en ${puntos.length} ${puntos.length === 1 ? "ciudad" : "ciudades"}, con fecha, rango observado y número de tiendas.`

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

interface PuntoSerie {
  fecha: string
  precio: number
  precioMin: number
  precioMax: number
  ciudades: number
}

/** Agrega la serie histórica de un insumo (todas las ciudades) por semana. */
function agruparSerie(
  history: Awaited<ReturnType<typeof getPriceIndexHistory>>
): PuntoSerie[] {
  const porFecha = new Map<string, number[]>()
  for (const punto of history) {
    const precios = porFecha.get(punto.fecha)
    if (precios) precios.push(punto.precio)
    else porFecha.set(punto.fecha, [punto.precio])
  }

  return [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, precios]) => ({
      fecha,
      precio: promedio(precios.map((precio) => ({ precio }))) ?? 0,
      precioMin: Math.min(...precios),
      precioMax: Math.max(...precios),
      ciudades: precios.length,
    }))
}

export default async function PrecioInsumoPage({
  params,
}: {
  params: Promise<{ insumo: string }>
}) {
  const { insumo } = await params
  const snapshot = await getPriceIndex()
  const puntos = filterByInsumo(snapshot.points, insumo)
  const primero = puntos[0]
  if (!primero) notFound()

  const nombre = primero.insumo
  const unidad = primero.unidad ?? "unidad"
  const url = `${SITE_URL}/precios/${insumo}`

  const precios = puntos.map((p) => p.precio)
  const precioMin = Math.min(...precios)
  const precioMax = Math.max(...precios)
  const masBarato = puntos.reduce((a, b) => (b.precio < a.precio ? b : a), primero)
  const masCaro = puntos.reduce((a, b) => (b.precio > a.precio ? b : a), primero)
  const muestraTotal = puntos.reduce((sum, p) => sum + p.muestra, 0)

  const serie = agruparSerie(await getPriceIndexHistory(insumo))
  const variacion = variacionPct(serie)
  const maxSerie = serie.length ? Math.max(...serie.map((s) => s.precio)) : 0

  const jsonLd = [
    {
      "@type": "Product",
      "@id": `${url}#product`,
      name: `${nombre} para restaurantes`,
      description: `Precio de referencia de ${nombre} al mayoreo para restaurantes en México, por ${unidad}, actualizado semanalmente desde el catálogo de Resurte.me.`,
      url,
      ...(primero.categoria ? { category: primero.categoria } : {}),
      brand: { "@type": "Brand", name: "Resurte.me" },
      additionalProperty: [
        { "@type": "PropertyValue", name: "unidad", value: unidad },
        { "@type": "PropertyValue", name: "moneda", value: primero.moneda },
      ],
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: primero.moneda,
        lowPrice: precioMin,
        highPrice: precioMax,
        offerCount: puntos.length,
        availability: "https://schema.org/InStock",
        url,
      },
    },
    getItemListSchema(
      `Precio de ${nombre} por ciudad`,
      url,
      puntos.map((p) => ({
        name: `${nombre} en ${p.ciudad}`,
        url: `${SITE_URL}/precios/ciudad/${p.ciudadSlug}`,
        description: `${formatPrecio(p.precio)} por ${unidad} en ${p.ciudad}. ${describeMuestra(p.muestra)}`,
      })),
      "Offer"
    ),
    {
      "@type": "WebPage",
      "@id": `${url}#page`,
      url,
      name: `Precio de ${nombre} para restaurantes en México`,
      inLanguage: "es-MX",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${url}#product` },
      speakable: getSpeakableSpec(["#respuesta-rapida", "#historico"]),
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
            Precio de <span className="text-[#0E7A0E]">{nombre}</span> para
            restaurantes
          </h1>
          <p className="text-lg text-[#5C6068]">
            Por {unidad}, en {puntos.length}{" "}
            {puntos.length === 1 ? "ciudad" : "ciudades"} de México
            {primero.categoria ? ` · ${primero.categoria}` : ""}
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
            El precio de referencia de {nombre} para un restaurante en México es de{" "}
            {formatPrecio(precioMin)} a {formatPrecio(precioMax)} por {unidad} en la
            semana del {snapshot.fecha ? formatFecha(snapshot.fecha) : "corte actual"}
            . El punto más bajo está en {masBarato.ciudad} ({formatPrecio(precioMin)})
            y el más alto en {masCaro.ciudad} ({formatPrecio(precioMax)}). Cada precio
            es la mediana entre las tiendas activas que sirven esa ciudad, sobre{" "}
            {muestraTotal} {muestraTotal === 1 ? "precio observado" : "precios observados"}{" "}
            en total.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-14">
        <h2 className="text-2xl font-bold text-[#242529] mb-4">
          Precio de {nombre} por ciudad
        </h2>
        <div className="overflow-x-auto border border-[#E5E7EB] rounded-[16px]">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Precio de referencia de {nombre} por ciudad, con el rango observado
              entre tiendas y el número de tiendas con precio.
            </caption>
            <thead className="bg-[#F9FAFB] text-[#242529]">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Ciudad
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Precio de referencia
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Rango observado
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Tiendas
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {puntos.map((punto) => (
                <tr key={punto.ciudadSlug}>
                  <th scope="row" className="px-4 py-3 font-medium">
                    <Link
                      href={`/precios/ciudad/${punto.ciudadSlug}`}
                      className="text-[#0E7A0E] hover:text-[#0D720D] hover:underline"
                    >
                      {punto.ciudad}
                    </Link>
                  </th>
                  <td className="px-4 py-3 font-semibold text-[#242529]">
                    {formatPrecio(punto.precio)}
                  </td>
                  <td className="px-4 py-3 text-[#5C6068]">
                    {punto.precioMin === null || punto.precioMax === null
                      ? "—"
                      : punto.precioMin === punto.precioMax
                        ? "—"
                        : `${formatPrecio(punto.precioMin)} – ${formatPrecio(punto.precioMax)}`}
                  </td>
                  <td className="px-4 py-3 text-[#5C6068]">
                    {punto.muestra === 0 ? "—" : punto.muestra}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-[#5C6068]">{describeMuestra(muestraTotal)}</p>
      </section>

      {/* Serie histórica: solo cuando ya hay más de un corte */}
      {serie.length > 1 && (
        <section className="max-w-3xl mx-auto px-4 pb-14">
          <div
            id="historico"
            className="border border-[#E5E7EB] rounded-[16px] p-6 scroll-mt-24"
          >
            <h2 className="text-2xl font-bold text-[#242529] mb-2">
              Histórico de precio de {nombre}
            </h2>
            <p className="text-[#5C6068] leading-relaxed mb-6">
              Promedio del precio de referencia entre las {serie[0]?.ciudades ?? 0}{" "}
              {serie[0]?.ciudades === 1 ? "ciudad" : "ciudades"} publicadas, por semana
              ISO.
              {variacion !== null && (
                <>
                  {" "}
                  En {serie.length} cortes el precio{" "}
                  {variacion >= 0 ? "subió" : "bajó"}{" "}
                  {Math.abs(variacion).toFixed(1)}%.
                </>
              )}
            </p>

            <ul className="space-y-3">
              {serie.map((punto) => (
                <li key={punto.fecha} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-sm text-[#5C6068]">
                    {punto.fecha}
                  </span>
                  <span
                    className="h-3 rounded-full bg-[#0E7A0E]/70"
                    style={{
                      width: `${maxSerie > 0 ? Math.max((punto.precio / maxSerie) * 100, 2) : 0}%`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-[#242529]">
                    {formatPrecio(punto.precio)}
                  </span>
                  {punto.precioMin !== punto.precioMax && (
                    <span className="text-sm text-[#5C6068]">
                      ({formatPrecio(punto.precioMin)} – {formatPrecio(punto.precioMax)})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="max-w-3xl mx-auto px-4 pb-14">
        <h2 className="text-2xl font-bold text-[#242529] mb-4">
          ¿Por qué cambia el precio de {nombre}?
        </h2>
        <ul className="space-y-3 text-[#5C6068] leading-relaxed">
          <li>
            <strong className="text-[#242529]">Temporada y clima:</strong> el precio
            de los perecederos se mueve por cosecha, lluvia y calor; un mismo insumo
            puede variar de una semana a otra.
          </li>
          <li>
            <strong className="text-[#242529]">Presentación:</strong> el precio por{" "}
            {unidad} no es comparable con otro empaque. Antes de comparar proveedores,
            convierte todo a la misma unidad de uso en cocina.
          </li>
          <li>
            <strong className="text-[#242529]">Ciudad:</strong> la distancia al centro
            de abasto y el volumen que compra la zona cambian el precio de lista.
          </li>
          <li>
            <strong className="text-[#242529]">Volumen y crédito:</strong> el precio
            final depende de la cantidad y del plazo de pago acordado.
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
          <Link
            href="/blog/categoria/costos"
            className="inline-flex items-center gap-2 font-semibold text-[#0E7A0E] hover:text-[#0D720D]"
          >
            Cómo costear con estos precios
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/precios"
            className="inline-flex items-center gap-2 font-semibold text-[#0E7A0E] hover:text-[#0D720D]"
          >
            Ver el índice completo
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
