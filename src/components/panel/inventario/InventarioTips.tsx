import { Package } from "lucide-react"

export default function InventarioTips() {
  return (
    <div className="mt-6 bg-gradient-to-r from-[#F0FDF4] to-white rounded-2xl border border-[#0E7A0E]/10 p-5">
      <div className="flex items-start gap-3">
        <Package className="w-5 h-5 text-[#0E7A0E] mt-0.5 shrink-0" />
        <div>
          <h4 className="font-semibold text-gray-900 mb-1 text-sm">Consejos de inventario</h4>
          <p className="text-xs text-gray-500 leading-relaxed">
            Mantén al menos 2× el stock mínimo de cada producto. Revisa el inventario semanalmente.
            Los productos importados del planificador se actualizan al reimportar.
            Usa la orden de compra sugerida para pedir todo lo que necesitas en resurte.me.
          </p>
        </div>
      </div>
    </div>
  )
}
