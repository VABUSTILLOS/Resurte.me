import { Clock, CalendarDays, UserRound } from "lucide-react"
import type { BlogPostMeta } from "@/lib/blog"

interface BlogAuthorProps {
  post: BlogPostMeta
}

export function BlogAuthor({ post }: BlogAuthorProps) {
  const published = new Date(post.date).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const updated = post.updatedAt
    ? new Date(post.updatedAt).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-y border-warm-200 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-warm-900">{post.author}</p>
          {post.authorRole && (
            <p className="text-xs text-warm-500">{post.authorRole}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-warm-500">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {published}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {post.readingTime} min de lectura
        </span>
      </div>
      {updated && updated !== published && (
        <p className="w-full text-xs text-warm-400">
          Última actualización: {updated}
        </p>
      )}
    </div>
  )
}
