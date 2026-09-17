import {
  REVIEW_BADGE_HELP,
  REVIEW_SCOPE_NOTE,
  formatRatingAverage,
  ratingStars,
  reviewCountLabel,
  reviewDayLabel,
  reviewItemLabel,
  type ProductReviewStats,
} from "@/lib/product-reviews"

interface ProductReviewsProps {
  /** Agregado del producto. `undefined` cuando no tiene ninguna reseña. */
  stats?: ProductReviewStats
}

/**
 * Reseñas del producto en la ficha pública.
 *
 * No renderiza nada cuando no hay reseñas: un bloque vacío o un "sé el primero
 * en opinar" en un catálogo mayorista sin tráfico solo ocupa espacio y promete
 * algo que no existe.
 *
 * La calificación es del PEDIDO completo (entrega y atención incluidas), no del
 * producto; por eso `REVIEW_SCOPE_NOTE` se muestra siempre y no como letra
 * pequeña opcional. Presentarla como nota del producto sería afirmar algo que
 * los datos no sostienen.
 */
export function ProductReviews({ stats }: ProductReviewsProps) {
  if (!stats || stats.count < 1 || stats.recent.length === 0) return null

  const average = formatRatingAverage(stats.average)
  const shown = stats.recent.length

  return (
    <section
      className="mt-10 sm:mt-14 pt-6 sm:pt-8 border-t border-[#e0dbd2]"
      aria-labelledby="resenas-producto"
    >
      <h2
        id="resenas-producto"
        className="text-lg sm:text-xl font-bold text-[#1a1a1a] mb-5 tracking-tight"
      >
        Reseñas de clientes
      </h2>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <span className="text-3xl font-bold text-[#1a1a1a] tabular-nums">{average}</span>
        <span className="flex flex-col gap-0.5">
          <span aria-hidden="true" className="text-lg leading-none text-[#b45309]">
            {ratingStars(stats.average)}
          </span>
          <span className="sr-only">
            {average} de 5 estrellas
          </span>
          <span className="text-sm text-[#6b6b6b]">{reviewCountLabel(stats.count)}</span>
        </span>
      </div>

      <p className="text-sm text-[#6b6b6b] mb-6 max-w-prose" title={REVIEW_BADGE_HELP}>
        {REVIEW_SCOPE_NOTE}
      </p>

      <ul className="flex flex-col gap-5">
        {stats.recent.map((review, index) => {
          const dayLabel = reviewDayLabel(review.reviewedAt)
          const label = reviewItemLabel(review.rating, dayLabel)
          return (
            <li
              key={`${review.reviewedAt}-${index}`}
              className="border-l-2 border-[#e0dbd2] pl-4"
            >
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span aria-hidden="true" className="text-[#b45309]">
                  {ratingStars(review.rating)}
                </span>
                <span className="sr-only">{label}</span>
                <span aria-hidden="true" className="text-[#6b6b6b]">
                  {label}
                </span>
              </p>
              {review.comment && (
                <p className="mt-1.5 text-[15px] leading-relaxed text-[#1a1a1a] whitespace-pre-line">
                  {review.comment}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {stats.count > shown && (
        <p className="mt-5 text-sm text-[#6b6b6b]">
          Mostrando las {shown} reseñas más recientes de {stats.count}.
        </p>
      )}
    </section>
  )
}
