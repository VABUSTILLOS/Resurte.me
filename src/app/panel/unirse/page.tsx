"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { t } from "@/lib/i18n/es"
import { resetPanelRoleCache } from "@/hooks/use-panel-role"
import { UserCheck, AlertCircle, Loader2 } from "lucide-react"

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; role: string }
  | { kind: "error"; message: string }

function UnirseInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const [state, setState] = useState<State>({ kind: "idle" })

  async function accept() {
    setState({ kind: "loading" })
    try {
      const res = await fetch("/api/panel/members/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token }),
      })
      const json = (await res.json()) as { role?: string; error?: string }
      if (res.ok) {
        resetPanelRoleCache()
        setState({ kind: "success", role: json.role ?? "" })
        return
      }
      const message =
        res.status === 401
          ? t("unirse.errorLogin")
          : res.status === 403
            ? t("unirse.errorEmailMismatch")
            : res.status === 409
              ? t("unirse.errorAlreadyMember")
              : (json.error ?? t("unirse.errorGeneric"))
      setState({ kind: "error", message })
    } catch {
      setState({ kind: "error", message: t("unirse.errorGeneric") })
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10">
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
          <UserCheck className="w-6 h-6 text-indigo-600" />
        </div>

        {state.kind === "success" ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900 mb-1">{t("unirse.successTitle")}</h1>
            <p className="text-sm text-gray-500 mb-5">
              {t("unirse.successDescription", { role: t(`personal.role_${state.role}`) })}
            </p>
            <Link
              href="/panel"
              className="inline-block px-5 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0c6b0c] transition-colors"
            >
              {t("unirse.goToPanel")}
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-900 mb-1">{t("unirse.pageTitle")}</h1>
            <p className="text-sm text-gray-500 mb-5">{t("unirse.description")}</p>
            {!token ? (
              <p className="text-sm text-red-600 flex items-center justify-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                {t("unirse.errorInvalid")}
              </p>
            ) : (
              <button
                type="button"
                onClick={accept}
                disabled={state.kind === "loading"}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0c6b0c] disabled:opacity-50 transition-colors"
              >
                {state.kind === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
                {state.kind === "loading" ? t("unirse.accepting") : t("unirse.acceptButton")}
              </button>
            )}
            {state.kind === "error" && (
              <p className="text-sm text-red-600 mt-4">{state.message}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function UnirsePage() {
  return (
    <Suspense>
      <UnirseInner />
    </Suspense>
  )
}
