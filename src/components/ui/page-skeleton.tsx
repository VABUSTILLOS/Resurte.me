import { cn } from "@/lib/utils"

export function PageSkeleton({
  titleWidth = "w-40",
  cards = 3,
  className,
  noHeader = false,
}: {
  titleWidth?: string
  cards?: number
  className?: string
  noHeader?: boolean
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("max-w-2xl mx-auto px-4 sm:px-6 py-8", className)}
    >
      <span className="sr-only">Cargando...</span>
      {!noHeader && (
        /* Header row with back-arrow placeholder */
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-lg bg-gray-200 animate-pulse" aria-hidden="true" />
          <div className="space-y-2">
            <div className={cn("h-5 bg-gray-200 rounded animate-pulse", titleWidth)} aria-hidden="true" />
            <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" aria-hidden="true" />
          </div>
        </div>
      )}
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="h-28 bg-gray-100 rounded-2xl animate-pulse mb-4"
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
