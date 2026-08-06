"use client"

import { useState, useEffect, useCallback } from "react"
import { createContext, useContext } from "react"
import { CheckCircle2, XCircle, AlertCircle, X } from "lucide-react"

type ToastType = "success" | "error" | "warning"

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void
}

const ToastCtx = createContext<ToastContextType>({ toast: () => {} })

export function useToast() {
  return useContext(ToastCtx)
}

let toastId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2800)
  }, [])

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <ToastCtx.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[100] space-y-2 max-w-sm">
        {toasts.map((t) => {
          const iconMap = {
            success: <CheckCircle2 className="w-4 h-4 text-green-500" />,
            error: <XCircle className="w-4 h-4 text-red-500" />,
            warning: <AlertCircle className="w-4 h-4 text-amber-500" />,
          }
          const bgMap = {
            success: "bg-white border-green-200",
            error: "bg-white border-red-200",
            warning: "bg-white border-amber-200",
          }
          return (
            <div
              key={t.id}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg animate-[slideIn_0.25s_ease-out] ${bgMap[t.type]}`}
            >
              {iconMap[t.type]}
              <span className="text-sm font-medium text-gray-800 flex-1">{t.message}</span>
              <button onClick={() => removeToast(t.id)} className="text-gray-300 hover:text-gray-500">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}
