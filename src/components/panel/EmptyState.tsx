"use client"

import { ReactNode } from "react"
import { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
      <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">
        <Icon className="w-6 h-6 text-gray-300" />
      </div>
      <p className="text-gray-500 font-medium mb-1">{title}</p>
      {description && <p className="text-xs text-gray-400 max-w-sm mx-auto mb-4">{description}</p>}
      {action}
    </div>
  )
}
