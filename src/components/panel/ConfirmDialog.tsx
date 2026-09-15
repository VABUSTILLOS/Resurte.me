"use client"

import { BottomSheet } from "@/components/ui/bottom-sheet"

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <BottomSheet open={open} onClose={onCancel} ariaLabelledby="confirm-dialog-title" maxWidthClass="max-w-sm">
      <div className="p-6">
        <h4 id="confirm-dialog-title" className="font-bold text-gray-900 mb-2">{title}</h4>
        {message && <p className="text-sm text-gray-500 mb-4">{message}</p>}
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className={`flex-1 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-[#0E7A0E] hover:bg-[#0D720D]"
            }`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
