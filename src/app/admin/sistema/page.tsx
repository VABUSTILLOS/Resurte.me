import { PlugZap, CheckCircle2, AlertTriangle } from "lucide-react"
import { getIntegrationStatuses } from "@/lib/integration-status"

/**
 * /admin/sistema — salud de las integraciones externas.
 *
 * POR QUÉ EXISTE: el admin no tenía forma de saber que el correo, WhatsApp o
 * el push estaban apagados. Peor: varios caminos de código reportaban éxito
 * sin haber enviado nada, así que la única señal era que los clientes no
 * recibían nada. Esta vista hace visible el hueco antes de que un cliente lo
 * note.
 *
 * El guard de rol vive en `src/app/admin/layout.tsx`.
 */

export const dynamic = "force-dynamic"

export default function AdminSistemaPage() {
  const integrations = getIntegrationStatuses()
  const active = integrations.filter((i) => i.configured).length
  const missing = integrations.length - active

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-gray-900 flex items-center justify-center">
          <PlugZap className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Sistema</h1>
          <p className="text-sm text-gray-500">
            Integraciones externas y qué falta para que funcionen
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 mb-6 flex items-start gap-3">
        {missing === 0 ? (
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <p className="text-sm text-gray-700">
          <strong>
            {active} de {integrations.length} integraciones activas.
          </strong>{" "}
          {missing === 0
            ? "Todas las integraciones declaradas tienen sus credenciales."
            : `${missing} no pueden operar. Mientras falte una credencial, las funciones que dependen de ella fallan y quedan registradas como fallidas en las bitácoras.`}
        </p>
      </div>

      <ul className="space-y-3">
        {integrations.map((integration) => (
          <li
            key={integration.id}
            className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <h2 className="text-sm font-semibold text-gray-900">{integration.label}</h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                  integration.configured
                    ? "bg-green-50 text-green-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {integration.configured ? (
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {integration.configured ? "Activa" : "Falta configurar"}
              </span>
            </div>

            {!integration.configured && (
              <>
                <p className="mt-2 text-sm text-gray-600">{integration.impact}</p>
                <p className="mt-3 text-xs text-gray-500">
                  Variables requeridas:{" "}
                  {integration.requires.map((name, index) => {
                    const isMissing = integration.missing.includes(name)
                    return (
                      <span key={name}>
                        {index > 0 && ", "}
                        <code
                          className={
                            isMissing
                              ? "rounded bg-red-50 px-1.5 py-0.5 font-mono text-red-700"
                              : "rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600"
                          }
                        >
                          {name}
                        </code>
                      </span>
                    )
                  })}
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
