interface BreadcrumbItem {
  label: string
  href?: string
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] mb-4" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[#C7C8CD]">/</span>}
          {item.href ? (
            <a href={item.href} className="hover:text-[#0E7A0E] transition-colors">{item.label}</a>
          ) : (
            <span className="text-[#343538] font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
