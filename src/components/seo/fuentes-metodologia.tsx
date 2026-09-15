import Link from "next/link"
import { DELIVERY_CITIES, FREE_SHIPPING_MXN, formatMxn, MIN_ORDER_MXN } from "@/lib/commercial-facts"

interface FuentesMetodologiaProps {
  /** Tema del artículo, para que la sección se lea autocontenida. */
  subject?: string
  className?: string
}

const ACTUALIZACION =
  "Los precios del catálogo se recalculan a diario y el índice de precios se congela por semana ISO. Cada artículo muestra su fecha de publicación y su última actualización."

const ALCANCE =
  "Los precios son de referencia, no una cotización: el precio final depende de la cantidad, la ciudad y la tienda que surta el pedido."

/**
 * Sección de procedencia de datos para piezas con cifras (costos, proveeduría).
 * Los motores de respuesta citan antes un número con fuente declarada que un
 * número suelto, así que esta sección se sirve siempre en HTML estático.
 */
export function FuentesMetodologia({
  subject,
  className,
}: FuentesMetodologiaProps) {
  return (
    <section
      id="fuentes-y-metodologia"
      aria-labelledby="fuentes-y-metodologia-titulo"
      className={className}
    >
      <div className="rounded-[16px] border border-[#E5E7EB] bg-[#F9FAFB] p-6">
        <h2
          id="fuentes-y-metodologia-titulo"
          className="text-lg font-semibold text-[#242529]"
        >
          {subject
            ? `Fuentes y metodología: ${subject}`
            : "Fuentes y metodología"}
        </h2>

        <dl className="mt-4 space-y-3 text-sm leading-relaxed text-[#5C6068]">
          <div>
            <dt className="font-semibold text-[#242529]">
              Fuente de los precios
            </dt>
            <dd>
              Precios de catálogo de Resurte.me, la central de abastos digital de
              insumos para restaurantes en México. Son los mismos precios que ve
              un cliente al comprar, no una lista paralela ni cifras capturadas a
              mano. Puedes descargar el detalle en el{" "}
              <Link
                href="/precios"
                className="font-medium text-[#0E7A0E] underline underline-offset-2"
              >
                índice de precios de insumos
              </Link>
              .
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[#242529]">
              Cómo se calculan las cifras
            </dt>
            <dd>
              Cuando citamos un precio de referencia es la mediana de las tiendas
              activas que surten esa ciudad para ese insumo, publicada con fecha
              de corte, rango observado y número de tiendas comparadas. La mediana
              evita que un precio atípico mueva la cifra, cosa que un promedio sí
              haría.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[#242529]">Condiciones vigentes</dt>
            <dd>
              Pedido mínimo de {formatMxn(MIN_ORDER_MXN)}, envío gratis desde{" "}
              {formatMxn(FREE_SHIPPING_MXN)} y entrega en {DELIVERY_CITIES} ciudades de México.
              Sin membresía ni suscripción.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[#242529]">Actualización</dt>
            <dd>{ACTUALIZACION}</dd>
          </div>
          <div>
            <dt className="font-semibold text-[#242529]">Alcance</dt>
            <dd>{ALCANCE}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
