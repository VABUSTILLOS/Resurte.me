export default function PanelLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
      <span className="sr-only">Cargando panel de herramientas...</span>
      <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" aria-hidden="true" />
      <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" aria-hidden="true" />
      <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" aria-hidden="true" />
      <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" aria-hidden="true" />
    </div>
  )
}
