import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, TrendingUp } from "lucide-react"
import {
  describeMuestra,
  formatFecha,
  formatPrecio,
  getPriceIndex,
  summarizeCiudades,
  summarizeInsumos,
} from "@/lib/price-index"
import {
  getBreadcrumbSchema,
  getDatasetSchema,
  getItemListSchema,
} from "@/lib/structured-data"
import { getSpeakableSpec } from "@/lib/blog-schema"
import { SITE_URL } from "@/lib/author"
import { DELIVERY_CITIES } from "@/lib/commercial-facts"

// Contenido generado desde `price_index` con unstable_cache (tag
// "price-index"). Sin cookies()/headers(): la ruta se cachea y se refresca
// por ISR, no se renderiza en cada request.
export const dynamic = "force-static"
export const revalidate = 3600

const PAGE_URL = `${SITE_URL}/precios`
const CSV_URL = `${PAGE_URL}/indice-precios.csv`
const PAGE_TITLE = "Índice de precios de insumos para restaurantes en México — Resurte.me"
const PAGE_DESCRIPTION =
  "Cuánto cuesta el kilo de jitomate, la caja de aguacate o el litro de aceite para un restaurante en México: precios de referencia por ciudad, con fecha, unidad y metodología."

/** Insumos que se listan en la tabla del índice. */
const TOP_INSUMOS = 40

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    siteName: "Resurte.me",
    locale: "es_MX",
  },
}

export default async function PreciosPage() {
  const snapshot = await getPriceIndex()
  const insumos = summarizeInsumos(snapshot.points)
  const ciudades = summarizeCiudades(snapshot.points)
  const top = insumos.slice(0, TOP_INSUMOS)

  const todosLosPrecios = snapshot.points.map((p) => p.precio)
  const precioMin = todosLosPrecios.length ? Math.min(...todosLosPrecios) : null
  const precioMax = todosLosPrecios.length ? Math.max(...todosLosPrecios) : null

  const datasetSchema = getDatasetSchema({
    name: "Índice de precios de insumos para restaurantes en México",
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    dateModified: snapshot.actualizadoEn ?? undefined,
    datePublished: snapshot.fecha ?? undefined,
    temporalCoverage: snapshot.fecha ? `${snapshot.fecha}/..` : undefined,
    spatialCoverage: "México",
    measurementTechnique:
      "Mediana del precio de venta entre las tiendas activas que sirven cada ciudad; si no hay dispersión entre tiendas se publica el precio de catálogo. Los precios se agregan desde el catálogo público de Resurte.me, nunca se editan a mano.",
    keywords: [
      "precio de insumos para restaurantes",
      "mayoreo",
      "food cost",
      "central de abastos",
      "México",
    ],
    variables: [
      { name: "insumo", description: "Nombre del producto del catálogo." },
      { name: "unidad", description: "Presentación en la que se vende el insumo." },
      { name: "precio", description: "Precio de referencia publicado.", unitText: "MXN" },
      {
        name: "precio_min",
        description: "Precio de referencia más bajo entre ciudades.",
        unitText: "MXN",
      },
      {
        name: "precio_max",
        description: "Precio de referencia más alto entre ciudades.",
        unitText: "MXN",
      },
      {
        name: "muestra",
        description: "Número de tiendas con precio para ese insumo y ciudad.",
      },
      { name: "ciudad", description: "Ciudad a la que corresponde el precio." },
      { name: "fecha", description: "Semana del snapshot (lunes de la semana ISO)." },
    ],
    distributions: [
      {
        url: CSV_URL,
        format: "text/csv",
        name: "Índice de precios completo (CSV)",
        description:
          "Todos los insumos publicados, por ciudad y semana, con precio de referencia, rango, número de tiendas y fecha.",
      },
      {
        url: `${SITE_URL}/api/feed/precios.json`,
        format: "application/json",
        name: "Índice de precios (JSON para agentes)",
        description: "Mismo dato en JSON estable, pensado para asistentes y agentes de IA.",
      },
    ],
  })

  const listSchema = getItemListSchema(
    "Precios de insumos para restaurantes por insumo",
    PAGE_URL,
    top.map((i) => ({
      name: `${i.insumo} — precio por ${i.unidad ?? "unidad"}`,
      url: `${PAGE_URL}/${i.insumoSlug}`,
      description: `${formatPrecio(i.precio)} por ${i.unidad ?? "unidad"} en ${i.ciudades} ${i.ciudades === 1 ? "ciudad" : "ciudades"}.`,
    })),
    "Product"
  )

  const jsonLd = [
    datasetSchema,
    listSchema,
    {
      "@type": "WebPage",
      "@id": `${PAGE_URL}#page`,
      url: PAGE_URL,
      name: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      inLanguage: "es-MX",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${PAGE_URL}#dataset` },
      speakable: getSpeakableSpec(["#respuesta-rapida", "#metodologia"]),
    },
    getBreadcrumbSchema([
      { name: "Inicio", url: SITE_URL },
      { name: "Índice de precios", url: PAGE_URL },
    ]),
  ]

  const hayDatos = snapshot.status === "ok" && insumos.length > 0

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd.filter(Boolean)) }}
      />

      <section className="bg-gradient-to-b from-[#F0F7F0] to-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-[#0E7A0E]/20 text-[#0E7A0E] text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
            <TrendingUp className="w-4 h-4" />
            {hayDatos && snapshot.fecha
              ? `Semana del ${formatFecha(snapshot.fecha)}`
              : "Índice de precios"}
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#242529] mb-4">
            Cuánto cuestan los insumos para un{" "}
            <span className="text-[#0E7A0E]">restaurante en México</span>
          </h1>
          <p className="text-lg text-[#5C6068]">
            Precios de referencia por insumo, unidad y ciudad, publicados con
            fecha y metodología. El mismo dato que ves aquí es el que vendemos,
            medido entre las tiendas que abastecen cada ciudad.
          </p>
        </div>
      </section>

      {/* Respuesta rápida: el bloque autocontenido que citan los motores de respuesta */}
      <section className="max-w-3xl mx-auto px-4 pb-10">
        <div
          id="respuesta-rapida"
          className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[16px] p-6"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#0E7A0E] mb-2">
            Respuesta rápida
          </h2>
          {hayDatos ? (
            <p className="text-[#242529] leading-relaxed">
              En la semana del {snapshot.fecha ? formatFecha(snapshot.fecha) : ""}{" "}
              Resurte.me publica precios de referencia de {insumos.length}{" "}
              {insumos.length === 1 ? "insumo" : "insumos"} para restaurantes en{" "}
              {ciudades.length} {ciudades.length === 1 ? "ciudad" : "ciudades"} de
              México. El rango de precios de referencia va de{" "}
              {precioMin !== null ? formatPrecio(precioMin) : ""} a{" "}
              {precioMax !== null ? formatPrecio(precioMax) : ""} por unidad, según
              el insumo. Cada precio es la mediana entre las tiendas activas que
              sirven esa ciudad; cuando un insumo solo tiene un precio observado, la
              tabla lo declara en la columna «muestra» para que no se lea como
              promedio de mercado.
            </p>
          ) : (
            <p className="text-[#242529] leading-relaxed">
              Estamos publicando el primer corte del índice de precios: precios de
              referencia de insumos para restaurantes en México, por ciudad, con
              fecha, unidad y número de tiendas observadas. Mientras el primer
              snapshot se publica, puedes consultar el catálogo con precios de hoy
              en las {DELIVERY_CITIES} ciudades donde entregamos.
            </p>
          )}
        </div>
      </section>

      {/* Metodología */}
      <section className="max-w-3xl mx-auto px-4 pb-14">
        <div
          id="metodologia"
          className="border border-[#E5E7EB] rounded-[16px] p-6 scroll-mt-24"
        >
          <h2 className="text-2xl font-bold text-[#242529] mb-4">
            Cómo calculamos estos precios
          </h2>
          <dl className="space-y-4 text-[#5C6068] leading-relaxed">
            <div>
              <dt className="font-semibold text-[#242529]">Fuente</dt>
              <dd>
                Los precios salen del catálogo público de Resurte.me, el mismo que
                usan los clientes al comprar. No hay una lista paralela ni precios
                capturados a mano: si el catálogo cambia, el índice cambia en el
                siguiente corte.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[#242529]">Agregación</dt>
              <dd>
                Para cada insumo y ciudad publicamos la <strong>mediana</strong> de
                las tiendas activas que sirven esa ciudad. La mediana evita que un
                precio atípico mueva la cifra publicada, cosa que un promedio sí
                haría.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[#242529]">Columna «muestra»</dt>
              <dd>
                Es el número de tiendas con precio para ese insumo en esa ciudad.
                Una muestra de 1 significa un solo punto de precio: la página lo
                declara porque un dato único no es un promedio de mercado.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[#242529]">Frecuencia</dt>
              <dd>
                El índice se recalcula a diario y se congela por semana ISO. Cada
                semana queda un punto nuevo en la serie histórica, y el punto de la
                semana en curso se actualiza con los precios del día.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[#242529]">Qué no es</dt>
              <dd>
                No es una cotización: el precio final depende de la cantidad, la
                ciudad y la tienda que surta el pedido. Es un precio de referencia
                para comparar, costear un menú y detectar cuándo subió un insumo.
              </dd>
            </div>
          </dl>

          {hayDatos && snapshot.actualizadoEn && (
            <p className="mt-5 text-sm text-[#5C6068]">
              Último recálculo: {formatFecha(snapshot.actualizadoEn.slice(0, 10))}.
              Descarga el dato completo en{" "}
              <a
                href={CSV_URL}
                className="font-semibold text-[#0E7A0E] underline decoration-[#0E7A0E]/30 hover:decoration-[#0E7A0E]"
              >
                CSV
              </a>{" "}
              o consúltalo en{" "}
              <a
                href={`${SITE_URL}/api/feed/precios.json`}
                className="font-semibold text-[#0E7A0E] underline decoration-[#0E7A0E]/30 hover:decoration-[#0E7A0E]"
              >
                JSON
              </a>
              .
            </p>
          )}
        </div>
      </section>

      {/* Tabla de insumos */}
      {top.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 pb-14">
          <h2 className="text-2xl font-bold text-[#242529] mb-4">
            Precios de referencia por insumo
          </h2>
          <div className="overflow-x-auto border border-[#E5E7EB] rounded-[16px]">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Precios de referencia de insumos para restaurantes en México, por
                insumo, con unidad, rango entre ciudades y número de tiendas
                observadas.
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
                    Rango entre ciudades
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Ciudades
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {top.map((insumo) => (
                  <tr key={insumo.insumoSlug}>
                    <th scope="row" className="px-4 py-3 font-medium">
                      <Link
                        href={`/precios/${insumo.insumoSlug}`}
                        className="text-[#0E7A0E] hover:text-[#0D720D] hover:underline"
                      >
                        {insumo.insumo}
                      </Link>
                    </th>
                    <td className="px-4 py-3 text-[#5C6068]">{insumo.unidad ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold text-[#242529]">
                      {formatPrecio(insumo.precio)}
                    </td>
                    <td className="px-4 py-3 text-[#5C6068]">
                      {insumo.precioMin === insumo.precioMax
                        ? "—"
                        : `${formatPrecio(insumo.precioMin)} – ${formatPrecio(insumo.precioMax)}`}
                    </td>
                    <td className="px-4 py-3 text-[#5C6068]">{insumo.ciudades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-[#5C6068]">
            {describeMuestra(insumos[0]?.muestra ?? 0)} Mostrando {top.length} de{" "}
            {insumos.length} insumos publicados.
          </p>
        </section>
      )}

      {/* Ciudades */}
      {ciudades.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 pb-14">
          <h2 className="text-2xl font-bold text-[#242529] mb-4">Precios por ciudad</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ciudades.map((ciudad) => (
              <li key={ciudad.ciudadSlug}>
                <Link
                  href={`/precios/ciudad/${ciudad.ciudadSlug}`}
                  className="flex items-center justify-between border border-[#E5E7EB] rounded-[12px] px-4 py-3 hover:border-[#0E7A0E] transition-colors"
                >
                  <span className="font-medium text-[#242529]">{ciudad.ciudad}</span>
                  <span className="text-sm text-[#5C6068]">
                    {ciudad.insumos} {ciudad.insumos === 1 ? "insumo" : "insumos"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Lectura relacionada */}
      <section className="max-w-3xl mx-auto px-4 pb-20">
        <h2 className="text-2xl font-bold text-[#242529] mb-4">
          Cómo usar estos precios
        </h2>
        <ul className="space-y-3">
          <li>
            <Link
              href="/blog/categoria/costos"
              className="inline-flex items-center gap-2 font-semibold text-[#0E7A0E] hover:text-[#0D720D]"
            >
              Guías de costos y rentabilidad para restaurantes
              <ArrowRight className="w-4 h-4" />
            </Link>
          </li>
          <li>
            <Link
              href="/blog/categoria/proveeduria"
              className="inline-flex items-center gap-2 font-semibold text-[#0E7A0E] hover:text-[#0D720D]"
            >
              Guías de proveeduría y compras por mayoreo
              <ArrowRight className="w-4 h-4" />
            </Link>
          </li>
          <li>
            <Link
              href="/preguntas"
              className="inline-flex items-center gap-2 font-semibold text-[#0E7A0E] hover:text-[#0D720D]"
            >
              Preguntas de restauranteros, respondidas
              <ArrowRight className="w-4 h-4" />
            </Link>
          </li>
        </ul>
      </section>
    </div>
  )
}
