/**
 * Plantillas de WhatsApp personalizables del vendedor. Viven en localStorage
 * (navegador del vendedor), no en la base de datos. Placeholders soportados:
 * {nombre}, {restaurante}, {vendedor}.
 */

export interface WhatsappTemplate {
  id: string
  label: string
  body: string
}

export interface TemplateVars {
  nombre?: string | null
  restaurante?: string | null
  vendedor?: string | null
}

const STORAGE_KEY = "resurte_crm_wa_templates"

export const DEFAULT_TEMPLATES: WhatsappTemplate[] = [
  {
    id: "primer-contacto",
    label: "Primer contacto",
    body: "¡Hola, {nombre}! 👋 Soy {vendedor}, asesor de Resurte.me, especialista en proveeduría para {restaurante}.\n\nTe compartimos nuestro catálogo de insumos para restaurantes con los mejores precios de mayoreo. ¿Te interesa recibir tu lista semanal?",
  },
  {
    id: "recordatorio-semanal",
    label: "Recordatorio semanal",
    body: "¡Hola, {restaurante}! 👋 Soy {vendedor}, tu asesor de Resurte.me.\n\nTe recordamos que esta semana es momento de tu pedido de insumos. 🛒\n\n¿Te armo tu lista o prefieres pedir tú directo en resurte.me?",
  },
  {
    id: "seguimiento",
    label: "Seguimiento",
    body: "¡Hola, {nombre}! 👋 Soy {vendedor} de Resurte.me.\n\nQuedo al pendiente de tu pedido de esta semana para {restaurante}. ¿Te paso la lista o alguna cotización?",
  },
]

export function loadTemplates(): WhatsappTemplate[] {
  if (typeof window === "undefined") return DEFAULT_TEMPLATES
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_TEMPLATES
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TEMPLATES
    return parsed
      .filter(
        (t): t is WhatsappTemplate =>
          !!t && typeof t.id === "string" && typeof t.label === "string" && typeof t.body === "string"
      )
  } catch {
    return DEFAULT_TEMPLATES
  }
}

export function saveTemplates(templates: WhatsappTemplate[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

/** Reemplaza placeholders; si un dato falta, limpia el placeholder. */
export function renderTemplate(body: string, vars: TemplateVars): string {
  const nombre = vars.nombre?.split(" ")[0] || ""
  return body
    .replaceAll("{nombre}", nombre || "buen día")
    .replaceAll("{restaurante}", vars.restaurante || "tu restaurante")
    .replaceAll("{vendedor}", vars.vendedor || "tu asesor")
}
