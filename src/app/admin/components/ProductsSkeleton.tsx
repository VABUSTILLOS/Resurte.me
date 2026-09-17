/**
 * Esqueleto de carga de `/admin/productos`.
 *
 * Sustituye al spinner de página completa: mantiene la silueta del listado
 * (título, barra de acciones, filtros y filas) para que el cambio de layout al
 * llegar los datos no provoque salto. Se usa en tres puntos: `loading.tsx` de la
 * ruta, el `fallback` del `<Suspense>` de la página y el primer fetch del
 * cliente. Todos los bloques respetan `prefers-reduced-motion`.
 */
export function ProductsSkeleton({ rows = 8 }: { rows?: number }) {
  const rowKeys = Array.from({ length: rows }, (_, i) => i)

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-6 sm:py-6"
    >
      <span className="sr-only">Cargando productos...</span>

      <div className="flex items-start justify-between gap-3 mb-4 sm:mb-5">
        <div className="space-y-2" aria-hidden="true">
          <div className="h-7 w-40 bg-gray-200 rounded animate-pulse motion-reduce:animate-none" />
          <div className="h-3 w-56 bg-gray-100 rounded animate-pulse motion-reduce:animate-none" />
        </div>
        <div className="hidden sm:flex gap-2" aria-hidden="true">
          <div className="h-9 w-28 bg-gray-200 rounded-xl animate-pulse motion-reduce:animate-none" />
          <div className="h-9 w-32 bg-gray-200 rounded-xl animate-pulse motion-reduce:animate-none" />
        </div>
      </div>

      <div
        className="flex flex-wrap gap-2 mb-3 sm:mb-4"
        aria-hidden="true"
      >
        <div className="h-10 flex-1 min-w-[12rem] bg-white border border-gray-200 rounded-xl animate-pulse motion-reduce:animate-none" />
        <div className="h-10 w-24 bg-white border border-gray-200 rounded-xl animate-pulse motion-reduce:animate-none" />
        <div className="h-10 w-24 bg-white border border-gray-200 rounded-xl animate-pulse motion-reduce:animate-none" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div
          className="hidden md:flex items-center gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100"
          aria-hidden="true"
        >
          <div className="h-3 w-4 bg-gray-200 rounded animate-pulse motion-reduce:animate-none" />
          <div className="h-3 w-48 bg-gray-200 rounded animate-pulse motion-reduce:animate-none" />
          <div className="h-3 w-20 bg-gray-200 rounded animate-pulse motion-reduce:animate-none" />
          <div className="h-3 w-16 bg-gray-200 rounded animate-pulse motion-reduce:animate-none" />
          <div className="h-3 w-16 bg-gray-200 rounded animate-pulse motion-reduce:animate-none" />
        </div>

        <div className="divide-y divide-gray-100">
          {rowKeys.map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4" aria-hidden="true">
              <div className="h-4 w-4 bg-gray-100 rounded animate-pulse motion-reduce:animate-none" />
              <div className="h-10 w-10 rounded-lg bg-gray-100 animate-pulse motion-reduce:animate-none" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/5 bg-gray-200 rounded animate-pulse motion-reduce:animate-none" />
                <div className="h-3 w-1/4 bg-gray-100 rounded animate-pulse motion-reduce:animate-none" />
              </div>
              <div className="hidden sm:block h-3 w-16 bg-gray-100 rounded animate-pulse motion-reduce:animate-none" />
              <div className="h-3 w-14 bg-gray-100 rounded animate-pulse motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
