import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Building2,
  Calculator,
  CalendarHeart,
  Gift,
  Globe,
  Handshake,
  LayoutGrid,
  MessageCircle,
  PiggyBank,
  Plug,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  Truck,
  UtensilsCrossed,
  Wallet,
} from "lucide-react"
import { RoiCalculator } from "./roi-calculator"
import { LeadQualifier } from "./lead-qualifier"
import {
  FOODOS_FEATURE_ORDER,
  PUBLIC_TIER_LADDER,
  QUALIFYING_WEEK_MIN,
  type FoodosFeature,
  type PublicTierInfo,
} from "@/lib/foodos-entitlements"
import { getBreadcrumbSchema, getWebSiteSchema } from "@/lib/structured-data"
import { SITE_URL } from "@/lib/author"

// Landing comercial. Sin cookies()/headers(): se prerenderiza y se refresca
// por ISR. La calculadora y el calificador son islas cliente.
export const dynamic = "force-static"
export const revalidate = 3600

const PAGE_URL = `${SITE_URL}/restaurantes`
const PAGE_TITLE = "FoodOS para restaurantes: software sin mensualidad, se gana comprando"
const PAGE_DESCRIPTION =
  `Menú digital, pedidos por WhatsApp, reparto propio, marketing, lealtad y punto de venta para tu restaurante. Sin suscripción: las funciones premium se desbloquean con el nivel que ganas comprando ${formatMxn(QUALIFYING_WEEK_MIN)} a la semana.`

function formatMxn(value: number): string {
  return `$${value.toLocaleString("es-MX")}`
}

/** Cómo se llama cada capacidad hacia fuera. */
const FEATURE_COPY: Record<FoodosFeature, { label: string; description: string; icon: typeof Store }> = {
  marketing_ia: {
    label: "Marketing IA",
    description:
      "Segmenta a tus clientes por cuánto gastan y hace cuánto no vienen, y les manda la campaña que corresponde.",
    icon: Sparkles,
  },
  flotilla: {
    label: "Flotilla de reparto",
    description:
      "Asigna pedidos a tus propios repartidores, cotiza el envío con un tercero y sigue cada entrega en vivo.",
    icon: Truck,
  },
  mesero_ia: {
    label: "Mesero IA por WhatsApp",
    description:
      "Contesta el WhatsApp del restaurante, arma el pedido y lo deja listo para que tú solo lo confirmes.",
    icon: Bot,
  },
  pos_mostrador: {
    label: "Punto de venta en mostrador",
    description:
      "Cobra en el local sin depender de nadie: efectivo, tarjeta o transferencia, incluso combinados, con ticket y folio automáticos.",
    icon: ShoppingCart,
  },
  comandero: {
    label: "Comandero de mesas",
    description:
      "El mapa de tu salón con zonas y mesas como están acomodadas. Abre cuentas, manda a cocina y cobra al final.",
    icon: LayoutGrid,
  },
  wallet_passes: {
    label: "Tarjeta de lealtad en el celular",
    description:
      "Tu cliente guarda su tarjeta en Apple Wallet o Google Wallet y acumula sin instalar nada.",
    icon: Wallet,
  },
  app_marca: {
    label: "App de tu marca",
    description:
      "Tu restaurante se instala como app en el teléfono del cliente, con tu logo y tu color, sin tienda de apps.",
    icon: Smartphone,
  },
  sitio_ia: {
    label: "Sitio web y SEO local",
    description:
      "Páginas de tu menú y tu historia optimizadas para que te encuentren en búsquedas y mapas.",
    icon: Globe,
  },
  pos_integraciones: {
    label: "Conectar tu punto de venta",
    description:
      "Conecta la caja que ya usas y mantén un solo menú y un solo inventario en los dos lados.",
    icon: Plug,
  },
  catering: {
    label: "Catering por volumen",
    description:
      "Paquetes para eventos, cotización con anticipación mínima y seguimiento del anticipo hasta la entrega.",
    icon: CalendarHeart,
  },
}

const TIER_COPY: Record<string, { name: string; requirement: string; note: string }> = {
  Verde: {
    name: "Verde",
    requirement: "Desde tu primera compra",
    note: "FoodOS completo: menú digital, pedidos, cocina y clientes.",
  },
  Plata: {
    name: "Plata",
    requirement: `2 semanas de ${formatMxn(QUALIFYING_WEEK_MIN)}`,
    note: "Se abre el marketing que trabaja solo.",
  },
  Oro: {
    name: "Oro",
    requirement: `3 semanas de ${formatMxn(QUALIFYING_WEEK_MIN)}`,
    note: "Se abre la logística de reparto.",
  },
  Diamante: {
    name: "Diamante",
    requirement: `4 semanas de ${formatMxn(QUALIFYING_WEEK_MIN)}`,
    note: "Se abre todo: IA, lealtad, app, sitio, caja y catering.",
  },
}

const FAQ = [
  {
    q: "¿Cuánto cuesta FoodOS?",
    a: `Nada. No hay mensualidad ni contratos. Las funciones premium se desbloquean con el nivel que ganas comprando: cada semana que compras ${formatMxn(QUALIFYING_WEEK_MIN)} o más en Resurte.me cuenta como una semana calificada.`,
  },
  {
    q: "¿Qué pasa si un mes no compro?",
    a: "El nivel se recalcula solo con las semanas calificadas del mes en curso. Si un mes bajas de nivel, las funciones premium se vuelven a cerrar y se reabren cuando retomas el ritmo. No se te cobra ni se te penaliza.",
  },
  {
    q: "¿Pierdo lo que ya configuré si bajo de nivel?",
    a: "No. Tu menú, tus clientes, tus campañas, tus paquetes de catering y tus conexiones se conservan. Solo se cierra el acceso a la herramienta mientras no tengas el nivel; al recuperarlo, todo sigue donde lo dejaste.",
  },
  {
    q: "¿El cashback es lo mismo que las funciones premium?",
    a: "No, son dos cosas distintas. El cashback es el porcentaje que regresas a tu cliente por su compra (5, 10, 15 o 20% según tu nivel). Las funciones premium son las herramientas de software. Ambas suben con el mismo nivel, pero se usan por separado.",
  },
  {
    q: "¿Necesito instalar algo?",
    a: "No. FoodOS vive en el navegador y tu cliente no instala nada: pide desde una liga, desde el código QR de la mesa o desde el WhatsApp de siempre. La app de tu marca se instala desde el mismo sitio, sin pasar por una tienda de aplicaciones.",
  },
  {
    q: "¿Puedo probarlo antes de decidir?",
    a: "Sí. Con tu primera compra ya tienes FoodOS completo funcionando, con menú, pedidos y cocina. Si te sirve, empiezas a subir de nivel; si no, no pagaste nada por probarlo.",
  },
]

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

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"
const WHATSAPP_HREF = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Hola, tengo un restaurante y quiero saber cómo funciona FoodOS."
)}`

export default function RestaurantesPage() {
  const jsonLd = [
    getWebSiteSchema(),
    getBreadcrumbSchema([
      { name: "Inicio", url: SITE_URL },
      { name: "Para restaurantes", url: PAGE_URL },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "FoodOS",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Restaurant management",
      operatingSystem: "Web",
      url: PAGE_URL,
      description: PAGE_DESCRIPTION,
      inLanguage: "es-MX",
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: 0,
        priceCurrency: "MXN",
        description:
          "Sin mensualidad. Las funciones premium se desbloquean con el nivel de compra del restaurante.",
      },
      featureList: FOODOS_FEATURE_ORDER.map((f) => FEATURE_COPY[f].label),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ].filter(Boolean)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
        {/* ---------- Hero ---------- */}
        <section className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            Sin mensualidad · sin contrato
          </p>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-gray-900 sm:text-5xl">
            El software de tu restaurante se gana comprando, no pagando
          </h1>
          <p className="mt-4 text-base leading-relaxed text-gray-600 sm:text-lg">
            FoodOS es el sistema de tu restaurante: menú digital, pedidos por WhatsApp, cocina,
            clientes, reparto y lealtad. No cobramos suscripción. Cada semana que compras{" "}
            {formatMxn(QUALIFYING_WEEK_MIN)} o más en Resurte.me cuenta como una semana calificada,
            y las semanas acumuladas abren las funciones premium.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#diagnostico"
              className="touch-target inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Diagnóstico gratis en 30 segundos
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="touch-target inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Hablar por WhatsApp
            </a>
          </div>
        </section>

        {/* ---------- Escalón de niveles ---------- */}
        <section className="mt-14 sm:mt-20" aria-labelledby="niveles">
          <h2 id="niveles" className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Cómo subes de nivel
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-600">
            Una semana califica cuando compras {formatMxn(QUALIFYING_WEEK_MIN)} o más. Contamos las
            semanas calificadas del mes en curso. El nivel sube solo, sin trámites, y las funciones
            se abren en cuanto lo alcanzas.
          </p>

          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PUBLIC_TIER_LADDER.map((step) => (
              <TierCard key={step.tier} step={step} />
            ))}
          </ol>

          <p className="mt-4 text-xs leading-relaxed text-gray-500">
            El <strong className="font-semibold text-gray-600">cashback</strong> (lo que le regresas
            a tu cliente por su compra) y las{" "}
            <strong className="font-semibold text-gray-600">funciones de software</strong> suben con
            el mismo nivel, pero son dos ejes distintos: puedes usar todo el software sin haber
            activado el cashback.
          </p>
        </section>

        {/* ---------- Calculadora de comisión ---------- */}
        <section className="mt-14 sm:mt-20" aria-labelledby="comision">
          <h2 id="comision" className="flex items-center gap-2 text-2xl font-bold text-gray-900 sm:text-3xl">
            <Calculator className="h-6 w-6 text-brand-600" aria-hidden="true" />
            Cuánto te cuesta la comisión de las apps de delivery
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-600">
            Antes de hablar de software, veamos el número que duele. Mueve tus datos y mira cuánto
            pagas al año por vender por una app de terceros, comparado con quedarte el pedido en
            canal propio. No es una promesa de ahorro: es tu aritmética.
          </p>
          <div className="mt-6">
            <RoiCalculator />
          </div>
        </section>

        {/* ---------- Calificador ---------- */}
        <section className="mt-14 sm:mt-20" id="diagnostico" aria-labelledby="diagnostico-titulo">
          <h2
            id="diagnostico-titulo"
            className="flex items-center gap-2 text-2xl font-bold text-gray-900 sm:text-3xl"
          >
            <Handshake className="h-6 w-6 text-brand-600" aria-hidden="true" />
            Qué te conviene abrir primero
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-600">
            Cuatro preguntas y te decimos con qué herramienta empezar y qué nivel necesitas para
            tenerla. Sin registro previo.
          </p>
          <div className="mt-6">
            <LeadQualifier />
          </div>
        </section>

        {/* ---------- Todo lo que incluye ---------- */}
        <section className="mt-14 sm:mt-20" aria-labelledby="capacidades">
          <h2 id="capacidades" className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Las funciones, una por una
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FOODOS_FEATURE_ORDER.map((feature) => {
              const copy = FEATURE_COPY[feature]
              const Icon = copy.icon
              const tier = PUBLIC_TIER_LADDER.find((s) => s.features.includes(feature))
              return (
                <article
                  key={feature}
                  className="rounded-2xl border border-gray-200 bg-white p-5"
                >
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
                    {tier && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                        Nivel {TIER_COPY[tier.tier]?.name ?? tier.tier}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-gray-900">{copy.label}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{copy.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        {/* ---------- Lo que siempre es gratis ---------- */}
        <section className="mt-14 sm:mt-20" aria-labelledby="base">
          <h2 id="base" className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Desde tu primera compra, sin nivel
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: UtensilsCrossed,
                title: "Menú digital y QR",
                body: "Tu carta con fotos, precios y modificadores, lista para compartir por liga o QR en la mesa.",
              },
              {
                icon: Store,
                title: "Pedidos y cocina",
                body: "Los pedidos entran a un tablero y a una pantalla de cocina, con estados y tiempos.",
              },
              {
                icon: Gift,
                title: "Clientes y cupones",
                body: "Historial de quién te compra, cuánto y cada cuándo, más cupones para hacerlos volver.",
              },
            ].map((item) => (
              <article key={item.title} className="rounded-2xl border border-gray-200 bg-white p-5">
                <item.icon className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                <h3 className="mt-3 text-base font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="mt-14 sm:mt-20" aria-labelledby="faq">
          <h2 id="faq" className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Preguntas frecuentes
          </h2>
          <div className="mt-6 space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-gray-200 bg-white p-4 open:bg-gray-50"
              >
                <summary className="cursor-pointer list-none text-sm font-semibold text-gray-900 marker:hidden">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- CTA ---------- */}
        <section className="mt-14 rounded-2xl bg-gray-900 p-6 text-white sm:mt-20 sm:p-10">
          <h2 className="text-2xl font-bold sm:text-3xl">Empecemos por tu primer pedido</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-300">
            Cuéntanos cómo operas hoy y te armamos la ruta: qué abrir primero, cuánto te cuesta hoy
            la comisión y cuánto tardas en llegar al nivel que te da lo que necesitas.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="touch-target inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Escribir por WhatsApp
            </a>
            <Link
              href="/comer"
              className="touch-target inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Ver la proveeduría
            </Link>
          </div>
        </section>

        <p className="mt-8 flex items-center gap-2 text-xs text-gray-400">
          <PiggyBank className="h-4 w-4" aria-hidden="true" />
          Sin mensualidad, sin contrato y sin comisión por pedido en canal propio.
        </p>
      </div>
    </>
  )
}

function TierCard({ step }: { step: PublicTierInfo }) {
  const copy = TIER_COPY[step.tier]
  return (
    <li className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="text-lg font-bold text-gray-900">{copy?.name ?? step.tier}</h3>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-600">
        {copy?.requirement ?? `${step.weeks} semanas`}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{copy?.note}</p>

      <p className="mt-4 text-xs font-semibold text-gray-500">
        Cashback para tu cliente: {step.cashbackPct}%
      </p>

      {step.features.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {step.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-xs text-gray-700">
              <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
              {FEATURE_COPY[feature].label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-gray-400">
          Todavía sin funciones premium: el nivel base ya incluye menú, pedidos, cocina y clientes.
        </p>
      )}
    </li>
  )
}
