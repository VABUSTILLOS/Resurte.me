"use client"

import { useEffect, useState } from "react"
import { Bell, Check } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface BackInStockFormProps {
  productId: number
  productName: string
}

/**
 * «Avísame cuando haya» de la ficha de un producto agotado
 * (migración 00230). Guarda la suscripción vía
 * POST /api/stock-notifications; el aviso lo dispara el servidor
 * cuando el stock vuelve a ser positivo. Con sesión iniciada se
 * intenta precargar el WhatsApp del perfil (y el servidor también
 * lo resuelve si el campo va vacío).
 */
export function BackInStockForm({ productId, productName }: BackInStockFormProps) {
  const [phone, setPhone] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const supabase = createClient()
        if (!supabase) return
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user || !active) return
        const { data } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", user.id)
          .maybeSingle()
        const profilePhone = (data as { phone?: string | null } | null)?.phone
        if (active && profilePhone) setPhone(profilePhone)
      } catch {
        // Sin sesión o sin perfil: el campo queda para captura manual.
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const submit = async () => {
    setStatus("sending")
    setErrorMsg("")
    try {
      const res = await fetch("/api/stock-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, phone: phone.trim() }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setStatus("error")
        setErrorMsg(data?.error ?? "No pudimos registrar el aviso. Inténtalo de nuevo.")
        return
      }
      setStatus("done")
    } catch {
      setStatus("error")
      setErrorMsg("No pudimos registrar el aviso. Inténtalo de nuevo.")
    }
  }

  if (status === "done") {
    return (
      <div className="mt-4 flex items-start gap-2 px-3 py-2.5 bg-[#e8f5e9] rounded-xl border border-[#c8e6c8]">
        <Check className="w-4 h-4 text-[#0E7A0E] shrink-0 mt-0.5" />
        <p className="text-xs font-medium text-[#1E6E1E]">
          ¡Listo! Te avisaremos por WhatsApp en cuanto haya {productName} de nuevo.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 p-3 rounded-xl border border-[#e0dbd2] bg-white">
      <p className="text-sm font-semibold text-[#1a1a1a] flex items-center gap-1.5">
        <Bell className="w-4 h-4 text-[#0E7A0E]" />
        Avísame cuando haya
      </p>
      <p className="text-[13px] text-[#6b6b6b] mt-0.5">
        Déjanos tu WhatsApp y te avisamos en cuanto vuelva este producto.
      </p>
      <div className="mt-2.5 flex gap-2">
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Tu WhatsApp (10 dígitos)"
          aria-label="Tu número de WhatsApp"
          className="flex-1 min-w-0 h-11 px-3 rounded-lg border border-[#ede8df] text-sm text-[#1a1a1a] focus:outline-none focus:border-[#0E7A0E]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={status === "sending" || phone.replace(/\D/g, "").length < 10}
          className="h-11 px-4 shrink-0 rounded-lg bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0D720D] active:bg-[#0A610A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === "sending" ? "Guardando…" : "Avísame"}
        </button>
      </div>
      {status === "error" && (
        <p role="alert" className="mt-2 text-[13px] text-[#C42B2A]">
          {errorMsg}
        </p>
      )}
    </div>
  )
}
