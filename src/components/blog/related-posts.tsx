import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getRelatedPosts } from "@/lib/blog"
import { BlogCard } from "./blog-card"

interface RelatedPostsProps {
  slug: string
  limit?: number
}

export function RelatedPosts({ slug, limit = 3 }: RelatedPostsProps) {
  const related = getRelatedPosts(slug, limit)
  if (related.length === 0) return null

  return (
    <section className="mt-14 border-t border-warm-200 pt-10">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-8 w-1 shrink-0 rounded-full bg-gradient-to-b from-brand-500 to-brand-700"
        />
        <h2 className="text-xl font-bold text-warm-900 sm:text-2xl">
          Artículos Relacionados
        </h2>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-warm-600">
          Sigue aprendiendo con los posts más relacionados a este tema.
        </p>
        <Link
          href="/blog"
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
        >
          Ver todos <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  )
}
