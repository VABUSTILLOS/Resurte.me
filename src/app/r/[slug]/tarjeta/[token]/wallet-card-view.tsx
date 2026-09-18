"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { Gift, Smartphone, Ticket } from "lucide-react"

import { buildWalletCard } from "@/lib/foodos-wallet/card"
import { detectStorefrontLang, sf } from "@/lib/foodos-i18n"

type Platform = "ios" | "android" | "other"

/** La plataforma no cambia durante la vida de la página: no hay nada que suscribir. */
function subscribePlatform(): () => void {
  return () => {}
}

function platformSnapshot(): Platform {
  const ua = typeof navigator === "undefined" ? "" : (navigator.userAgent ?? "")
  if (/iphone|ipad|ipod/i.test(ua)) return "ios"
  if (/android/i.test(ua)) return "android"
  return "other"
}

/**
 * En el servidor no hay `userAgent` fiable, así que el HTML sale con el texto
 * genérico y el cliente lo especializa tras hidratar. Detectar en un `useEffect`
 * provocaría un render en cascada y un parpadeo del texto.
 */
function platformServerSnapshot(): Platform {
  return "other"
}

interface WalletCardViewProps {
  slug: string
  token: string
  serial: string
  restaurantName: string
  logoUrl: string | null
  themeColor: string | null
  customerName: string | null
  points: number
  pointValue: number
  rewardLabel: string | null
  rewardThreshold: number | null
  cardUrl: string
  appleEnabled: boolean
  googleEnabled: boolean
}

/**
 * Tarjeta de lealtad pública.
 *
 * Se dibuja con el mismo `buildWalletCard` que alimenta los pases de Apple y
 * Google: si el color, el saldo o la recompensa cambiaran aquí y no allá, el
 * comensal vería dos tarjetas distintas para el mismo programa.
 */
export function WalletCardView(props: WalletCardViewProps) {
  const {
    slug,
    token,
    serial,
    restaurantName,
    logoUrl,
    themeColor,
    customerName,
    points,
    pointValue,
    rewardLabel,
    rewardThreshold,
    cardUrl,
    appleEnabled,
    googleEnabled,
  } = props

  const [lang] = useState(() => detectStorefrontLang(slug))
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const platform = useSyncExternalStore(
    subscribePlatform,
    platformSnapshot,
    platformServerSnapshot
  )

  const card = buildWalletCard({
    serial,
    cardUrl,
    restaurantName,
    logoUrl,
    themeColor,
    customerName,
    points,
    pointValue,
    rewardLabel,
    rewardThreshold,
    labels: {
      points: sf(lang, "walletPoints"),
      value: sf(lang, "walletValue"),
      reward: sf(lang, "walletReward"),
      remaining: sf(lang, "walletRemaining"),
      achieved: sf(lang, "walletAchieved"),
    },
  })

  // El QR se genera en el cliente para no cargar `qrcode` en el servidor ni
  // inflar el bundle inicial.
  useEffect(() => {
    let cancelled = false
    import("qrcode")
      .then(({ toDataURL }) =>
        toDataURL(card.barcode.message, { width: 320, margin: 1 }).then((dataUrl) => {
          if (!cancelled) setQrUrl(dataUrl)
        })
      )
      .catch(() => {
        if (!cancelled) setQrUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [card.barcode.message])

  const installHint =
    platform === "ios"
      ? sf(lang, "walletInstallIos")
      : platform === "android"
        ? sf(lang, "walletInstallAndroid")
        : sf(lang, "walletInstallHint")

  const hasWalletButtons = appleEnabled || googleEnabled

  return (
    <main className="min-h-dvh bg-neutral-100 px-4 pb-24 pt-6 dark:bg-neutral-950">
      <div className="mx-auto w-full max-w-md">
        <p className="mb-3 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {sf(lang, "walletTitle")}
        </p>

        {/* Tarjeta */}
        <section
          className="rounded-3xl p-5 shadow-lg"
          style={{ backgroundColor: card.backgroundColor, color: card.foregroundColor }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold opacity-90">{card.organizationName}</p>
              <p className="mt-0.5 truncate text-xs" style={{ color: card.labelColor }}>
                {card.header}
              </p>
            </div>
            <Ticket aria-hidden="true" className="h-6 w-6 shrink-0 opacity-80" />
          </div>

          <div className="mt-6 flex items-end gap-2">
            <span className="text-4xl font-bold leading-none tabular-nums">{card.points.toLocaleString("es-MX")}</span>
            <span className="pb-0.5 text-xs font-semibold" style={{ color: card.labelColor }}>
              {card.labels.points}
            </span>
          </div>
          {card.secondary ? (
            <p className="mt-1 text-sm" style={{ color: card.labelColor }}>
              {card.secondary}
            </p>
          ) : null}

          {card.reward ? (
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs font-medium" style={{ color: card.labelColor }}>
                <span>{card.labels.reward}</span>
                <span className="truncate pl-2">{card.rewardText}</span>
              </div>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.28)" }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={card.reward.threshold}
                aria-valuenow={Math.min(card.points, card.reward.threshold)}
                aria-label={card.reward.label}
              >
                <div
                  className="h-full rounded-full bg-white/90 transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${Math.round(card.reward.progress * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="mt-5 text-xs" style={{ color: card.labelColor }}>
              {sf(lang, "walletNoReward")}
            </p>
          )}
        </section>

        {/* QR */}
        <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
            <Gift aria-hidden="true" className="h-4 w-4" />
            <span>{sf(lang, "walletQrHint")}</span>
          </div>
          <div className="mt-3 flex items-center justify-center">
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- QR generado en cliente como data URL (qrcode.toDataURL); next/image no optimiza data URLs
              <img
                src={qrUrl}
                alt={card.barcode.altText}
                width={220}
                height={220}
                className="h-auto w-[220px]"
              />
            ) : (
              <div
                className="flex h-[220px] w-[220px] items-center justify-center rounded-xl bg-neutral-100 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                aria-live="polite"
              >
                {sf(lang, "walletLoading")}
              </div>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
            {card.serial}
          </p>
        </section>

        {/* Guardar en el teléfono */}
        <section className="mt-5 space-y-3">
          {appleEnabled ? (
            <a
              href={`/api/foodos/wallet/${token}/apple`}
              className="touch-target flex w-full items-center justify-center rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
            >
              {sf(lang, "walletAddApple")}
            </a>
          ) : null}
          {googleEnabled ? (
            <a
              href={`/api/foodos/wallet/${token}/google`}
              className="touch-target flex w-full items-center justify-center rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
            >
              {sf(lang, "walletAddGoogle")}
            </a>
          ) : null}

          {!hasWalletButtons ? (
            <div className="flex items-start gap-2 rounded-xl bg-white p-4 text-xs text-neutral-600 shadow-sm dark:bg-neutral-900 dark:text-neutral-300">
              <Smartphone aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{installHint}</span>
            </div>
          ) : null}

          <Link
            href={`/r/${slug}`}
            className="touch-target flex w-full items-center justify-center rounded-xl border border-neutral-300 px-4 py-3 text-sm font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
          >
            {sf(lang, "walletOrderAgain")}
          </Link>
        </section>
      </div>
    </main>
  )
}
