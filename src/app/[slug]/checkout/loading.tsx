export default function CheckoutLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <span className="sr-only">Cargando checkout...</span>
      <div className="h-5 w-56 bg-gray-200 rounded animate-pulse" aria-hidden="true" />
      <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" aria-hidden="true" />
      <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" aria-hidden="true" />
      <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" aria-hidden="true" />
    </div>
  )
}
