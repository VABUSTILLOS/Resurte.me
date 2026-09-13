/**
 * Fase 7 — Skeleton de carga del dashboard admin (sustituye al spinner
 * genérico): respeta el layout final y evita saltos de contenido (CLS).
 */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando dashboard" className="animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-40 rounded bg-gray-200" />
        <div className="h-4 w-64 rounded bg-gray-100" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100" />
              <div className="h-4 w-12 rounded bg-gray-100" />
            </div>
            <div className="h-7 w-20 rounded bg-gray-200" />
            <div className="h-4 w-28 rounded bg-gray-100 mt-2" />
          </div>
        ))}
      </div>

      {/* Alertas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-gray-100" />
        ))}
      </div>

      {/* Gráficas */}
      <div className="h-72 rounded-xl bg-gray-100 mb-8" />

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-5 w-36 rounded bg-gray-200" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-5 py-3.5 border-b border-gray-50">
            <div className="h-4 w-16 rounded bg-gray-100" />
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="h-4 w-24 rounded bg-gray-100" />
            <div className="h-4 w-24 rounded bg-gray-100" />
            <div className="h-4 w-16 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
