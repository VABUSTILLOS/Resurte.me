import { Search } from "lucide-react"

interface BlogHeroProps {
  title: string
  subtitle: string
}

export function BlogHero({ title, subtitle }: BlogHeroProps) {
  return (
    <section className="relative overflow-hidden bg-cream-50 py-14 sm:py-20">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-100/60 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-amber-100/60 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-4 py-1.5 text-xs font-semibold text-brand-600 shadow-sm">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Recursos para tu restaurante
        </span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-warm-900 sm:text-5xl">
          {title}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-warm-600 sm:text-lg">
          {subtitle}
        </p>
      </div>
    </section>
  )
}
