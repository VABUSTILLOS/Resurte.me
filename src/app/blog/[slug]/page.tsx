import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import type { Metadata } from "next"
import { compileMDX } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"
import { rehypeHeadingAnchors } from "@/lib/rehype-heading-anchors"
import { extractHeadings } from "@/lib/heading-slug"
import { getPostBySlug, getPostSlugs, getPostUrl, getPostCta } from "@/lib/blog"
import {
  getBlogPostingSchema,
  getFAQSchema,
  getBlogBreadcrumbSchema,
  getHowToSchema,
  getSpeakableSpec,
} from "@/lib/blog-schema"
import { getCategory } from "@/lib/blog-categories"
import { mdxComponents } from "@/components/blog/mdx-components"
import { BlogAuthor } from "@/components/blog/blog-author"
import { BlogFAQ } from "@/components/blog/blog-faq"
import { PostCTA } from "@/components/blog/post-cta"
import { RelatedPosts } from "@/components/blog/related-posts"
import { ReadingProgress } from "@/components/blog/reading-progress"
import { ArticleToc, type TocHeading } from "@/components/blog/article-toc"
import { BlogShare } from "@/components/blog/blog-share"
import { BlogShareRail } from "@/components/blog/blog-share-rail"
import { BlogNewsletter } from "@/components/blog/blog-newsletter"
import { FuentesMetodologia } from "@/components/seo/fuentes-metodologia"

export const dynamicParams = false

// Categorías cuyo contenido se apoya en el índice de precios publicado.
const PRICE_INDEX_CATEGORIES = new Set(["costos", "proveeduria"])

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

  const { content } = await compileMDX({
    source: post.content,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        // Da `id` a cada H2–H4. Los ids deben coincidir con los de
        // extractHeadings() — lo verifica src/lib/heading-slug.test.ts.
        rehypePlugins: [rehypeHeadingAnchors],
      },
    },
    components: mdxComponents,
  })

  const category = getCategory(post.data.category)
  const quickAnswer = post.data.respuestaRapida?.trim() || null
  const faqSchema = getFAQSchema(post.data.faq ?? [])
  const howToSchema =
    post.data.contentType === "tutorial"
      ? getHowToSchema(post.data, post.content)
      : null
  const esPiezaConCifras = PRICE_INDEX_CATEGORIES.has(post.data.category)

  // Índice del artículo: solo H2/H3 (el H4 ensucia más de lo que ayuda) y
  // solo si hay secciones suficientes para que valga la pena.
  const headings = extractHeadings(post.content)
  const h2Count = headings.filter((heading) => heading.level === 2).length
  const tocHeadings: TocHeading[] =
    h2Count >= 3
      ? headings
          .filter(
            (heading): heading is TocHeading =>
              heading.level === 2 || heading.level === 3
          )
          .map((heading) => ({
            text: heading.text,
            id: heading.id,
            level: heading.level,
          }))
      : []
  const jsonLd = [
    // `speakable` va dentro del BlogPosting: es donde el vocabulario lo
    // define, y apunta a fragmentos que existen en el HTML de esta página.
    {
      ...getBlogPostingSchema(post.data),
      speakable: getSpeakableSpec([
        "#respuesta-rapida",
        "#resumen-articulo",
        "#contenido-articulo h2",
        ...(esPiezaConCifras ? ["#fuentes-y-metodologia"] : []),
      ]),
    },
    getBlogBreadcrumbSchema("post", post.data.title),
    ...(howToSchema ? [howToSchema] : []),
    ...(faqSchema ? [faqSchema] : []),
  ]

  return (
    <article className="bg-white">
      <ReadingProgress />
      <BlogShareRail title={post.data.title} url={getPostUrl(slug)} />
      <script
        type="application/ld+json"
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
        {/*
          Respuesta rápida: pasaje autocontenido de ≤50 palabras pensado para
          que un motor de IA lo cite sin necesitar el resto del artículo.
          Va antes que la descripción para que sea lo primero que se lee.
        */}
        {quickAnswer && quickAnswer !== post.data.description.trim() && (
          <div
            id="respuesta-rapida"
            className="mt-6 rounded-2xl border border-brand-200 bg-brand-50 p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Respuesta rápida
            </p>
            <p className="mt-2 text-lg font-medium leading-relaxed text-warm-900">
              {quickAnswer}
            </p>
          </div>
        )}
        <p id="resumen-articulo" className="mt-4 text-lg leading-relaxed text-warm-600">
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
            sizes="(max-width: 768px) 100vw, 896px"
            className="aspect-[16/9] h-auto w-full rounded-2xl border border-warm-200 object-cover"
            priority
          />
        </div>
      )}

      {/* Índice del artículo (scroll-spy) */}
      {tocHeadings.length > 0 && <ArticleToc headings={tocHeadings} />}

      {/* Contenido MDX */}
      <div id="contenido-articulo" className="mx-auto max-w-3xl px-4 pb-4 sm:px-6">
        {content}
      </div>

      {/* FAQ desde frontmatter */}
      {post.data.faq && post.data.faq.length > 0 && (
        <div className="mx-auto max-w-3xl px-4 pb-4 sm:px-6">
          <BlogFAQ items={post.data.faq} />
        </div>
      )}

      {/* Fuentes y metodología: procedencia de las cifras citadas */}
      {esPiezaConCifras && (
        <div className="mx-auto max-w-3xl px-4 pb-4 sm:px-6">
          <FuentesMetodologia subject={post.data.title} />
        </div>
      )}

      {/* Índice de precios: enlaza el dato propio desde el contenido de costos y compras */}
      {esPiezaConCifras && (
        <div className="mx-auto max-w-3xl px-4 pb-8 sm:px-6">
          <Link
            href="/precios"
            className="block rounded-[16px] border border-gray-200 p-6 transition-colors hover:border-brand-600"
          >
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-gray-900">
              Índice de precios de insumos
              <span className="text-brand-600">&rarr;</span>
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              Consulta el precio de referencia de cada insumo por unidad y ciudad en México,
              con fecha de corte, rango observado y número de tiendas comparadas.
            </p>
          </Link>
        </div>
      )}

      {/* Newsletter signup */}
      <div className="mx-auto max-w-3xl px-4 pb-8 sm:px-6">
        <BlogNewsletter />
      </div>      {/* Caja CTA de cierre */}
      <PostCTA config={getPostCta(post.data)} />

      {/* Posts relacionados */}
      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <RelatedPosts slug={slug} />
      </div>
    </article>
  )
}
