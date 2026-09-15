/**
 * Clasificación de referrers de asistentes de IA.
 *
 * Objetivo: separar el tráfico que llega *desde* una respuesta de IA del tráfico
 * orgánico normal. Un clic desde ChatGPT o Perplexity significa que el motor
 * citó a Resurte.me y alguien siguió el enlace: es la señal más directa de que
 * el trabajo GEO está funcionando.
 *
 * Limitación conocida: los AI Overviews de Google no envían un referrer
 * distinguible (llegan como `google.com`), así que no se pueden atribuir por
 * esta vía. Para eso hace falta Search Console.
 */

export interface AiEngine {
  /** Identificador estable para GA4 (`ai_engine`). */
  id: string
  /** Nombre legible para el panel interno. */
  label: string
  /** Hosts que este motor usa al enlazar. Sin `www.`, sin ruta. */
  hosts: string[]
}

export const AI_ENGINES: AiEngine[] = [
  { id: "chatgpt", label: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"] },
  { id: "perplexity", label: "Perplexity", hosts: ["perplexity.ai"] },
  { id: "gemini", label: "Gemini", hosts: ["gemini.google.com", "bard.google.com"] },
  { id: "copilot", label: "Microsoft Copilot", hosts: ["copilot.microsoft.com"] },
  { id: "claude", label: "Claude", hosts: ["claude.ai"] },
  { id: "you", label: "You.com", hosts: ["you.com"] },
  { id: "grok", label: "Grok", hosts: ["grok.com"] },
  { id: "deepseek", label: "DeepSeek", hosts: ["chat.deepseek.com"] },
  { id: "mistral", label: "Le Chat", hosts: ["chat.mistral.ai"] },
  { id: "meta-ai", label: "Meta AI", hosts: ["meta.ai"] },
  { id: "poe", label: "Poe", hosts: ["poe.com"] },
  { id: "phind", label: "Phind", hosts: ["phind.com"] },
]

interface AiReferral {
  /** Id del motor en `AI_ENGINES`. */
  engineId: string
  /** Nombre legible del motor. */
  engineLabel: string
  /** Host de origen, normalizado y sin `www.`. */
  host: string
}

/** Quita `www.` y pasa a minúsculas. Devuelve `""` si no hay host. */
export function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "")
}

/**
 * Devuelve el motor de IA del que viene el visitante, o `null` si el referrer
 * no es de un asistente conocido.
 *
 * Acepta tanto una URL completa (`https://chatgpt.com/c/abc`) como un host
 * suelto. Un referrer del propio sitio se trata como tráfico interno.
 */
export function classifyAiReferrer(
  referrer: string | null | undefined,
  selfHosts: string[] = []
): AiReferral | null {
  if (!referrer) return null

  const raw = referrer.trim()
  if (!raw) return null

  let host: string
  try {
    // Sin esquema `new URL` falla, así que se asume https.
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
    host = normalizeHost(url.hostname)
  } catch {
    return null
  }

  if (!host) return null
  if (selfHosts.map(normalizeHost).includes(host)) return null

  const match = AI_ENGINES.find((engine) => engine.hosts.includes(host))
  if (!match) return null

  return { engineId: match.id, engineLabel: match.label, host }
}

/** ¿El host pertenece a un motor de IA conocido? Útil para el panel interno. */
export function isAiHost(host: string): boolean {
  const normalized = normalizeHost(host)
  return AI_ENGINES.some((engine) => engine.hosts.includes(normalized))
}

/**
 * Bloque de detección para inyectar en el navegador. Se genera desde
 * `AI_ENGINES` para que la lista no se duplique en el script inline.
 */
export function buildAiReferralScript(gaId: string, selfHosts: string[]): string {
  const payload = JSON.stringify({
    gaId,
    engines: AI_ENGINES.map((e) => ({ id: e.id, label: e.label, hosts: e.hosts })),
    selfHosts: selfHosts.map(normalizeHost),
  })
  return `(function(){var C=${payload};try{
var h=document.referrer?new URL(document.referrer).hostname.toLowerCase().replace(/^www\\./,''):'';
var self=window.location.hostname.toLowerCase().replace(/^www\\./,'');
if(!h||h===self||C.selfHosts.indexOf(h)>-1)return;
var m=null;for(var i=0;i<C.engines.length;i++){if(C.engines[i].hosts.indexOf(h)>-1){m=C.engines[i];break;}}
if(!m)return;
var p={ai_engine:m.id,ai_engine_label:m.label,ai_referrer_host:h,page_path:window.location.pathname};
window.dataLayer=window.dataLayer||[];window.dataLayer.push({event:'ai_referral',ai_engine:m.id,ai_engine_label:m.label,ai_referrer_host:h,page_path:window.location.pathname});
if(typeof window.gtag==='function'){window.gtag('event','ai_referral',p);}
}catch(e){}})();`
}
