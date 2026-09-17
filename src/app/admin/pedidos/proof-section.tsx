"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Loader2, Trash2, X } from "lucide-react"
import {
  DELIVERY_PROOF_ACCEPT_ATTR,
  DELIVERY_PROOF_MAX_BYTES,
  validateDeliveryProofFile,
} from "@/lib/delivery-proof"

type Props = {
  orderId: number
  /** Ruta del objeto en el bucket privado, o null si el pedido no tiene. */
  proofPath: string | null
  /** Estado del pedido: un pedido cancelado no admite comprobante. */
  status: string
  /** Se llama tras subir o quitar, para refrescar la lista y el pedido abierto. */
  onChanged: () => void
}

/**
 * Comprobante de entrega del pedido (migración 00154).
 *
 * La foto se sube a un bucket privado y la base guarda solo la ruta; la URL
 * se firma al leer. Por eso este bloque no puede pintar un `<img src>` con el
 * valor de la columna: pide la URL firmada y la usa mientras vive.
 *
 * Subir la foto NO cambia el estado del pedido. Es evidencia, no permiso:
 * el admin puede cerrar el pedido sin foto y adjuntarla después. Lo único
 * que se bloquea es adjuntarla a un pedido cancelado, donde sería una
 * contradicción.
 */
export function ProofSection({ orderId, proofPath, status, onChanged }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [uploadedAt, setUploadedAt] = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingNote, setPendingNote] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const loadProof = useCallback(async () => {
    if (!proofPath) {
      setUrl(null)
      setNote(null)
      setUploadedAt(null)
      return
    }
    setLoadingUrl(true)
    try {
      const res = await fetch(`/api/orders/${orderId}/proof`)
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "No se pudo abrir el comprobante")
        return
      }
      setUrl(data?.url ?? null)
      setNote(data?.note ?? null)
      setUploadedAt(data?.at ?? null)
    } catch {
      setError("No se pudo abrir el comprobante")
    } finally {
      setLoadingUrl(false)
    }
  }, [orderId, proofPath])

  useEffect(() => {
    void Promise.resolve().then(loadProof)
  }, [loadProof])

  async function upload(file: File) {
    const check = validateDeliveryProofFile(file)
    if (!check.ok) {
      setError(check.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      if (pendingNote.trim()) form.append("note", pendingNote.trim())
      const res = await fetch(`/api/admin/orders/${orderId}/proof`, {
        method: "POST",
        body: form,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "No se pudo subir la foto")
        return
      }
      setPendingNote("")
      if (fileRef.current) fileRef.current.value = ""
      onChanged()
      await loadProof()
    } catch {
      setError("No se pudo subir la foto")
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm("¿Quitar el comprobante de entrega de este pedido?")) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/proof`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "No se pudo quitar el comprobante")
        return
      }
      setUrl(null)
      setNote(null)
      setUploadedAt(null)
      onChanged()
    } catch {
      setError("No se pudo quitar el comprobante")
    } finally {
      setBusy(false)
    }
  }

  const cancelled = status === "cancelled"

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Camera className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-700">Comprobante de entrega</span>
        {proofPath ? (
          <span className="ml-auto text-[10px] font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
            Adjunto
          </span>
        ) : (
          <span className="ml-auto text-[10px] font-medium text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">
            Sin comprobante
          </span>
        )}
      </div>

      {proofPath ? (
        <div className="space-y-2">
          {loadingUrl ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando comprobante…
            </div>
          ) : url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg border border-gray-200 bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de vida corta: next/image no puede optimizarla ni cachearla */}
              <img
                src={url}
                alt="Comprobante de entrega"
                className="w-full max-h-56 object-contain bg-white"
              />
              <span className="block px-2 py-1.5 text-[11px] font-medium text-blue-700 border-t border-gray-100">
                Ver en tamaño completo ↗
              </span>
            </a>
          ) : (
            <p className="text-xs text-amber-700">
              No se pudo generar la vista previa del comprobante.
            </p>
          )}
          {uploadedAt && (
            <p className="text-[11px] text-gray-400">
              Subido el {new Date(uploadedAt).toLocaleString("es-MX")}
            </p>
          )}
          {note && <p className="text-xs text-gray-600 whitespace-pre-wrap">{note}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Quitar comprobante
          </button>
        </div>
      ) : cancelled ? (
        <p className="text-xs text-gray-400">
          El pedido está cancelado: no hay entrega que comprobar.
        </p>
      ) : (
        <div className="space-y-2">
          <input
            ref={fileRef}
            id={`proof-file-${orderId}`}
            type="file"
            accept={DELIVERY_PROOF_ACCEPT_ATTR}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
            }}
            className="block w-full text-[11px] text-gray-600 file:mr-2 file:px-2.5 file:py-1.5 file:rounded-lg file:border-0 file:text-[11px] file:font-medium file:bg-gray-900 file:text-white hover:file:bg-gray-800 file:cursor-pointer disabled:opacity-50"
          />
          <input
            id={`proof-note-${orderId}`}
            type="text"
            value={pendingNote}
            maxLength={200}
            disabled={busy}
            onChange={(e) => setPendingNote(e.target.value)}
            placeholder="Nota opcional (quién recibió, incidencia…)"
            className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
          />
          <p className="text-[10px] text-gray-400">
            JPG, PNG o WebP · máximo {Math.round(DELIVERY_PROOF_MAX_BYTES / (1024 * 1024))} MB. No
            cambia el estado del pedido.
          </p>
          {busy && (
            <p className="flex items-center gap-2 text-[11px] text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Subiendo…
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-[11px] text-red-600">
          <X className="w-3 h-3 mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
