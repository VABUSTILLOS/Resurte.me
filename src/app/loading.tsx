export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="min-h-[80vh] flex flex-col items-center justify-center bg-[#1A1A1A]"
    >
      <span className="sr-only">Cargando productos...</span>
      <div className="animate-pulse flex flex-col items-center gap-4" aria-hidden="true">
        <div className="h-4 w-48 bg-white/15 rounded" />
        <div className="h-8 w-64 bg-white/15 rounded" />
        <div className="h-4 w-56 bg-white/15 rounded" />
      </div>
    </div>
  )
}
