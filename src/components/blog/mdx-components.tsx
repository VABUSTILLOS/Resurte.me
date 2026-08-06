import type { ComponentPropsWithoutRef } from "react"
import { BlogCTA } from "./blog-cta"
import { BlogCallout } from "./blog-callout"

/**
 * Componentes de estilizado para el contenido MDX de los posts.
 * Se pasa al `components` de compileMDX para darle el branding del sitio
 * a headings, tablas, listas, citas, código y elementos embebibles.
 */
const Heading = (
  level: 2 | 3 | 4,
  base: string
) => {
  const Tag = `h${level}` as "h2"
  return function MdxHeading(props: ComponentPropsWithoutRef<"h2">) {
    return <Tag className={base} {...props} />
  }
}

export const mdxComponents = {
  h2: Heading(2, "mt-10 mb-4 text-2xl font-bold tracking-tight text-warm-900 sm:text-3xl"),
  h3: Heading(3, "mt-8 mb-3 text-xl font-bold tracking-tight text-warm-900"),
  h4: Heading(4, "mt-6 mb-2 text-lg font-bold tracking-tight text-warm-900"),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="my-4 text-base leading-relaxed text-warm-700 sm:text-lg" {...props} />
  ),
  a: (props: ComponentPropsWithoutRef<"a">) => {
    const external = props.href?.startsWith("http")
    return (
      <a
        className="font-semibold text-brand-600 underline decoration-brand-300 underline-offset-2 hover:text-brand-700"
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        {...props}
      />
    )
  },
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul className="my-4 list-disc space-y-2 pl-6 text-warm-700 marker:text-brand-400" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol className="my-4 list-decimal space-y-2 pl-6 text-warm-700 marker:text-brand-500" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => (
    <li className="leading-relaxed" {...props} />
  ),
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-bold text-warm-900" {...props} />
  ),
  em: (props: ComponentPropsWithoutRef<"em">) => (
    <em className="italic text-warm-800" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="my-6 border-l-4 border-brand-400 bg-brand-50/60 px-5 py-3 text-warm-700 italic"
      {...props}
    />
  ),
  hr: (props: ComponentPropsWithoutRef<"hr">) => (
    <hr className="my-10 border-warm-200" {...props} />
  ),
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-warm-200">
      <table className="w-full min-w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: (props: ComponentPropsWithoutRef<"thead">) => (
    <thead className="bg-cream-100" {...props} />
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th
      className="border-b border-warm-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-warm-600"
      {...props}
    />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td className="border-b border-warm-100 px-4 py-3 align-top text-warm-700" {...props} />
  ),
  code: (props: ComponentPropsWithoutRef<"code">) => (
    <code
      className="rounded bg-cream-100 px-1.5 py-0.5 font-mono text-sm text-brand-700"
      {...props}
    />
  ),
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="my-6 overflow-x-auto rounded-xl bg-warm-900 p-5 font-mono text-sm leading-relaxed text-cream-100"
      {...props}
    />
  ),
  BlogCTA,
  BlogCallout,
}
