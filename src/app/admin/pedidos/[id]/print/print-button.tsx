"use client"

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-6 py-3 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors"
    >
      Imprimir ticket
    </button>
  )
}
