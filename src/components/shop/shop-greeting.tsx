"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Coins } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getWalletBalance } from "@/lib/wallet-actions"

/**
 * Saludo personalizado del home post-login + chip de saldo de Créditos
 * Resurte. El chip solo aparece con saldo > 0 y lleva a /recompensas,
 * para que el saldo se perciba como dinero listo para gastar.
 */
export function ShopGreeting() {
  const [name, setName] = useState<string | null>(null)
  const [credits, setCredits] = useState<number>(0)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    if (!supabase) return
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session) return
      const fullName = (session.user.user_metadata?.full_name as string | undefined) ?? null
      setName(fullName ? fullName.split(" ")[0]! : null)
      getWalletBalance().then((wallet) => {
        if (!cancelled && wallet) setCredits(Number(wallet.balance_credits) || 0)
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full pt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-[#242529]">
          {name ? `Hola, ${name}` : "Hola de nuevo"} 👋
        </h1>
        {credits > 0 && (
          <Link
            href="/recompensas"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold hover:bg-amber-100 transition-colors"
          >
            <Coins className="w-4 h-4" />
            Tienes ${credits.toFixed(2)} en créditos
          </Link>
        )}
      </div>
    </div>
  )
}
