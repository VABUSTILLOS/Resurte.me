export type DateFilterValue = "all" | "week" | "month"

interface DateFilterProps {
  dateFilter: DateFilterValue
  onFilterChange: (f: DateFilterValue) => void
  filteredCount: number
  totalCount: number
}

const FILTERS: { value: DateFilterValue; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "week", label: "7 días" },
  { value: "month", label: "30 días" },
]

export default function DateFilter({ dateFilter, onFilterChange, filteredCount, totalCount }: DateFilterProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xs text-gray-400">Filtrar:</span>
      <div className="flex bg-gray-100 rounded-lg p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              dateFilter === f.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <span className="text-[10px] text-gray-400 ml-auto">
        {filteredCount} de {totalCount} registros
      </span>
    </div>
  )
}
