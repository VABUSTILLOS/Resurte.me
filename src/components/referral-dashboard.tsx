"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { useCity } from "@/contexts/city-context"
import {
  Copy,
  Share2,
  Users,
  Gift,
  ArrowLeft,
  Check,
  Zap,
} from "lucide-react"
import Link from "next/link"
import { trackEvent } from "@/lib/analytics"

interface ReferredUser {
  id: string
  full_name: string | null
  email: string | null
  created_at: string
  hasOrdered: boolean
}

export function ReferralDashboard() {
  const { city } = useCity()
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  )
  const [referralCode, setReferralCode] = useState<string>("")
  const [referredUsers, setReferredUsers] = useState<ReferredUser[]>([])
  const [totalRewards, setTotalRewards] = useState(0)
  const [copied, setCopied] = useState(false)
  // Sin cliente de Supabase (SSR), no hay nada que cargar.
  const [loading, setLoading] = useState(() => supabase != null)

  useEffect(() => {
    if (!supabase) {
      return
    }

    async function fetchData() {
      try {
        const {
          data: { session },
        } = await supabase!.auth.getSession()
        if (!session?.user?.id) {
          setLoading(false)
          return
        }
        const userId = session.user.id

        // Fetch referral code
        const { data: profile } = await supabase!
          .from("profiles")
          .select("referral_code")
          .eq("id", userId)
          .single()

        if (profile?.referral_code) {
          setReferralCode(profile.referral_code)
        }

        // Fetch referred users
        const { data: referred } = await supabase!
          .from("profiles")
          .select("id, full_name, created_at")
          .eq("referred_by", userId)
          .order("created_at", { ascending: false })

        if (referred?.length) {
          const withOrders = await Promise.all(
            referred.map(async (ref) => {
              const { count } = await supabase!
                .from("orders")
                .select("id", { count: "exact", head: true })
                .eq("user_id", ref.id)
                .neq("status", "cancelled")
              return {
                ...ref,
                email: null,
                hasOrdered: (count ?? 0) > 0,
              }
            })
          )
          setReferredUsers(withOrders)
        }

        // Fetch total referral rewards
        const { data: wallet } = await supabase!
          .from("wallets")
          .select("id")
          .eq("user_id", userId)
          .single()

        if (wallet) {
          const { data: txs } = await supabase!
            .from("wallet_transactions")
            .select("amount")
            .eq("wallet_id", wallet.id)
            .ilike("concept", "Recompensa por referido%")

          if (txs) {
            const total = txs.reduce((sum, t) => sum + Number(t.amount), 0)
            setTotalRewards(total)
          }
        }
      } catch {
        // Keep defaults
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [supabase])

  const referralLink = `https://resurte.me/auth/register?ref=${referralCode}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      trackEvent("share", { channel: "copy_referral_link" })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement("input")
      input.value = referralLink
      document.body.appendChild(input)
      input.select()
      document.execCommand("copy")
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleWhatsAppShare = () => {
    const msg = encodeURIComponent(
      `🚀 ¡Te invito a Resurte.me!\n\nCompra tus insumos al mayoreo, gana cashback en cada compra y accede a herramientas para hacer crecer tu restaurante.\n\nRegístrate con mi código y ambos ganamos $100 Créditos: ${referralLink}`
    )
    const waUrl = `https://wa.me/?text=${msg}`
    trackEvent("share", { channel: "whatsapp_referral" })
    window.open(waUrl, "_blank")
  }

  const handleNativeShare = async () => {
    const msg = `🚀 ¡Te invito a Resurte.me! Compra tus insumos al mayoreo y gana cashback. Usa mi código ${referralCode}: ${referralLink}`
    if (navigator.share) {
      try {
        await navigator.share({ title: "Resurte.me", text: msg, url: referralLink })
        trackEvent("share", { channel: "native_referral" })
        return
      } catch {}
    }
    handleWhatsAppShare()
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-40 bg-gray-200 rounded mx-auto" />
          <div className="h-12 w-64 bg-gray-200 rounded mx-auto" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {city && (
          <Link
            href={`/${city.slug}`}
            className="p-2 -ml-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
        )}
        <div>
          <h1 className="text-xl font-bold text-gray-900">Invitar Amigos</h1>
          <p className="text-sm text-gray-500">
            Gana $100 Créditos por cada amigo que haga su primer pedido
          </p>
        </div>
      </div>

      {/* Referral Code Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 p-6 mb-6 text-white shadow-lg shadow-purple-500/25"
      >
        <div className="flex items-center gap-2 mb-1">
          <Gift className="w-4 h-4 text-purple-200" />
          <p className="text-purple-200 text-xs font-medium uppercase tracking-wider">
            Tu código de invitación
          </p>
        </div>

        <div className="flex items-center justify-between mt-2">
          <p className="text-3xl font-black tracking-wider">{referralCode || "---"}</p>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-xl bg-white/20 hover:bg-white/30 px-4 py-2 text-sm font-semibold transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copiar link
              </>
            )}
          </button>
        </div>

        <p className="text-purple-200 text-xs mt-2 truncate">
          {referralLink}
        </p>

        {/* Share buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleWhatsAppShare}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-500 hover:bg-green-600 py-2.5 text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
            </svg>
            WhatsApp
          </button>
          <button
            onClick={handleNativeShare}
            className="flex items-center justify-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            <Share2 className="w-4 h-4" />
            Compartir
          </button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl bg-white border border-gray-200 p-4"
        >
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-purple-500" />
            <p className="text-xs text-gray-500 font-medium">Amigos invitados</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">{referredUsers.length}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl bg-white border border-gray-200 p-4"
        >
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-4 h-4 text-amber-500" />
            <p className="text-xs text-gray-500 font-medium">Créditos ganados</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            ${totalRewards.toLocaleString("es-MX")}
          </p>
        </motion.div>
      </div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-6"
      >
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-amber-600" />
          <p className="text-sm font-bold text-amber-800">¿Cómo funciona?</p>
        </div>
        <ol className="space-y-1.5 text-sm text-amber-700">
          <li className="flex gap-2">
            <span className="font-bold text-amber-500">1.</span>
            Comparte tu código o link con otros dueños de restaurantes
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-amber-500">2.</span>
            Cuando se registren con tu código, quedan vinculados a ti
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-amber-500">3.</span>
            Al hacer su primer pedido, tú recibes $100 Créditos Resurte 🎉
          </li>
        </ol>
      </motion.div>

      {/* Referred Users Table */}
      {referredUsers.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray-900 mb-3">
            Tus invitados ({referredUsers.length})
          </h2>
          <div className="space-y-2">
            {referredUsers.map((ref, i) => (
              <motion.div
                key={ref.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i }}
                className="flex items-center justify-between rounded-xl bg-white border border-gray-200 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {ref.full_name || "Usuario nuevo"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(ref.created_at).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {ref.hasOrdered ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-semibold text-green-700">
                      <Check className="w-3 h-3" />
                      +$100
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-50 border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500">
                      Pendiente
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && referredUsers.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium mb-1">Aún no has invitado a nadie</p>
          <p className="text-gray-400 text-sm">
            Comparte tu código y empieza a ganar créditos
          </p>
        </div>
      )}
    </div>
  )
}
