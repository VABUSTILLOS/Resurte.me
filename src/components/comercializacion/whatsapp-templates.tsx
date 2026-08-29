"use client"

import { useEffect, useState } from "react"
import { MessageCircle, Settings2, Trash2, Plus } from "lucide-react"
import { Modal, Button, Input, TextArea } from "./ui"
import { buildWhatsappLink } from "@/lib/comercializacion/whatsapp"
import {
  DEFAULT_TEMPLATES,
  loadTemplates,
  saveTemplates,
  renderTemplate,
  type WhatsappTemplate,
  type TemplateVars,
} from "@/lib/comercializacion/templates"

/**
 * Botón de WhatsApp con selector de plantilla. Al elegir una plantilla abre
 * wa.me con el mensaje renderizado y notifica vía onUsed (p. ej. para
 * registrar la actividad).
 */
export function WhatsappTemplateMenu({
  phone,
  vars,
  onUsed,
  variant = "icon",
}: {
  phone: string | null | undefined
  vars: TemplateVars
  onUsed?: () => void
  variant?: "icon" | "button"
}) {
  const [open, setOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const [templates, setTemplates] = useState<WhatsappTemplate[]>(DEFAULT_TEMPLATES)

  // Carga desde localStorage al montar (diferido para evitar set-state-in-effect).
  useEffect(() => {
    const timeout = setTimeout(() => setTemplates(loadTemplates()), 0)
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("click", onClick)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("click", onClick)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (!phone) return null

  function pick(t: WhatsappTemplate) {
    const link = buildWhatsappLink(phone, renderTemplate(t.body, vars))
    if (link) window.open(link, "_blank", "noopener,noreferrer")
    setOpen(false)
    onUsed?.()
  }

  function persist(next: WhatsappTemplate[]) {
    setTemplates(next)
    saveTemplates(next)
  }

  return (
    <span className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      {variant === "icon" ? (
        <button
          onClick={() => setOpen(!open)}
          className="p-2 rounded-xl text-[#128C4A] hover:bg-[#25D366]/10 transition-colors"
          title="WhatsApp (elegir plantilla)"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MessageCircle className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#25D366]/15 text-[#128C4A] px-3 py-1.5 rounded-xl hover:bg-[#25D366]/25 transition-colors"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          WhatsApp
        </button>
      )}

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden"
        >
          <p className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            Plantilla de WhatsApp
          </p>
          {templates.map((t) => (
            <button
              key={t.id}
              role="menuitem"
              onClick={() => pick(t)}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
            >
              <p className="text-sm font-medium text-gray-900">{t.label}</p>
              <p className="text-xs text-gray-500 line-clamp-2">
                {renderTemplate(t.body, vars)}
              </p>
            </button>
          ))}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setManaging(true)
            }}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 border-t border-gray-100"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Gestionar plantillas…
          </button>
        </div>
      ) : null}

      <Modal
        open={managing}
        onClose={() => setManaging(false)}
        title="Plantillas de WhatsApp"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Usa <code className="bg-gray-100 px-1 rounded">{"{nombre}"}</code>,{" "}
            <code className="bg-gray-100 px-1 rounded">{"{restaurante}"}</code> y{" "}
            <code className="bg-gray-100 px-1 rounded">{"{vendedor}"}</code> como
            placeholders. Se guardan en tu navegador.
          </p>
          {templates.map((t, idx) => (
            <div key={t.id} className="rounded-xl border border-gray-100 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={t.label}
                  onChange={(e) =>
                    persist(
                      templates.map((x, i) =>
                        i === idx ? { ...x, label: e.target.value } : x
                      )
                    )
                  }
                  placeholder="Nombre de la plantilla"
                />
                <button
                  onClick={() => persist(templates.filter((_, i) => i !== idx))}
                  className="p-2 rounded-xl text-red-500 hover:bg-red-50 transition-colors shrink-0"
                  title="Eliminar plantilla"
                  disabled={templates.length <= 1}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <TextArea
                rows={4}
                value={t.body}
                onChange={(e) =>
                  persist(
                    templates.map((x, i) =>
                      i === idx ? { ...x, body: e.target.value } : x
                    )
                  )
                }
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => persist([...DEFAULT_TEMPLATES])}
            >
              Restablecer
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  persist([
                    ...templates,
                    {
                      id: `t-${Date.now()}`,
                      label: "Nueva plantilla",
                      body: "¡Hola, {nombre}! 👋",
                    },
                  ])
                }
              >
                <Plus className="w-4 h-4" />
                Nueva
              </Button>
              <Button onClick={() => setManaging(false)}>Listo</Button>
            </div>
          </div>
        </div>
      </Modal>
    </span>
  )
}
