"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { t } from "@/lib/i18n/es"
import {
  MEMBER_ROLES, TOOL_ACCESS, canAccessTool,
  type MemberRole, type PanelMember, type PanelRole, type PanelToolKey,
} from "@/lib/panel-roles"
import {
  ArrowLeft, UserPlus, Users, Check, Copy, Trash2, Minus,
} from "lucide-react"

const TOOL_KEYS = Object.keys(TOOL_ACCESS) as PanelToolKey[]
const ALL_ROLES: PanelRole[] = ["dueno", "gerente", "cocina", "mesero"]

export default function PersonalPage() {
  const [members, setMembers] = useState<PanelMember[]>([])
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)
  const [email, setEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<MemberRole>("mesero")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/panel/members", { credentials: "same-origin" })
      if (res.status === 401 || res.status === 403) {
        setUnauthorized(true)
        return
      }
      if (!res.ok) throw new Error()
      const json = (await res.json()) as { members: PanelMember[] }
      setMembers(json.members)
    } catch {
      setError(t("personal.loadError"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const trimmed = email.trim()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t("personal.inviteEmailInvalid"))
      return
    }
    setSending(true)
    try {
      const res = await fetch("/api/panel/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: trimmed, role: inviteRole }),
      })
      const json = (await res.json()) as { member?: PanelMember; error?: string }
      if (!res.ok || !json.member) {
        setError(json.error || t("personal.inviteError"))
        return
      }
      setNotice(t("personal.inviteSuccess", { email: json.member.member_email }))
      setEmail("")
      await load()
    } catch {
      setError(t("personal.inviteError"))
    } finally {
      setSending(false)
    }
  }

  async function changeRole(id: string, role: MemberRole) {
    setError(null)
    const res = await fetch("/api/panel/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id, role }),
    })
    if (!res.ok) {
      setError(t("personal.updateError"))
      return
    }
    await load()
  }

  async function revoke(member: PanelMember) {
    if (!window.confirm(t("personal.revokeConfirm", { email: member.member_email }))) return
    setError(null)
    const res = await fetch("/api/panel/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id: member.id }),
    })
    if (!res.ok) {
      setError(t("personal.updateError"))
      return
    }
    await load()
  }

  async function copyInvite(member: PanelMember) {
    const url = `${window.location.origin}/panel/unirse?token=${member.invite_token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(member.id)
      setTimeout(() => setCopiedId((c) => (c === member.id ? null : c)), 2000)
    } catch {
      window.prompt(t("personal.copyInviteLink"), url)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href="/panel"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("personal.backToHub")}
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t("personal.pageTitle")}</h1>
            <p className="text-sm text-gray-500">{t("personal.description")}</p>
          </div>
        </div>
      </div>

      {unauthorized ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">{t("personal.loginRequired")}</p>
        </div>
      ) : (
        <>
          {/* Invitar */}
          <form
            onSubmit={invite}
            className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 mb-6"
          >
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-600" />
              {t("personal.inviteTitle")}
            </h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("personal.inviteEmailPlaceholder")}
                aria-label={t("personal.inviteEmailLabel")}
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                aria-label={t("personal.inviteRoleLabel")}
                className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30"
              >
                {MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`personal.role_${r}`)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={sending}
                className="px-4 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0c6b0c] disabled:opacity-50 transition-colors"
              >
                {sending ? t("personal.inviteSending") : t("personal.inviteButton")}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">{t(`personal.roleDesc_${inviteRole}`)}</p>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            {notice && <p className="text-xs text-emerald-600 mt-2">{notice}</p>}
          </form>

          {/* Miembros */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">{t("personal.membersTitle")}</h2>
            {loading ? (
              <p className="text-sm text-gray-400">{t("common.loading")}</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-gray-400">{t("personal.membersEmpty")}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {members.map((m) => (
                  <li key={m.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.member_email}</p>
                      <span
                        className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          m.status === "activo"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {m.status === "activo" ? t("personal.statusActivo") : t("personal.statusPendiente")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m.id, e.target.value as MemberRole)}
                        aria-label={t("personal.changeRoleLabel", { email: m.member_email })}
                        className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs bg-white"
                      >
                        {MEMBER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(`personal.role_${r}`)}
                          </option>
                        ))}
                      </select>
                      {m.status === "pendiente" && (
                        <button
                          type="button"
                          onClick={() => copyInvite(m)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          {copiedId === m.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              {t("personal.copied")}
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              {t("personal.copyInviteLink")}
                            </>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => revoke(m)}
                        aria-label={t("personal.revokeAria", { email: m.member_email })}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-100 text-xs text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t("personal.revoke")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Matriz rol × herramienta */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">{t("personal.matrixTitle")}</h2>
            <p className="text-xs text-gray-400 mb-3">{t("personal.matrixHint")}</p>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 pr-3 font-medium">{t("personal.matrixTool")}</th>
                    {ALL_ROLES.map((r) => (
                      <th key={r} className="py-2 px-2 font-medium text-center whitespace-nowrap">
                        {t(`personal.role_${r}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TOOL_KEYS.map((tool) => (
                    <tr key={tool} className="border-t border-gray-50">
                      <td className="py-2 pr-3 text-gray-700">{t(`personal.tool_${tool}`)}</td>
                      {ALL_ROLES.map((r) => (
                        <td key={r} className="py-2 px-2 text-center">
                          {canAccessTool(r, tool) ? (
                            <Check
                              className="w-3.5 h-3.5 text-emerald-600 inline"
                              aria-label={t("personal.matrixAllowed")}
                            />
                          ) : (
                            <Minus className="w-3.5 h-3.5 text-gray-300 inline" aria-hidden="true" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
