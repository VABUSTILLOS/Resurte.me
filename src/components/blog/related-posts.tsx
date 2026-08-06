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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-warm-900 sm:text-2xl">
          Sigue aprendiendo
        </h2>
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
