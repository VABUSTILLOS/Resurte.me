interface Props {
  itemCount: number
  okCount: number
  lowCount: number
  outCount: number
}

export default function StatsRow({ itemCount, okCount, lowCount, outCount }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-2xl font-extrabold text-gray-800">{itemCount}</p>
        <p className="text-[10px] text-gray-400">Productos</p>
      </div>
      <div className="bg-green-50 rounded-xl border border-green-100 p-3 text-center">
        <p className="text-2xl font-extrabold text-green-700">{okCount}</p>
        <p className="text-[10px] text-green-600">🟢 Suficiente</p>
      </div>
      <div className="bg-amber-50 rounded-xl border border-amber-100 p-3 text-center">
        <p className="text-2xl font-extrabold text-amber-700">{lowCount}</p>
        <p className="text-[10px] text-amber-600">🟡 Bajo</p>
      </div>
      <div className="bg-red-50 rounded-xl border border-red-100 p-3 text-center">
        <p className="text-2xl font-extrabold text-red-700">{outCount}</p>
        <p className="text-[10px] text-red-600">🔴 Agotado</p>
      </div>
    </div>
  )
}
