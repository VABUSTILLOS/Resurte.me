"use client"

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useEscapeKey } from "@/hooks/use-escape-key"
import { FOCUSABLE_SELECTOR, nextTrapFocus } from "@/lib/focus-trap"

export interface ConfirmDialogOptions {
  title: string
  /** Cuerpo del diálogo. Los `\n` se respetan (whitespace-pre-line). */
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Pinta el botón principal en rojo (acciones irreversibles). */
  danger?: boolean
}

export interface PromptDialogOptions {
  title: string
  message?: ReactNode
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Devuelve el mensaje de error que bloquea el envío, o `null` si es válido. */
  validate?: (value: string) => string | null
}

type Pending =
  | { kind: "confirm"; options: ConfirmDialogOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; options: PromptDialogOptions; resolve: (value: string | null) => void }

/**
 * Reemplazo accesible de `window.confirm` / `window.prompt`.
 *
 * Devuelve promesas (`await confirm(...)`, `await prompt(...)`) y el nodo que
 * hay que renderizar. Frente a los diálogos nativos aporta lo que el panel
 * exige: `role="dialog"` + `aria-modal`, foco inicial, trap de Tab, cierre con
 * Escape y click en el fondo, restauración del foco al cerrar, validación
 * inline con `role="alert"` y botones de 44px (`touch-target`).
 *
 * Montar el `dialog` una sola vez por página:
 * `const { confirm, prompt, dialog } = useConfirmDialog()`.
 */
export function useConfirmDialog() {
  const [pending, setPending] = useState<Pending | null>(null)
  const [draft, setDraft] = useState("")
  const [validationError, setValidationError] = useState<string | null>(null)

  const pendingRef = useRef<Pending | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  const titleId = useId()
  const descId = useId()
  const inputId = useId()
  const errorId = useId()

  const open = useCallback((next: Pending) => {
    pendingRef.current = next
    setPending(next)
  }, [])

  // Resuelve la promesa abierta y desmonta el diálogo. Idempotente: la segunda
  // llamada (p. ej. Escape después de "Cancelar") no vuelve a resolver.
  const settle = useCallback((result: boolean | string | null) => {
    const current = pendingRef.current
    if (!current) return
    pendingRef.current = null
    if (current.kind === "confirm") current.resolve(result === true)
    else current.resolve(typeof result === "string" ? result : null)
    setPending(null)
    setValidationError(null)
  }, [])

  const confirm = useCallback(
    (options: ConfirmDialogOptions | string) =>
      new Promise<boolean>((resolve) => {
        const resolved = typeof options === "string" ? { title: options } : options
        open({ kind: "confirm", options: resolved, resolve })
      }),
    [open]
  )

  const prompt = useCallback(
    (options: PromptDialogOptions) =>
      new Promise<string | null>((resolve) => {
        setDraft(options.defaultValue ?? "")
        setValidationError(null)
        open({ kind: "prompt", options, resolve })
      }),
    [open]
  )

  // Escape y click en el fondo equivalen a "Cancelar".
  useEscapeKey(() => settle(null), pending !== null)

  // Foco inicial + trap de Tab + restauración del foco al cerrar.
  useEffect(() => {
    if (!pending) return
    restoreRef.current = document.activeElement as HTMLElement | null
    if (pending.kind === "prompt") {
      inputRef.current?.focus()
      inputRef.current?.select()
    } else {
      confirmRef.current?.focus()
    }

    const panel = panelRef.current
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      const currentIndex = focusables.indexOf(document.activeElement as HTMLElement)
      const target = nextTrapFocus(currentIndex, focusables.length, e.shiftKey)
      if (target < 0) return
      e.preventDefault()
      focusables[target]?.focus()
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      restoreRef.current?.focus?.()
      restoreRef.current = null
    }
  }, [pending])

  function submitPrompt() {
    const current = pendingRef.current
    if (!current || current.kind !== "prompt") return
    const invalid = current.options.validate?.(draft) ?? null
    if (invalid) {
      setValidationError(invalid)
      inputRef.current?.focus()
      return
    }
    settle(draft)
  }

  const dialog = pending ? (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={() => settle(null)}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={pending.options.message ? descId : undefined}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-bold text-gray-900">
          {pending.options.title}
        </h2>
        {pending.options.message && (
          <p id={descId} className="mt-2 whitespace-pre-line text-sm text-gray-600">
            {pending.options.message}
          </p>
        )}

        {pending.kind === "prompt" && (
          <div className="mt-4">
            <label htmlFor={inputId} className="sr-only">
              {pending.options.title}
            </label>
            <input
              id={inputId}
              ref={inputRef}
              value={draft}
              placeholder={pending.options.placeholder}
              onChange={(e) => {
                setDraft(e.target.value)
                if (validationError) setValidationError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  submitPrompt()
                }
              }}
              aria-invalid={validationError ? true : undefined}
              aria-describedby={validationError ? errorId : undefined}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {validationError && (
              <p id={errorId} role="alert" className="mt-2 text-xs font-medium text-red-600">
                {validationError}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => settle(null)}
            className="flex-1 touch-target rounded-xl bg-[#F7F5F0] px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-[#EFEDE8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {pending.options.cancelLabel ?? "Cancelar"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() =>
              pending.kind === "prompt" ? submitPrompt() : settle(true)
            }
            className={`flex-1 touch-target rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              pending.kind === "confirm" && pending.options.danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-brand-600 hover:bg-brand-700"
            }`}
          >
            {pending.options.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, prompt, dialog }
}
