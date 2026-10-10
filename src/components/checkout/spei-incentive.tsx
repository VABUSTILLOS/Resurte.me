"use client"

import { Building2, Zap } from "lucide-react"
import { CopyRow } from "@/components/checkout/payment-instructions"
import { formatClabe, getSpeiAccount } from "@/lib/spei-account"

/**
 * Cuadrito que incentiva pagar por transferencia (SPEI) en vez de con tarjeta.
 *
 * POR QUÉ EXISTE: Stripe liquida las tarjetas en ~5 días hábiles y el negocio
 * necesita el dinero a diario, además de la comisión por cobro. La transferencia
 * llega directo a la cuenta y no deja comisión.
 *
 * EL INCENTIVO ES REAL, NO COPY: pagar por SPEI marca el pedido como
 * prioritario (`orders.priority`, derivado del método de pago en el servidor) y
 * el almacén lo ve en `/admin/pedidos` y en el ticket. Si algún día se quita esa
 * marca, este mensaje se vuelve una promesa vacía y hay que quitarlo también.
 *
 * NO muestra el monto ni la referencia a propósito: eso vive en las
 * instrucciones posteriores al pedido (`PaymentInstructions`). Si el cliente
 * transfiere antes de que exista el pedido, el dinero llega sin referencia que
 * reconciliar; el copy pide confirmar primero.
 *
 * Lo montan las DOS superficies de checkout (página completa y drawer) para que
 * el mensaje no pueda divergir entre ellas.
 */
export function SpeiIncentive({ amount }: { amount?: number | null }) {
  const account = getSpeiAccount()

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex items-start gap-2 mb-3">
        <Zap className="w-4 h-4 text-violet-700 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-violet-900">
            Desbloquea envío prioritario al pagar con transferencia
          </p>
          <p className="text-xs text-violet-700 mt-0.5">
            Tu pedido entra a la ruta prioritaria del día y no pagas comisión de
            tarjeta. Confirma tu pedido y transfiere el monto exacto.
          </p>
        </div>
      </div>

      {/* El monto a transferir, arriba de la cuenta: es el dato que el cliente
          necesita para no equivocarse de cantidad. */}
      {amount != null && (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-violet-200 bg-white px-3 py-2">
          <span className="text-[10px] uppercase tracking-wide text-violet-600">
            Total a transferir
          </span>
          <span className="text-sm font-bold text-[#242529]">${amount.toFixed(2)} MXN</span>
        </div>
      )}

      <div className="space-y-2">
        <CopyRow label="CLABE" value={formatClabe(account.clabe)} copyValue={account.clabe} />
        <CopyRow label="Banco" value={account.banco} />
        <CopyRow label="Beneficiario" value={account.beneficiario} />
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-violet-700">
        <Building2 className="w-3.5 h-3.5 shrink-0 mt-px" />
        Al confirmar tu pedido te damos el monto exacto y tu número de pedido para
        usarlo como concepto de la transferencia.
      </p>
    </div>
  )
}
