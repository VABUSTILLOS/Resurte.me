"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  Bot,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Store,
  Truck,
  UtensilsCrossed,
} from "lucide-react"
import {
  getAdminFoodosAdoption,
  getAdminFoodosRestaurants,
  setFoodosTierOverride,
  type AdminFoodosAdoption,
  type AdminFoodosRestaurantRow,
} from "../actions"
import { TIER_RANK, type FoodosFeature } from "@/lib/foodos-entitlements"
import type { CashbackTier } from "@/types"
import { ToastProvider, useToast } from "@/components/toast"

const TIERS: CashbackTier[] = ["Verde", "Plata", "Oro", "Diamante"]

const TIER_TONE: Record<CashbackTier, string> = {
  Verde: "bg-gray-100 text-gray-700",
  Plata: "bg-slate-200 text-slate-800",
  Oro: "bg-amber-100 text-amber-800",
  Diamante: "bg-sky-100 text-sky-800",
}

const FEATURE_LABEL: Record<FoodosFeature, string> = {
  marketing_ia: "Marketing IA",
  flotilla: "Flotilla",
  mesero_ia: "Mesero IA",
  wallet_passes: "Wallet",
  app_marca: "App de marca",
  sitio_ia: "Sitio y SEO",
  pos_integraciones: "Punto de venta",
  catering: "Catering",
}

export default function AdminFoodosRestaurantsPage() {
  return (
    <ToastProvider>
      <AdminFoodosRestaurantsContent />
    </ToastProvider>
  )
}

function AdminFoodosRestaurantsContent() {
  const { toast } = useToast()
  const [rows, setRows] = useState<AdminFoodosRestaurantRow[]>([])
  const [adoption, setAdoption] = useState<AdminFoodosAdoption | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, kpis] = await Promise.all([
        getAdminFoodosRestaurants(),
        getAdminFoodosAdoption(),
      ])
      setRows(list)
      setAdoption(kpis)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Diferido a microtask: ningún setState corre síncrono en el efecto.
    void Promise.resolve().then(load)
  }, [load])

  async function grant(row: AdminFoodosRestaurantRow) {
    const tier = window.prompt(
      `Nivel para ${row.name} (Verde revoca el override):`,
      row.overridden ? row.tier : "Plata"
    )
    if (tier === null) return
    const clean = tier.trim()
    if (!TIERS.includes(clean as CashbackTier)) {
      toast("Nivel inválido. Usa Verde, Plata, Oro o Diamante.", "error")
      return
    }
    const reason =
      clean === "Verde"
        ? null
        : window.prompt("Motivo (queda en la auditoría):", row.overrideReason ?? "")?.trim() || null

    setWorkingId(row.id)
    try {
      await setFoodosTierOverride(row.id, clean, reason)
      toast(
        clean === "Verde" ? `Override revocado en ${row.name}` : `${row.name} → ${clean}`,
        "success"
      )
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al guardar el nivel", "error")
    } finally {
      setWorkingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-gray-400">
        Cargando restaurantes...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          r.slug.toLowerCase().includes(needle) ||
          (r.ownerEmail ?? "").toLowerCase().includes(needle)
      )
    : rows

  const overriddenCount = rows.filter((r) => r.overridden).length
  const diamondCount = rows.filter((r) => r.tier === "Diamante").length
  const aiCount = rows.filter((r) => r.aiSessions > 0).length

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Restaurantes FoodOS</h1>
          <p className="text-sm text-gray-500">
            {rows.length} restaurantes · {diamondCount} en Diamante · {aiCount} usando Mesero IA ·{" "}
            {overriddenCount} con nivel concedido a mano
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, slug o correo"
            aria-label="Buscar restaurante"
            className="w-56 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Recargar
          </button>
        </div>
      </div>

      <p className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
        El nivel se gana comprando: cuenta las semanas del mes en curso en que el dueño del
        restaurante pagó el mínimo calificante. El nivel concedido a mano (override) gana mientras
        no expire y queda registrado con motivo y autor. Conceder{" "}
        <strong className="font-semibold text-gray-700">Verde</strong> revoca el override y devuelve
        el nivel al que el dueño se ganó.
      </p>

      {adoption && <AdoptionPanel adoption={adoption} />}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[64rem] text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium text-gray-400">
              <th className="px-5 py-3">Restaurante</th>
              <th className="px-5 py-3">Nivel</th>
              <th className="px-5 py-3">Semanas del mes</th>
              <th className="px-5 py-3">Capacidades abiertas</th>
              <th className="px-5 py-3">Uso</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((row) => (
              <tr key={row.id} className="align-top hover:bg-gray-50">
                <td className="px-5 py-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                    <Store className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                    {row.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    /r/{row.slug} · {row.status}
                  </p>
                  {row.ownerEmail && (
                    <p className="mt-0.5 text-[11px] text-gray-500">{row.ownerEmail}</p>
                  )}
                  <Link
                    href={`/r/${row.slug}`}
                    target="_blank"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline"
                  >
                    Ver tienda
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </td>

                <td className="px-5 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${TIER_TONE[row.tier]}`}
                  >
                    {row.tier}
                  </span>
                  {row.overridden && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                      Concedido a mano
                    </p>
                  )}
                  {row.tier !== row.earnedTier && (
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      Ganado: {row.earnedTier}
                    </p>
                  )}
                  {row.overrideReason && (
                    <p
                      className="mt-0.5 max-w-[14rem] text-[11px] text-gray-500"
                      title={row.overrideReason}
                    >
                      {row.overrideReason}
                    </p>
                  )}
                  {row.overrideExpiresAt && (
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      Vence {new Date(row.overrideExpiresAt).toLocaleDateString("es-MX")}
                    </p>
                  )}
                </td>

                <td className="px-5 py-3 text-xs text-gray-600">
                  <span className="font-semibold text-gray-800">
                    {row.qualifyingWeeksThisMonth}
                  </span>
                  <span className="text-gray-400"> / 4</span>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    Semana en curso: ${row.weekSpend.toLocaleString("es-MX")}
                  </p>
                </td>

                <td className="px-5 py-3">
                  {row.features.length === 0 ? (
                    <span className="text-[11px] text-gray-400">Solo FoodOS base</span>
                  ) : (
                    <ul className="flex max-w-[16rem] flex-wrap gap-1">
                      {row.features.map((feature) => (
                        <li
                          key={feature}
                          className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                        >
                          {FEATURE_LABEL[feature]}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>

                <td className="px-5 py-3 text-xs text-gray-600">
                  <p className="flex items-center gap-1.5">
                    <Bot className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                    {row.aiSessions} sesiones · {row.aiMessages} mensajes
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                    {row.deliveries} entregas
                  </p>
                </td>

                <td className="px-5 py-3 text-right">
                  <button
                    type="button"
                    disabled={workingId === row.id}
                    onClick={() => void grant(row)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
                  >
                    {row.overridden ? "Cambiar nivel" : "Conceder nivel"}
                  </button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                  <UtensilsCrossed
                    className="mx-auto mb-2 h-5 w-5 text-gray-300"
                    aria-hidden="true"
                  />
                  {rows.length === 0
                    ? "Todavía no hay restaurantes FoodOS"
                    : "Ningún restaurante coincide con la búsqueda"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[11px] text-gray-400">
        Escalón de niveles: {TIERS.map((t) => `${t} (${TIER_RANK[t]})`).join(" · ")}. El uso cuenta
        todo el histórico, no solo el mes en curso.
      </p>
    </div>
  )
}

const DIRECTION_TONE: Record<"up" | "down" | "flat", string> = {
  up: "text-emerald-600",
  down: "text-red-600",
  flat: "text-gray-400",
}

const DIRECTION_GLYPH: Record<"up" | "down" | "flat", string> = {
  up: "↑",
  down: "↓",
  flat: "=",
}

function rateTone(rate: number): string {
  if (rate >= 60) return "text-emerald-600"
  if (rate >= 25) return "text-amber-600"
  return "text-red-600"
}

/**
 * KPIs de adopción por capacidad.
 *
 * Todo se mide sobre los restaurantes que YA tienen la capacidad abierta: si no,
 * un porcentaje bajo solo diría que nadie llegó al nivel. Los tres números
 * contestan preguntas distintas — se activó alguna vez, se usa esta semana, y
 * sigue usándose la semana siguiente.
 */
function AdoptionPanel({ adoption }: { adoption: AdminFoodosAdoption }) {
  const { summary, features, untracked, windowDays } = adoption
  const measured = features.filter((f) => f.unlocked > 0)

  const tiles = [
    { label: "Restaurantes", value: String(summary.restaurants), hint: "en FoodOS" },
    {
      label: "Activos",
      value: String(summary.activeRestaurants),
      hint: `con uso en ${windowDays} días`,
    },
    {
      label: "Dormidos",
      value: String(summary.dormantRestaurants),
      hint: "capacidades abiertas, cero uso",
    },
    {
      label: "Capacidades por restaurante",
      value: summary.averageUnlocked.toFixed(1),
      hint: "promedio abierto",
    },
  ]

  return (
    <section className="mb-6" aria-labelledby="adopcion-heading">
      <h2 id="adopcion-heading" className="mb-1 text-sm font-semibold text-gray-900">
        Adopción de capacidades
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-gray-500">
        Cada porcentaje se calcula solo sobre los restaurantes cuyo nivel ya abre esa capacidad. La
        retención compara los últimos {windowDays} días contra los {windowDays} anteriores: un
        100% de activación con retención baja es una capacidad que se probó una vez.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-medium text-gray-400">{tile.label}</p>
            <p className="mt-1 text-xl font-bold text-gray-900">{tile.value}</p>
            <p className="text-xs text-gray-400">{tile.hint}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium text-gray-400">
              <th className="px-5 py-3">Capacidad</th>
              <th className="px-5 py-3">Abierta en</th>
              <th className="px-5 py-3">Activación</th>
              <th className="px-5 py-3">Activos {windowDays}d</th>
              <th className="px-5 py-3">Retención</th>
              <th className="px-5 py-3">Usos vs previo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {measured.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-xs text-gray-400">
                  Ningún restaurante tiene capacidades premium abiertas todavía.
                </td>
              </tr>
            )}
            {measured.map((feature) => (
              <tr key={feature.feature} className="hover:bg-gray-50">
                <td className="px-5 py-3 text-xs font-semibold text-gray-900">
                  {FEATURE_LABEL[feature.feature]}
                </td>
                <td className="px-5 py-3 text-xs text-gray-600">{feature.unlocked}</td>
                <td className={`px-5 py-3 text-xs font-semibold ${rateTone(feature.activationRate)}`}>
                  {feature.activationRate.toFixed(1)}%
                  <span className="ml-1 font-normal text-gray-400">
                    ({feature.activated}/{feature.unlocked})
                  </span>
                </td>
                <td
                  className={`px-5 py-3 text-xs font-semibold ${rateTone(feature.weeklyActiveRate)}`}
                >
                  {feature.weeklyActiveRate.toFixed(1)}%
                  <span className="ml-1 font-normal text-gray-400">
                    ({feature.activeRecent}/{feature.unlocked})
                  </span>
                </td>
                <td className={`px-5 py-3 text-xs font-semibold ${rateTone(feature.retentionRate)}`}>
                  {feature.activeRecent === 0 ? "—" : `${feature.retentionRate.toFixed(1)}%`}
                  <span className="ml-1 font-normal text-gray-400">
                    ({feature.retained}/{feature.activeRecent})
                  </span>
                </td>
                <td className="px-5 py-3 text-xs">
                  <span className="text-gray-600">{feature.usage.current}</span>
                  <span className="text-gray-400"> vs {feature.usage.previous} </span>
                  <span className={`font-semibold ${DIRECTION_TONE[feature.usage.direction]}`}>
                    <span aria-hidden="true">{DIRECTION_GLYPH[feature.usage.direction]}</span>
                    {feature.usage.deltaPct === null
                      ? " sin base"
                      : ` ${feature.usage.deltaPct.toFixed(1)}%`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {untracked.length > 0 && (
        <p className="mt-2 text-xs text-gray-400">
          Sin telemetría en la base, así que no se miden:{" "}
          {untracked.map((f) => FEATURE_LABEL[f]).join(", ")}. El manifest y el icono se sirven
          derivados de la configuración del restaurante y no dejan rastro.
        </p>
      )}
    </section>
  )
}
