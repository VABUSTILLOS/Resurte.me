"use client"

import { useState, useCallback, useMemo } from "react"
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

/** Máximo de toasts visibles: más de 3 tapa el contenido en móvil. */
const MAX_TOASTS = 3

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++toastId
    // Dedupe: taps repetidos (ej. "Agregar" varias veces seguidas) no apilan
    // toasts idénticos; se conserva el primero hasta que expire.
    setToasts((prev) => {
      if (prev.some((t) => t.message === message && t.type === type)) return prev
      return [...prev, { id, message, type }].slice(-MAX_TOASTS)
    })
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2800)
  }, [])

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  // Valor estable: sin memo, cada toast re-renderizaría a TODOS los
  // consumidores de useToast() de la app (el provider está en el root layout).
  const contextValue = useMemo(() => ({ toast: addToast }), [addToast])

  return (
    <ToastCtx.Provider value={contextValue}>
      {children}
      {/* Toast container — mobile: centrado arriba de las barras flotantes
          (MobileCartBar z-50 / sticky ATC z-40). Desktop: esquina inferior.
          aria-live anuncia las notificaciones a lectores de pantalla. */}
      <div
        aria-live="polite"
        className="fixed z-[100] space-y-2 max-w-sm left-4 right-4 sm:left-auto sm:right-6 bottom-[calc(var(--floating-bottom-offset,0px)+1rem)] sm:bottom-6 mx-auto sm:mx-0"
      >
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
              role={t.type === "error" ? "alert" : "status"}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg animate-[slideIn_0.25s_ease-out] ${bgMap[t.type]}`}
            >
              {iconMap[t.type]}
              <span className="text-sm font-medium text-gray-800 flex-1">{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                aria-label="Cerrar notificación"
                className="text-gray-300 hover:text-gray-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}
