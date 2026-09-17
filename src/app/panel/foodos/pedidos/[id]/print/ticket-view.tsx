import { formatMoney } from "@/lib/foodos"
import type { TicketDocument } from "@/lib/foodos-printing"
import { formatTicketDate } from "@/lib/foodos-printing"
import { PrintButton } from "./print-button"

/**
 * Vista 80mm de un `TicketDocument`. Sólo presenta: todo lo que se ve aquí ya
 * lo decidió `src/lib/foodos-printing`, así que el ticket de pantalla y el que
 * armaría una térmica ESC/POS nunca se separan.
 */
export function TicketView({
  doc,
  auto,
  qrDataUrl,
}: {
  doc: TicketDocument
  auto: boolean
  qrDataUrl?: string | null
}) {
  const isKitchen = doc.kind === "kitchen"

  return (
    <div className="min-h-screen bg-stone-100 py-8 print:bg-white print:py-0">
      <style>{`@media print { @page { margin: 8mm; } .no-print { display: none !important; } }`}</style>

      <div className="mx-auto max-w-sm rounded-lg bg-white p-6 font-mono text-sm text-stone-900 shadow-lg print:rounded-none print:shadow-none">
        <header className="mb-4 border-b border-dashed border-stone-300 pb-4 text-center">
          {isKitchen && (
            <p className="mb-1 text-xs font-bold tracking-widest text-stone-500">COMANDA COCINA</p>
          )}
          <p className="text-base font-bold">{doc.restaurantName}</p>
          {doc.branchName && <p className="text-xs text-stone-500">{doc.branchName}</p>}
          <p className="mt-1 text-xs text-stone-500">
            #{doc.folio} · {formatTicketDate(doc.issuedAt)}
          </p>
          <p className="mt-1 text-xs font-bold">
            {doc.fulfillmentLabel}
            {doc.tableNumber ? ` · MESA ${doc.tableNumber}` : ""}
            {!isKitchen && ` · ${doc.statusLabel}`}
          </p>
          {doc.scheduledFor && (
            <p className="mt-1 text-xs font-bold text-purple-700">
              PROGRAMADO: {formatTicketDate(doc.scheduledFor)}
            </p>
          )}
        </header>

        {isKitchen && doc.tableNumber && (
          <p className="mb-4 border-2 border-stone-900 py-2 text-center text-2xl font-bold">
            MESA {doc.tableNumber}
          </p>
        )}

        <section
          className="mb-4 space-y-2 border-b border-dashed border-stone-300 pb-4"
          aria-label="Artículos"
        >
          {doc.lines.map((line, idx) => (
            <div key={`${line.name}-${idx}`}>
              <div className="flex justify-between gap-2">
                <span className={isKitchen ? "font-bold" : undefined}>
                  <strong>{line.qty}×</strong> {line.name}
                </span>
                {!isKitchen && <span className="whitespace-nowrap">{formatMoney(line.amount)}</span>}
              </div>
              {line.modifiers.map((mod, modIdx) => (
                <p key={`${mod.name}-${modIdx}`} className="pl-6 text-xs text-stone-600">
                  └ {mod.name}
                  {!isKitchen && mod.priceDelta > 0 ? ` (+${formatMoney(mod.priceDelta)})` : ""}
                </p>
              ))}
            </div>
          ))}
        </section>

        {!isKitchen && (doc.customerName || doc.customerPhone) && (
          <section className="mb-4 border-b border-dashed border-stone-300 pb-4 text-xs">
            <p>
              <strong>Cliente:</strong> {doc.customerName ?? "—"}
              {doc.customerPhone ? ` · ${doc.customerPhone}` : ""}
            </p>
          </section>
        )}

        {doc.note && (
          <section className="mb-4 border-b border-dashed border-stone-300 pb-4 text-xs">
            <p>
              <strong>Nota:</strong> {doc.note}
            </p>
          </section>
        )}

        {doc.totals && (
          <section className="space-y-1 text-xs" aria-label="Totales">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatMoney(doc.totals.subtotal)}</span>
            </div>
            {doc.totals.discount > 0 && (
              <div className="flex justify-between">
                <span>Descuento</span>
                <span>-{formatMoney(doc.totals.discount)}</span>
              </div>
            )}
            {doc.totals.deliveryFee > 0 && (
              <div className="flex justify-between">
                <span>Envío</span>
                <span>{formatMoney(doc.totals.deliveryFee)}</span>
              </div>
            )}
            {doc.totals.tip > 0 && (
              <div className="flex justify-between">
                <span>Propina</span>
                <span>{formatMoney(doc.totals.tip)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-dashed border-stone-300 pt-2 text-base font-bold">
              <span>TOTAL</span>
              <span>{formatMoney(doc.totals.total)}</span>
            </div>
          </section>
        )}

        {doc.payment && (
          <section className="mt-3 space-y-1 text-xs" aria-label="Pago">
            {doc.payment.parts.length > 1 &&
              doc.payment.parts.map((part) => (
                <div key={part.method} className="flex justify-between">
                  <span>{part.label}</span>
                  <span>{formatMoney(part.amount)}</span>
                </div>
              ))}
            <p className="text-center text-stone-600">
              {doc.payment.label} · {doc.payment.status.toUpperCase()}
            </p>
            {doc.payment.received !== null && (
              <div className="flex justify-between">
                <span>Recibido</span>
                <span>{formatMoney(doc.payment.received)}</span>
              </div>
            )}
            {doc.payment.change !== null && (
              <div className="flex justify-between font-bold">
                <span>Cambio</span>
                <span>{formatMoney(doc.payment.change)}</span>
              </div>
            )}
          </section>
        )}

        {doc.servedBy && (
          <p className="mt-3 border-t border-dashed border-stone-300 pt-3 text-center text-xs text-stone-600">
            Atendió: {doc.servedBy}
          </p>
        )}

        {qrDataUrl && doc.trackingUrl && (
          <div className="mt-4 flex flex-col items-center gap-1 border-t border-dashed border-stone-300 pt-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL generada en servidor con `qrcode`; next/image no optimiza data URLs */}
            <img src={qrDataUrl} alt="Código QR para seguir el pedido" className="h-28 w-28" />
            <p className="text-center text-[10px] text-stone-500">Sigue tu pedido</p>
          </div>
        )}

        <div className="no-print mt-6 flex justify-center">
          <PrintButton auto={auto} />
        </div>
      </div>
    </div>
  )
}
