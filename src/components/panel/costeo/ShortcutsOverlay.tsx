import { useEscapeKey } from "@/hooks/use-escape-key"

export default function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscapeKey(onClose, open)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-bold text-gray-900">Atajos de teclado</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Cerrar atajos">×</button>
        </div>
        <ul className="space-y-3 text-sm">
          <li className="flex justify-between items-center">
            <span className="text-gray-600">Nuevo platillo / combo</span>
            <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md text-xs font-mono">Ctrl+N</kbd>
          </li>
          <li className="flex justify-between items-center">
            <span className="text-gray-600">Deshacer</span>
            <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md text-xs font-mono">Ctrl+Z</kbd>
          </li>
          <li className="flex justify-between items-center">
            <span className="text-gray-600">Rehacer</span>
            <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md text-xs font-mono">Ctrl+Y</kbd>
          </li>
          <li className="flex justify-between items-center">
            <span className="text-gray-600">Cerrar formularios / ventanas</span>
            <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md text-xs font-mono">Esc</kbd>
          </li>
          <li className="flex justify-between items-center">
            <span className="text-gray-600">Mostrar/ocultar esta ayuda</span>
            <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md text-xs font-mono">?</kbd>
          </li>
        </ul>
      </div>
    </div>
  )
}
