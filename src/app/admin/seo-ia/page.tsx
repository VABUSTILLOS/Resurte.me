import Link from "next/link"
import { AI_CRAWLERS } from "@/lib/ai-crawlers"
import { AI_ENGINES } from "@/lib/ai-referrers"
import { getGeoInventory } from "@/lib/geo-assets"
import { GEO_ENGINES, GEO_PANEL_FIELDS } from "@/lib/geo-queries"
import { getGeoPanelMonth } from "./actions"
import { GeoPanelForm } from "./panel-form"

const FAMILY_LABEL: Record<string, string> = {
  respuesta: "Responde y cita",
  entrenamiento: "Entrena e indexa",
  plataforma: "Plataforma",
}

const FAMILY_STYLE: Record<string, string> = {
  respuesta: "bg-green-50 text-green-700 border-green-200",
  entrenamiento: "bg-gray-100 text-gray-600 border-gray-200",
  plataforma: "bg-blue-50 text-blue-700 border-blue-200",
}

/**
 * Panel de visibilidad en IA.
 *
 * Responde tres preguntas concretas: qué puede citar un motor hoy, quién puede
 * leerlo, y qué estamos midiendo. El panel de prompts es una hoja de trabajo:
 * se corre cada mes y se anota en cada celda si hubo cita.
 */
export default async function AdminSeoIaPage() {
  const [inv, panelData] = await Promise.all([getGeoInventory(), getGeoPanelMonth()])

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Visibilidad en IA</h1>
        <p className="text-sm text-gray-500 mt-1">
          Qué puede citar un asistente de Resurte.me, quién puede leerlo y cómo se mide.
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Activos citables", value: inv.totalAssets, hint: "bloques y páginas" },
          {
            label: "Respuestas rápidas",
            value: inv.postsWithQuickAnswer,
            hint: `de ${inv.postsTotal} artículos`,
          },
          {
            label: "Crawlers de IA",
            value: inv.crawlersAllowed,
            hint: `${inv.crawlersCitable} pueden citar`,
          },
          {
            label: "Comprobaciones / mes",
            value: inv.panelChecks,
            hint: `${inv.panelQueries} preguntas × ${inv.panelEngines} motores`,
          },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{kpi.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{kpi.hint}</p>
          </div>
        ))}
      </div>

      {/* Inventario */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Activos citables</h2>
        <p className="text-sm text-gray-500 mb-4">
          Cada fila es material que un motor puede usar para responder. Si un conteo baja, se perdió
          superficie de citación.
        </p>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 font-medium">
                  <th className="px-5 py-3">Activo</th>
                  <th className="px-5 py-3">Dónde vive</th>
                  <th className="px-5 py-3">Por qué es citable</th>
                  <th className="px-5 py-3 text-right w-32">Cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inv.groups.map((g) => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{g.title}</td>
                    <td className="px-5 py-3 text-xs text-gray-500 font-mono">{g.where}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">{g.why}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-semibold text-gray-900">{g.count}</span>
                      <span className="block text-xs text-gray-400">{g.unit}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Crawlers */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Crawlers de IA permitidos</h2>
        <p className="text-sm text-gray-500 mb-4">
          Declarados en <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">robots.txt</code>.
          Los de la familia <strong>Responde y cita</strong> son los que pueden producir una cita
          visible; el resto entrena o indexa. Bloquear uno es desaparecer de esa superficie.{" "}
          <Link href="/robots.txt" className="text-brand-600 hover:underline" target="_blank">
            Ver robots.txt
          </Link>
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {AI_CRAWLERS.map((c) => (
            <div
              key={c.token}
              className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 font-mono truncate">{c.token}</p>
                <p className="text-xs text-gray-400 truncate">{c.owner}</p>
              </div>
              <span
                className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${FAMILY_STYLE[c.family]}`}
              >
                {FAMILY_LABEL[c.family]}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Referrers */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Motores que se vigilan</h2>
        <p className="text-sm text-gray-500 mb-4">
          Cuando alguien llega desde uno de estos dominios, el sitio emite el evento{" "}
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">ai_referral</code> en GA4 con el
          motor de origen. Un clic aquí significa que un motor citó a Resurte.me y alguien siguió el
          enlace: es la señal más directa de que el trabajo está funcionando. En GA4, revisa{" "}
          <strong>Informes → Interacción → Eventos → ai_referral</strong> y desglosa por la dimensión{" "}
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">ai_engine</code>.
        </p>
        <div className="flex flex-wrap gap-2">
          {AI_ENGINES.map((e) => (
            <span
              key={e.id}
              className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-1.5 text-sm"
            >
              <span className="font-medium text-gray-900">{e.label}</span>
              <span className="text-xs text-gray-400 font-mono">{e.hosts[0]}</span>
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Limitación conocida: los AI Overviews de Google no envían un referrer distinguible (llegan
          como <code className="bg-gray-100 px-1 py-0.5 rounded">google.com</code>). Esa parte solo se
          ve en Search Console.
        </p>
      </section>

      {/* Panel de prompts */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Panel de prompts mensual</h2>
        <p className="text-sm text-gray-500 mb-4">
          Se corre una vez al mes: se hace cada pregunta en cada motor y se anota si citó a
          Resurte.me. Sin esto, &laquo;aparecer en el SEO de IA&raquo; es una sensación. Con esto es
          una tasa que se puede subir.
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            Qué anotar en cada celda
          </p>
          <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
            {GEO_PANEL_FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col">
                <dt className="text-sm text-gray-900">{f.label}</dt>
                <dd className="text-xs text-gray-400">{f.values}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-wrap gap-3 mb-4 text-xs text-gray-500">
          {GEO_ENGINES.map((e) => (
            <span key={e.id} className="bg-white border border-gray-200 rounded-lg px-3 py-1.5">
              <strong className="text-gray-900">{e.label}</strong> · {e.howTo}
            </span>
          ))}
        </div>

        <GeoPanelForm initialData={panelData} />
      </section>
    </div>
  )
}
