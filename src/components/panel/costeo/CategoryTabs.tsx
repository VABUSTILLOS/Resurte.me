import { Calculator, Plus } from "lucide-react"
import EmptyState from "@/components/panel/EmptyState"
import { DISH_CATEGORIES } from "./costeo-shared"
import { t } from "@/lib/i18n/es"

export default function CategoryTabs({
  dishCount,
  viewMode,
  categoryFilter,
  onSelectCategory,
  onCreateFirst,
}: {
  dishCount: number
  viewMode: string
  categoryFilter: string
  onSelectCategory: (key: string) => void
  onCreateFirst: () => void
}) {
  if (dishCount === 0 && viewMode === "lista") {
    return (
      <div className="mb-6">
        <EmptyState
          icon={Calculator}
          title={t("costeo.emptyTitle")}
          description={t("costeo.emptyDescription")}
          action={
            <button
              onClick={onCreateFirst}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0E7A0E] text-white text-xs font-semibold rounded-xl hover:bg-[#0D720D] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("costeo.createFirst")}
            </button>
          }
        />
      </div>
    )
  }
  if (dishCount === 0) return null
  return (
    <div className="flex gap-1.5 mb-3 flex-wrap">
      {DISH_CATEGORIES.map((cat) => (
        <button
          key={cat.key}
          onClick={() => onSelectCategory(cat.key)}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            categoryFilter === cat.key
              ? cat.color
              : "bg-gray-50 text-gray-500 hover:bg-gray-100"
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  )
}
