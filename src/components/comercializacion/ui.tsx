"use client"

import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost"
  size?: "sm" | "md" | "lg"
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  const sizes = {
    sm: "text-xs px-3 py-1.5",
    md: "text-sm px-4 py-2",
    lg: "text-base px-5 py-2.5",
  }
  const variants = {
    primary:
      "bg-[#0E7A0E] text-white hover:bg-[#0B630B] shadow-sm",
    secondary:
      "bg-[#0E7A0E]/10 text-[#0E7A0E] hover:bg-[#0E7A0E]/15",
    outline:
      "border border-gray-200 text-gray-700 hover:bg-gray-50 bg-white",
    danger:
      "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-gray-600 hover:bg-gray-100",
  }
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Badge({
  children,
  color = "gray",
}: {
  children: ReactNode
  color?: "green" | "amber" | "blue" | "gray" | "red" | "purple"
}) {
  const colors: Record<string, string> = {
    green: "bg-[#0E7A0E]/10 text-[#0E7A0E]",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-700",
    gray: "bg-gray-100 text-gray-600",
    red: "bg-red-100 text-red-700",
    purple: "bg-purple-100 text-purple-700",
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${colors[color]}`}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: "green" | "amber" | "blue" | "gray" | "red" | "purple"; label: string }> = {
    nuevo: { color: "blue", label: "Nuevo" },
    contactado: { color: "purple", label: "Contactado" },
    en_seguimiento: { color: "amber", label: "En seguimiento" },
    cliente_activo: { color: "green", label: "Cliente activo" },
    inactivo: { color: "gray", label: "Inactivo" },
    perdido: { color: "red", label: "Perdido" },
  }
  const s = map[status] ?? { color: "gray" as const, label: status }
  return <Badge color={s.color}>{s.label}</Badge>
}

export function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {sub ? <p className="mt-0.5 text-xs text-gray-400">{sub}</p> : null}
        </div>
        {icon ? <div className="shrink-0 text-[#0E7A0E]">{icon}</div> : null}
      </div>
    </div>
  )
}

export function SectionCard({
  title,
  action,
  children,
  className = "",
}: {
  title: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  maxWidth?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${maxWidth} bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Eliminar",
  loading = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: ReactNode
  confirmLabel?: string
  loading?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      <div className="text-sm text-gray-600">{message}</div>
      <div className="flex justify-end gap-2 pt-5">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={loading}>
          {loading ? <Spinner className="!w-4 !h-4 !border-white" /> : null}
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="text-center py-12">
      <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
        <span className="text-xl">📋</span>
      </div>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {subtitle ? <p className="text-xs text-gray-400 mt-1">{subtitle}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`w-5 h-5 border-2 border-[#0E7A0E] border-t-transparent rounded-full animate-spin ${className}`}
    />
  )
}

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E] bg-white ${className}`}
      {...props}
    />
  )
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E] ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

export function TextArea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E] bg-white resize-none ${className}`}
      {...props}
    />
  )
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-gray-600 mb-1">
      {children}
    </label>
  )
}
