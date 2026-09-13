import Link from "next/link"
import Image from "next/image"
import { Clock, ArrowUpRight } from "lucide-react"
import { formatPostDate } from "@/lib/blog-format"
import type { BlogPostMeta } from "@/lib/blog"
import { getCategory } from "@/lib/blog-categories"

interface BlogCardProps {
  post: BlogPostMeta
  priority?: boolean
}

export function BlogCard({ post, priority = false }: BlogCardProps) {
  const category = getCategory(post.category)
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-warm-200 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-cream-100">
        {post.coverImage ? (
          <Image
            src={post.coverImage}
            alt={post.coverAlt ?? post.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            priority={priority}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">
            {category.emoji}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
            {category.emoji} {category.label}
          </span>
        </div>
        <h3 className="mt-3 text-base font-bold leading-snug text-warm-900 group-hover:text-brand-600">
          {post.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-warm-600">
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
