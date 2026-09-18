import { PlugZap, CheckCircle2, AlertTriangle, ShieldCheck, KeyRound } from "lucide-react"
import { getIntegrationStatuses } from "@/lib/integration-status"
import {
  findUnconvergedAdminEmails,
  getAdminAccessReport,
  getAdminEmailAllowlist,
} from "@/lib/admin-auth"

/**
 * /admin/sistema — salud de las integraciones externas y de los permisos.
 *
 * POR QUÉ EXISTE: el admin no tenía forma de saber que el correo, WhatsApp o
 * el push estaban apagados. Peor: varios caminos de código reportaban éxito
 * sin haber enviado nada, así que la única señal era que los clientes no
 * recibían nada. Esta vista hace visible el hueco antes de que un cliente lo
 * note.
 *
 * El segundo bloque hace lo mismo con el rol admin: la regla estaba escrita
 * cinco veces y un admin cuyo permiso viniera solo de ADMIN_EMAILS o de
 * `admin_users` pasaba el guard de la app pero fallaba las policies RLS, sin
 * dar error: devolvía tablas vacías. Aquí se ve de qué fuente viene cada
 * permiso y si las dos capas ya coinciden.
 *
 * El guard de rol vive en `src/app/admin/layout.tsx`, que además es quien
 * dispara la convergencia (vía resolveAdminAccess) antes de renderizar.
 */

export const dynamic = "force-dynamic"

export default async function AdminSistemaPage() {
  const integrations = getIntegrationStatuses()
  const active = integrations.filter((i) => i.configured).length
  const missing = integrations.length - active

  const allowlist = getAdminEmailAllowlist()
  const report = await getAdminAccessReport()
  const unconverged = report.error
    ? []
    : findUnconvergedAdminEmails(allowlist, report.rows)
  const rolesInconsistentes = report.rows.filter((r) => r.profileRole !== "admin")

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
          <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
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

      <section className="mt-10" aria-labelledby="permisos-heading">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-gray-900 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h2 id="permisos-heading" className="text-lg font-bold text-gray-900">
              Acceso de administradores
            </h2>
            <p className="text-sm text-gray-500">
              La fuente de verdad es <code className="font-mono text-xs">profiles.role</code>. Las
              demás vías conceden acceso y se espejan hacia ella.
            </p>
          </div>
        </div>

        {report.error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">No se pudo leer el reporte de permisos</p>
              <p className="mt-1 break-words font-mono text-xs">{report.error}</p>
              <p className="mt-2">
                El panel funciona igual; este bloque solo no puede comprobar si la app y la base de
                datos coinciden. Se necesita <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
                y la migración 00145 aplicada.
              </p>
            </div>
          </div>
        ) : (
          <>
            {unconverged.length === 0 && rolesInconsistentes.length === 0 ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 mb-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-green-900">
                  <strong>App y base de datos coinciden.</strong> Todo permiso de administrador está
                  respaldado por <code className="font-mono">profiles.role = &apos;admin&apos;</code>,
                  que es lo que leen las policies RLS.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-amber-900">
                  <strong>Hay divergencia entre la app y la base de datos.</strong> Los permisos
                  listados abajo conceden acceso al panel pero RLS todavía no los reconoce, así que
                  las tablas protegidas se verían vacías sin dar error.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mb-4">
              <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
                <KeyRound className="w-4 h-4 text-gray-500" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Variable ADMIN_EMAILS (bootstrap de emergencia)
                </h3>
              </div>
              {allowlist.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500">
                  La variable no está configurada. El acceso admin se gestiona solo desde{" "}
                  <code className="font-mono text-xs">/admin/usuarios</code>.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {allowlist.map((email) => {
                    const pendiente = unconverged.includes(email)
                    return (
                      <li
                        key={email}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                      >
                        <span className="text-sm text-gray-800">{email}</span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                            pendiente
                              ? "bg-amber-50 text-amber-700"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {pendiente ? (
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          {pendiente ? "Sin respaldo en profiles" : "Convergido"}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Administradores en la base de datos
                </h3>
              </div>
              {report.rows.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500">
                  No hay ningún administrador con <code className="font-mono text-xs">profiles.role
                  = &apos;admin&apos;</code> ni en <code className="font-mono text-xs">admin_users</code>.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th scope="col" className="px-4 py-2 font-semibold">Email</th>
                        <th scope="col" className="px-4 py-2 font-semibold">profiles.role</th>
                        <th scope="col" className="px-4 py-2 font-semibold">admin_users</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.rows.map((row) => (
                        <tr key={row.userId}>
                          <td className="px-4 py-3 text-gray-800">
                            {row.email ?? (
                              <span className="font-mono text-xs text-gray-500">{row.userId}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                                row.profileRole === "admin"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {row.profileRole === "admin" ? (
                                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                              )}
                              {row.profileRole}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {row.inAdminUsers ? "Sí" : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
