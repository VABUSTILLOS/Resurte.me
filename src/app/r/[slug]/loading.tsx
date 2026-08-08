export default function StorefrontLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="min-h-[60vh] bg-white px-4 py-8">
      <span className="sr-only">Cargando menú del restaurante...</span>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-gray-200 rounded-full animate-pulse" aria-hidden="true" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-56 bg-gray-200 rounded animate-pulse" aria-hidden="true" />
            <div className="h-4 w-80 bg-gray-200 rounded animate-pulse" aria-hidden="true" />
          </div>
        </div>
        <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" aria-hidden="true" />
        <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" aria-hidden="true" />
        <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" aria-hidden="true" />
      </div>
    </div>
  )
}
