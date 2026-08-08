export default function SearchBar({
  dishCount,
  searchQuery,
  onSearchChange,
  filteredCount,
}: {
  dishCount: number
  searchQuery: string
  onSearchChange: (q: string) => void
  filteredCount: number
}) {
  if (dishCount === 0) return null
  return (
    <div className="mb-4">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Buscar platillo o ingrediente..."
        className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#0E7A0E]/20 focus:border-[#0E7A0E] placeholder-gray-400"
      />
      {searchQuery.trim() && (
        <p className="text-xs text-gray-400 mt-1.5">
          {filteredCount} de {dishCount} platillos
        </p>
      )}
    </div>
  )
}
