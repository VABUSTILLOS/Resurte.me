import Link from "next/link"
import Image from "next/image"
import { Clock, ArrowUpRight, Star } from "lucide-react"
import { formatPostDate } from "@/lib/blog-format"
import type { BlogPostMeta } from "@/lib/blog"
import { getCategory } from "@/lib/blog-categories"

interface FeaturedBlogCardProps {
  post: BlogPostMeta
  size?: "large" | "compact"
  priority?: boolean
  className?: string
}

export function FeaturedBlogCard({
  post,
  size = "compact",
  priority = false,
  className = "",
}: FeaturedBlogCardProps) {
  const category = getCategory(post.category)
  const large = size === "large"

  return (
    <Link
      href={`/blog/${post.slug}`}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-warm-200 bg-white shadow-sm transition-shadow hover:shadow-md ${
        large ? "lg:flex-row" : ""
      } ${className}`}
    >
      <div
        className={`relative w-full overflow-hidden bg-cream-100 ${
          large ? "aspect-[16/9] lg:aspect-auto lg:h-full lg:w-1/2" : "aspect-[16/9]"
        }`}
      >
        {post.coverImage ? (
          <Image
            src={post.coverImage}
            alt={post.coverAlt ?? post.title}
            fill
            sizes={
              large
                ? "(max-width: 1024px) 100vw, 50vw"
                : "(max-width: 1024px) 100vw, 33vw"
            }
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            priority={priority}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">
            {category.emoji}
          </div>
        )}
        {/* Badge Destacado */}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand-500/95 px-3 py-1 text-xs font-bold text-white shadow-sm backdrop-blur">
          <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          Destacado
        </span>
      </div>
      <div
        className={`flex flex-1 flex-col ${
          large ? "justify-center p-6 lg:p-8" : "p-6"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
            {category.emoji} {category.label}
          </span>
        </div>
        <h3
          className={`mt-3 font-bold leading-snug text-warm-900 group-hover:text-brand-600 ${
            large ? "text-xl sm:text-2xl lg:text-3xl" : "text-base"
          }`}
        >
          {post.title}
        </h3>
        <p
          className={`mt-2 text-sm text-warm-600 ${
            large ? "line-clamp-3" : "line-clamp-2"
          }`}
        >
          {post.description}
        </p>
        <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-[var(--text-secondary)]">
          <span>
            {formatPostDate(post.date)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {post.readingTime} min
          </span>
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-600">
            Leer <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  )
}
