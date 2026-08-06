import { AlertCircle, Lightbulb, Info } from "lucide-react"

/**
 * Callout informativo embebible en posts MDX.
 * Variantes: tip | note | warning
 */
interface BlogCalloutProps {
  variant?: "tip" | "note" | "warning"
  title?: string
  children?: React.ReactNode
}

const STYLES = {
  tip: {
    icon: Lightbulb,
    box: "border-amber-200 bg-amber-50",
    iconColor: "text-amber-600",
    title: "text-amber-900",
    body: "text-amber-800",
  },
  note: {
    icon: Info,
    box: "border-blue-200 bg-blue-50",
    iconColor: "text-blue-600",
    title: "text-blue-900",
    body: "text-blue-800",
  },
  warning: {
    icon: AlertCircle,
    box: "border-red-200 bg-red-50",
    iconColor: "text-red-600",
    title: "text-red-900",
    body: "text-red-800",
  },
} as const

const DEFAULT_TITLE: Record<string, string> = {
  tip: "Tip profesional",
  note: "Nota",
  warning: "Ojo aquí",
}

export function BlogCallout({
  variant = "tip",
  title,
  children,
}: BlogCalloutProps) {
  const style = STYLES[variant]
  const Icon = style.icon
  const resolvedTitle = title ?? DEFAULT_TITLE[variant]

  return (
    <div className={`my-6 flex gap-3 rounded-xl border p-5 ${style.box}`}>
      <span className="mt-0.5 shrink-0">
        <Icon className={`h-5 w-5 ${style.iconColor}`} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        {resolvedTitle && (
          <p className={`text-sm font-bold ${style.title}`}>{resolvedTitle}</p>
        )}
        <div className={`mt-1 text-sm leading-relaxed ${style.body}`}>
          {children}
        </div>
      </div>
    </div>
  )
}
