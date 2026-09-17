"use client"

import { useState } from "react"
import { Mail, ArrowRight, Check } from "lucide-react"
import { trackEvent } from "@/lib/analytics"

export function BlogNewsletter() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || loading) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "blog_newsletter" }),
      })
      if (!res.ok) throw new Error("request failed")
      trackEvent("lead", { method: "newsletter", content_type: "blog" })
      setSubmitted(true)
      setEmail("")
    } catch {
      // Sin esto el usuario veía "¡Listo!" aunque su correo no se guardara.
      setError("No pudimos guardar tu correo. Inténtalo de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[#ede8df] bg-gradient-to-br from-[#f7f5f0] to-white p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0E7A0E]/10 flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5 text-[#0E7A0E]" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-[#1a1a1a]">
            ¿Quieres recibir guías como esta?
          </h3>
          <p className="text-sm text-[#6b6b6b] mt-1 leading-relaxed">
            Recibe estrategias prácticas para hacer crecer tu restaurante: food cost, mermas, proveeduría y más. Sin spam, 1–2 correos al mes.
          </p>

          {submitted ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#E9FBE9] px-4 py-3 text-sm font-semibold text-[#0E7A0E]">
              <Check className="w-4 h-4" />
              ¡Listo! Te avisaremos cuando enviemos la primera guía.
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  required
                  aria-label="Tu correo electrónico"
                  aria-invalid={error ? true : undefined}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-[#e0dbd2] bg-white text-sm text-[#1a1a1a] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/20 focus:border-[#0E7A0E]"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0E7A0E] text-white text-sm font-semibold rounded-xl hover:bg-[#0D720D] disabled:opacity-50 transition-colors shrink-0"
                >
                  {loading ? "Enviando..." : "Suscribirme"}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
              {error && (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
