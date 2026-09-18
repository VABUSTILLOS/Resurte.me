"use client"

// ============================================================
// WhatsApp del restaurante: conexión WABA + curaduría ORDENABLE
// del catálogo (lo que take.app no permite: elegir qué productos
// aparecen y en qué orden) + sincronización al catálogo nativo.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  getFoodosPanelData,
  getWhatsAppConnection,
  saveWhatsAppConnection,
  deleteWhatsAppConnection,
  setItemWhatsAppVisible,
  reorderWhatsAppCatalog,
  syncWhatsAppCatalog,
  sendCatalogToCustomer,
  setAutoReplyCatalog,
  broadcastWhatsAppSegment,
} from "../actions"
import { formatMoney } from "@/lib/foodos"
import { orderedWhatsAppItems } from "@/lib/foodos-whatsapp"
import type {
  FoodosCustomerSegment,
  FoodosMenuItem,
  FoodosRestaurant,
  FoodosWhatsAppConnection,
} from "@/types/foodos"
import {
  MessageCircle, Loader2, CheckCircle2, XCircle, ArrowUp, ArrowDown,
  RefreshCw, Trash2, ExternalLink, Eye, EyeOff, Send, Megaphone, Zap,
} from "lucide-react"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"

export default function WhatsAppPage() {
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [items, setItems] = useState<FoodosMenuItem[]>([])
  const [connection, setConnection] = useState<FoodosWhatsAppConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // Form de conexión
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [wabaId, setWabaId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [showForm, setShowForm] = useState(false)

  // Fase 2: envío directo, auto-respuesta y broadcast
  const [sendPhone, setSendPhone] = useState("")
  const [sendingCatalog, setSendingCatalog] = useState(false)
  const [autoReply, setAutoReply] = useState(false)
  const [autoReplyText, setAutoReplyText] = useState("")
  const [bcSegment, setBcSegment] = useState<FoodosCustomerSegment | "all">("all")
  const [bcTemplate, setBcTemplate] = useState("")
  const [bcLang, setBcLang] = useState("es_MX")
  const [broadcasting, setBroadcasting] = useState(false)

  const load = useCallback(async () => {
    try {
      const { restaurant: r, items: its } = await getFoodosPanelData()
      setRestaurant(r)
      setItems(its)
      if (r) {
        const conn = await getWhatsAppConnection(r.id)
        setConnection(conn)
        if (conn) {
          setPhoneNumberId(conn.phone_number_id)
          setWabaId(conn.waba_id)
          setAutoReply(Boolean((conn as { auto_reply_catalog?: boolean }).auto_reply_catalog))
          setAutoReplyText((conn as { auto_reply_text?: string | null }).auto_reply_text ?? "")
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  // Curaduría: visibles ordenados + resto del menú
  const curated = useMemo(() => orderedWhatsAppItems(items), [items])
  const notCurated = useMemo(
    () => items.filter((i) => !i.whatsapp_visible && i.is_available),
    [items]
  )

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurant) return
    setSaving(true)
    setMessage(null)
    try {
      const result = await saveWhatsAppConnection({
        restaurant_id: restaurant.id,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        access_token: accessToken,
      })
      setMessage(
        result.status === "connected"
          ? { ok: true, text: "¡Conectado! Tu WhatsApp Business quedó verificado." }
          : { ok: false, text: `No se pudo verificar: ${result.detail ?? "revisa las credenciales"}` }
      )
      setAccessToken("")
      setShowForm(result.status !== "connected")
      await load()
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Error al conectar" })
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleItem(item: FoodosMenuItem) {
    if (!restaurant) return
    const next = !item.whatsapp_visible
    // Al activar: va al final de la curaduría. Al quitar: pierde posición.
    await setItemWhatsAppVisible(item.id, next, next ? curated.length + 1 : null)
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, whatsapp_visible: next, whatsapp_position: next ? curated.length + 1 : null }
          : i
      )
    )
  }

  async function move(item: FoodosMenuItem, delta: -1 | 1) {
    if (!restaurant) return
    const ids = curated.map((i) => i.id)
    const idx = ids.indexOf(item.id)
    const swap = idx + delta
    if (idx < 0 || swap < 0 || swap >= ids.length) return
    const a = ids[idx]
    const b = ids[swap]
    if (a === undefined || b === undefined) return
    ids[idx] = b
    ids[swap] = a
    await reorderWhatsAppCatalog(restaurant.id, ids)
    setItems((prev) => prev.map((i) => {
      const pos = ids.indexOf(i.id)
      return pos >= 0 ? { ...i, whatsapp_visible: true, whatsapp_position: pos + 1 } : i
    }))
  }

  async function handleSendCatalog(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurant) return
    setSendingCatalog(true)
    setMessage(null)
    try {
      await sendCatalogToCustomer(restaurant.id, sendPhone)
      setMessage({ ok: true, text: `Catálogo ordenado enviado a ${sendPhone}.` })
      setSendPhone("")
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Error al enviar" })
    } finally {
      setSendingCatalog(false)
    }
  }

  async function handleToggleAutoReply(next: boolean) {
    if (!restaurant) return
    setAutoReply(next)
    await setAutoReplyCatalog(restaurant.id, next, autoReplyText || null)
  }

  async function handleSaveAutoReplyText() {
    if (!restaurant) return
    await setAutoReplyCatalog(restaurant.id, autoReply, autoReplyText || null)
    setMessage({ ok: true, text: "Auto-respuesta actualizada." })
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurant) return
    setBroadcasting(true)
    setMessage(null)
    try {
      const { sent, failed } = await broadcastWhatsAppSegment({
        restaurant_id: restaurant.id,
        segment: bcSegment,
        template_name: bcTemplate,
        language_code: bcLang,
      })
      setMessage({ ok: failed === 0, text: `Broadcast enviado: ${sent} entregados${failed ? `, ${failed} fallidos` : ""}.` })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Error en el broadcast" })
    } finally {
      setBroadcasting(false)
    }
  }

  async function handleSync() {
    if (!restaurant) return
    setSyncing(true)
    setMessage(null)
    try {
      const { added, removed } = await syncWhatsAppCatalog(restaurant.id)
      setMessage({
        ok: true,
        text: `Catálogo sincronizado: ${added} productos en WhatsApp${removed ? ` (${removed} eliminados)` : ""}.`,
      })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Error al sincronizar" })
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#0E7A0E]" />
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="font-semibold text-gray-900">Primero crea tu restaurante</h2>
        <p className="text-sm text-gray-500 mt-1">
          Ve a <Link href="/panel/foodos/restaurante" className="text-[#0E7A0E] font-semibold hover:underline">Mi restaurante</Link>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp del restaurante</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tu catálogo nativo de WhatsApp, <strong>ordenado a tu manera</strong>: tú eliges qué
          platillos aparecen y en qué orden (otras plataformas solo muestran los últimos).
        </p>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${message.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conexión */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[#0E7A0E]" />
              Conexión WhatsApp Business
            </h2>
            {connection && (
              <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
                connection.status === "connected" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              }`}>
                {connection.status === "connected" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {connection.status === "connected" ? "Conectado" : "Error"}
              </span>
            )}
          </div>

          {connection && !showForm ? (
            <div className="space-y-3">
              <div className="text-sm text-gray-600 space-y-1">
                <p><span className="text-gray-400">Número:</span> {connection.display_phone ?? connection.phone_number_id}</p>
                <p><span className="text-gray-400">WABA:</span> <span className="font-mono text-xs">{connection.waba_id}</span></p>
                {connection.status === "error" && (
                  <p className="text-red-600 text-xs">{connection.status_detail}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowForm(true)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Actualizar credenciales
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("¿Desconectar tu WhatsApp?")) return
                    await deleteWhatsAppConnection(restaurant.id)
                    setConnection(null)
                    setAccessToken("")
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" /> Desconectar
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleConnect} className="space-y-3">
              <input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value.replace(/\D/g, ""))}
                placeholder="Phone Number ID"
                inputMode="numeric"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
              />
              <input
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value.replace(/\D/g, ""))}
                placeholder="WhatsApp Business Account ID (WABA)"
                inputMode="numeric"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
              />
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Access token (permanente)"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
              />
              <button
                type="submit"
                disabled={saving || !phoneNumberId || !wabaId || !accessToken}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-40"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Verificar y conectar
              </button>
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer font-semibold text-gray-600">¿Dónde consigo estas credenciales?</summary>
                <ol className="list-decimal ml-4 mt-2 space-y-1">
                  <li>Entra a <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-[#0E7A0E] underline inline-flex items-center gap-0.5">developers.facebook.com <ExternalLink className="w-3 h-3" /></a> y crea una app tipo <em>Business</em>.</li>
                  <li>Agrega el producto <strong>WhatsApp</strong> y vincula tu número.</li>
                  <li>En <em>WhatsApp → Configuración de la API</em> copia el <strong>Phone Number ID</strong> y el <strong>WABA ID</strong>.</li>
                  <li>Genera un token <strong>permanente</strong> (System User) con permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>.</li>
                  <li>Configura el webhook de esa app apuntando a tu dominio (<code>/api/whatsapp/webhook</code>) para recibir mensajes.</li>
                </ol>
              </details>
            </form>
          )}
        </div>

        {/* Curaduría ordenable */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-900">Catálogo de WhatsApp</h2>
            <span className="text-xs text-gray-400">{curated.length} de {items.filter((i) => i.is_available).length} platillos</span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Solo aparecen los que actives, <strong>en este orden exacto</strong>.
          </p>

          {curated.length > 0 && (
            <div className="space-y-1.5 mb-4">
              {curated.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2 rounded-xl border border-[#0E7A0E]/20 bg-[#F0FDF4] px-3 py-2">
                  <span className="w-6 text-xs font-black text-[#0E7A0E]">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">{formatMoney(item.price)}</p>
                  </div>
                  <button onClick={() => move(item, -1)} disabled={idx === 0} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label={`Subir ${item.name}`}>
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => move(item, 1)} disabled={idx === curated.length - 1} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label={`Bajar ${item.name}`}>
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleToggleItem(item)} className="p-1.5 text-[#0E7A0E]" title="Quitar del catálogo" aria-label={`Quitar ${item.name} del catálogo`}>
                    <EyeOff className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {notCurated.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 mb-2">Disponibles para agregar</p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {notCurated.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-xl border border-gray-100 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-600 truncate">{item.name}</p>
                      <p className="text-xs text-gray-400">{formatMoney(item.price)}</p>
                    </div>
                    <button onClick={() => handleToggleItem(item)} className="p-1.5 text-gray-400 hover:text-[#0E7A0E]" title="Agregar al catálogo" aria-label={`Agregar ${item.name} al catálogo`}>
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            onClick={handleSync}
            disabled={syncing || connection?.status !== "connected" || curated.length === 0}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0F7A3D] text-white text-sm font-bold hover:bg-[#0B5C2E] disabled:opacity-40"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sincronizar catálogo a WhatsApp
          </button>
          {connection?.status !== "connected" && (
            <p className="mt-2 text-[11px] text-gray-400 text-center">Conecta tu WhatsApp Business para sincronizar.</p>
          )}
        </div>
      </div>

      {/* Envío directo + auto-respuesta */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
            <Send className="w-5 h-5 text-[#0E7A0E]" />
            Enviar catálogo ordenado
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Mensaje interactivo con tus platillos <strong>en el orden exacto de tu curaduría</strong> (este orden sí lo respetamos al 100%).
          </p>
          <form onSubmit={handleSendCatalog} className="flex gap-2">
            <input
              value={sendPhone}
              onChange={(e) => setSendPhone(e.target.value)}
              placeholder="Teléfono del cliente (10 dígitos)"
              inputMode="tel"
              className="flex-1 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
            />
            <button
              type="submit"
              disabled={sendingCatalog || connection?.status !== "connected" || curated.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-40"
            >
              {sendingCatalog ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-gray-100">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Zap className="w-4 h-4 text-amber-500" />
                Auto-responder con el catálogo
              </span>
              <input
                type="checkbox"
                checked={autoReply}
                onChange={(e) => handleToggleAutoReply(e.target.checked)}
                disabled={connection?.status !== "connected"}
                className="accent-[#0E7A0E] w-5 h-5"
              />
            </label>
            <p className="text-xs text-gray-400 mt-1">
              Cuando un cliente escriba a tu número, recibe el menú ordenado automáticamente.
            </p>
            {autoReply && (
              <div className="mt-2 flex gap-2">
                <input
                  value={autoReplyText}
                  onChange={(e) => setAutoReplyText(e.target.value)}
                  placeholder="Texto del mensaje (opcional)"
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
                <button onClick={handleSaveAutoReplyText} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-semibold">
                  Guardar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Broadcast */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
            <Megaphone className="w-5 h-5 text-[#0E7A0E]" />
            Broadcast a clientes
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Plantilla aprobada en tu WABA, enviada a un segmento de tu CRM.
          </p>
          <form onSubmit={handleBroadcast} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={bcSegment}
                onChange={(e) => setBcSegment(e.target.value as FoodosCustomerSegment | "all")}
                className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
              >
                <option value="all">Todos los clientes</option>
                <option value="vip">Solo VIP</option>
                <option value="recurrente">Recurrentes</option>
                <option value="nuevo">Nuevos</option>
                <option value="inactivo">Inactivos (win-back)</option>
              </select>
              <input
                value={bcLang}
                onChange={(e) => setBcLang(e.target.value)}
                placeholder="Idioma (es_MX)"
                className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono"
              />
            </div>
            <input
              value={bcTemplate}
              onChange={(e) => setBcTemplate(e.target.value)}
              placeholder="Nombre de la plantilla (aprobada en tu WABA)"
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
            />
            <button
              type="submit"
              disabled={broadcasting || connection?.status !== "connected" || !bcTemplate.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-40"
            >
              {broadcasting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
              Enviar broadcast
            </button>
            <p className="text-[11px] text-gray-400">
              Las plantillas se crean y aprueban en tu cuenta de Meta (WhatsApp → Plantillas de mensaje).
            </p>
          </form>
        </div>
      </div>

      <ToolGuideHost toolKey="whatsapp" pathname="/panel/foodos/whatsapp" slug={null} icon="💬" title="WhatsApp del restaurante" />
    </div>
  )
}
