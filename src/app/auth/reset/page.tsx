"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { isSupabaseConfigured } from "@/lib/supabase/env"

export const dynamic = "force-dynamic"

/**
 * Página de restablecimiento de contraseña.
 *
 * El flujo: login → "¿Olvidaste tu contraseña?" → resetPasswordForEmail →
 * el correo apunta a /auth/callback?next=/auth/reset, que intercambia el
 * código por una sesión temporal de recuperación y aterriza aquí.
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  )
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  // Sin Supabase configurado (dev/preview sin secrets) no hay nada que
  // verificar: se muestra directamente el aviso de enlace inválido.
  const [checking, setChecking] = useState(() => supabase !== null)
  const [hasSession, setHasSession] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      setHasSession(!!user)
      setChecking(false)
    })
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.")
      return
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
      setTimeout(() => {
        router.refresh()
        router.push("/")
      }, 2000)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos actualizar tu contraseña. Inténtalo de nuevo."
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">
          Nueva contraseña
        </h1>

        {checking ? (
          <p className="text-center text-sm text-gray-500">Verificando enlace…</p>
        ) : !hasSession ? (
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-700">
            <p className="font-semibold mb-1">
              {isSupabaseConfigured()
                ? "Enlace no válido o expirado"
                : "Autenticación no disponible en este entorno"}
            </p>
            <p>
              Solicita uno nuevo desde{" "}
              <Link
                href="/auth/login"
                className="font-semibold text-emerald-600 hover:text-emerald-500"
              >
                iniciar sesión
              </Link>{" "}
              con «¿Olvidaste tu contraseña?».
            </p>
          </div>
        ) : done ? (
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
            <p className="font-semibold mb-1">¡Contraseña actualizada!</p>
            <p>Te estamos redirigiendo…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Nueva contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-3 sm:py-2 text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="••••••"
              />
            </div>

            <div>
              <label
                htmlFor="confirm"
                className="block text-sm font-medium text-gray-700"
              >
                Confirmar contraseña
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-3 sm:py-2 text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 px-4 py-3 sm:py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Guardando..." : "Guardar contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
