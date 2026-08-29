"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { t } from "@/lib/i18n/es"

interface PlannerHeaderProps {
  collectionName: string
  sharedDishesCount: number
}

export default function PlannerHeader({ collectionName, sharedDishesCount }: PlannerHeaderProps) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
        <ArrowLeft className="w-5 h-5 text-gray-400" />
      </Link>
      <div>
        <h2 className="text-xl font-bold text-gray-900">{t("planificador.pageTitle")}</h2>
        <p className="text-sm text-gray-400">{collectionName}</p>
        {sharedDishesCount > 0 && (
          <p className="text-xs text-[#0E7A0E] font-medium mt-0.5">
            {t("planificador.sharedDishesHint", { count: sharedDishesCount })}
          </p>
        )}
      </div>
    </div>
  )
}
