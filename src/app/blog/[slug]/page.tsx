import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { compileMDX } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"
import { getPostBySlug, getPostSlugs, getPostUrl, getPostCta } from "@/lib/blog"
import {
  getBlogPostingSchema,
  getFAQSchema,
  getBlogBreadcrumbSchema,
} from "@/lib/blog-schema"
import { getCategory } from "@/lib/blog-categories"
import { mdxComponents } from "@/components/blog/mdx-components"
import { BlogAuthor } from "@/components/blog/blog-author"
import { BlogFAQ } from "@/components/blog/blog-faq"
import { PostCTA } from "@/components/blog/post-cta"
import { RelatedPosts } from "@/components/blog/related-posts"
import { ReadingProgress } from "@/components/blog/reading-progress"
import { BlogShare } from "@/components/blog/blog-share"
import { BlogShareRail } from "@/components/blog/blog-share-rail"
import { BlogNewsletter } from "@/components/blog/blog-newsletter"

export const dynamicParams = false

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return { title: "Post no encontrado" }

  const { data } = post
  const url = getPostUrl(slug)
  const imageUrl = data.coverImage
    ? `https://resurte.me${data.coverImage}`
    : undefined

  return {
    title: data.title,
    description: data.description,
    alternates: { canonical: url },
    openGraph: {
      title: data.title,
      description: data.description,
      url,
      type: "article",
      locale: "es_MX",
      siteName: "Resurte.me",
      publishedTime: data.date,
      modifiedTime: data.updatedAt,
      authors: [data.author],
      tags: data.tags,
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: data.title,
      description: data.description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()
  const nonce = (await headers()).get("x-nonce")

  const { content } = await compileMDX({
    source: post.content,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
    components: mdxComponents,
  })

  const category = getCategory(post.data.category)
  const faqSchema = getFAQSchema(post.data.faq ?? [])
  const jsonLd = [
    getBlogPostingSchema(post.data),
    getBlogBreadcrumbSchema("post", post.data.title),
    ...(faqSchema ? [faqSchema] : []),
  ]

  return (
    <article className="bg-white">
      <ReadingProgress />
      <BlogShareRail title={post.data.title} url={getPostUrl(slug)} />
      <script
        type="application/ld+json"
        nonce={nonce ?? undefined}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb visual */}
      <nav
        aria-label="Ruta de navegación"
        className="mx-auto max-w-3xl px-4 pt-8 sm:px-6"
      >
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <li>
            <Link href="/" className="hover:text-brand-600">
              Inicio
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li>
            <Link href="/blog" className="hover:text-brand-600">
              Blog
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li className="line-clamp-1 max-w-[220px] text-warm-700">
            {post.data.title}
          </li>
        </ol>
      </nav>

      {/* Encabezado del post */}
      <header className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
        <Link
          href={`/blog?categoria=${category.slug}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-100"
        >
          <span aria-hidden="true">{category.emoji}</span>
          {category.label}
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-warm-900 sm:text-4xl">
          {post.data.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-warm-600">
          {post.data.description}
        </p>
        <div className="mt-6">
          <BlogAuthor post={post.data} />
        </div>
        {/* Social sharing */}
        <div className="mt-4 flex justify-end">
          <BlogShare title={post.data.title} url={getPostUrl(slug)} />
        </div>
      </header>

      {/* Portada */}
      {post.data.coverImage && (
        <div className="mx-auto mt-8 max-w-4xl px-4 sm:px-6">
          <Image
            src={post.data.coverImage}
            alt={post.data.coverAlt ?? post.data.title}
            width={1200}
            height={675}
            className="aspect-[16/9] h-auto w-full rounded-2xl border border-warm-200 object-cover"
            priority
          />
        </div>
      )}

      {/* Contenido MDX */}
      <div className="mx-auto max-w-3xl px-4 pb-4 sm:px-6">{content}</div>

      {/* FAQ desde frontmatter */}
      {post.data.faq && post.data.faq.length > 0 && (
        <div className="mx-auto max-w-3xl px-4 pb-4 sm:px-6">
          <BlogFAQ items={post.data.faq} />
        </div>
      )}

      {/* Newsletter signup */}
      <div className="mx-auto max-w-3xl px-4 pb-8 sm:px-6">
        <BlogNewsletter />
      </div>

      {/* Caja CTA de cierre */}
      <PostCTA config={getPostCta(post.data)} />

      {/* Posts relacionados */}
      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <RelatedPosts slug={slug} />
      </div>
    </article>
  )
}
