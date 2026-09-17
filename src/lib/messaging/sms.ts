// ============================================================
// Adaptador de SMS.
//
// El SMS es una capacidad de PLATAFORMA (variables de entorno), no por
// restaurante: guardar credenciales de Twilio por restaurante obligaría a
// cifrado por inquilino y a un flujo de alta que esta fase no necesita.
//
// Si no hay credenciales, `resolveSmsAdapter()` devuelve `null` y todo el
// marketing sigue funcionando por WhatsApp. Nada se rompe por no tener SMS.
// ============================================================

import { logger } from "@/lib/logger"

export interface SmsMessage {
  to: string
  text: string
}

export type SmsResult =
  | { ok: true; provider: string; id: string | null }
  | { ok: false; provider: string | null; error: string }

export interface SmsAdapter {
  /** Identificador del proveedor, se persiste en `foodos_campaigns.provider`. */
  readonly id: string
  send(message: SmsMessage): Promise<SmsResult>
}

type Env = Record<string, string | undefined>

function envValue(env: Env, key: string): string {
  return (env[key] ?? "").trim()
}

/**
 * Normaliza a E.164. Devuelve `null` si el número no es usable.
 *
 * WhatsApp guarda los teléfonos como dígitos sueltos (a veces sin lada),
 * y Twilio rechaza todo lo que no sea E.164, así que la conversión tiene
 * que ser explícita y fallar en vez de mandar a un número equivocado.
 */
export function toE164(
  raw: string | null | undefined,
  defaultCountry = "52"
): string | null {
  const value = (raw ?? "").trim()
  if (!value) return null

  const explicit = value.startsWith("+")
  const digits = value.replace(/\D/g, "")
  if (!digits) return null

  if (explicit) {
    // Ya trae lada internacional; se valida el largo mínimo razonable.
    return digits.length >= 11 ? `+${digits}` : null
  }
  if (digits.length === 10) return `+${defaultCountry}${digits}`
  if (digits.length === 12 && digits.startsWith("52")) return `+${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  if (digits.length >= 11) return `+${digits}`
  // Menos de 10 dígitos sin lada: no hay forma de saber a qué país va.
  return null
}

interface TwilioConfig {
  accountSid: string
  authToken: string
  from: string
  defaultCountry: string
  timeoutMs: number
}

function twilioConfig(env: Env): TwilioConfig | null {
  const accountSid = envValue(env, "TWILIO_ACCOUNT_SID")
  const authToken = envValue(env, "TWILIO_AUTH_TOKEN")
  const from = envValue(env, "TWILIO_FROM")
  if (!accountSid || !authToken || !from) return null
  const timeoutRaw = Number(envValue(env, "SMS_TIMEOUT_MS"))
  return {
    accountSid,
    authToken,
    from,
    defaultCountry: envValue(env, "SMS_DEFAULT_COUNTRY") || "52",
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 10_000,
  }
}

function createTwilioAdapter(config: TwilioConfig): SmsAdapter {
  return {
    id: "twilio",
    async send({ to, text }): Promise<SmsResult> {
      const e164 = toE164(to, config.defaultCountry)
      if (!e164) {
        return { ok: false, provider: "twilio", error: "Teléfono no válido" }
      }

      const body = new URLSearchParams({ To: e164, Body: text })
      // `TWILIO_FROM` puede ser un número (+52...) o un Messaging Service (MG...).
      if (config.from.startsWith("MG")) body.set("MessagingServiceSid", config.from)
      else body.set("From", config.from)

      try {
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
            signal: AbortSignal.timeout(config.timeoutMs),
          }
        )
        if (!res.ok) {
          const detail = await res.text().catch(() => "")
          logger.warn("[SMS] Twilio rechazó el envío", {
            status: res.status,
            detail: detail.slice(0, 300),
          })
          return {
            ok: false,
            provider: "twilio",
            error: `Twilio ${res.status}`,
          }
        }
        const json = (await res.json().catch(() => null)) as { sid?: string } | null
        return { ok: true, provider: "twilio", id: json?.sid ?? null }
      } catch (err) {
        // Se registra el mensaje del error, nunca el cuerpo del SMS ni el número.
        logger.warn("[SMS] Falló el envío por Twilio", {
          error: err instanceof Error ? err.message : String(err),
        })
        return {
          ok: false,
          provider: "twilio",
          error: err instanceof Error ? err.message : "Error de red",
        }
      }
    },
  }
}

/** Adaptador activo o `null` si el SMS no está configurado/deshabilitado. */
export function resolveSmsAdapter(env: Env = process.env): SmsAdapter | null {
  if (envValue(env, "SMS_ENABLED").toLowerCase() === "false") return null
  const provider = (envValue(env, "SMS_PROVIDER") || "twilio").toLowerCase()
  if (provider !== "twilio") return null
  const config = twilioConfig(env)
  return config ? createTwilioAdapter(config) : null
}

export function isSmsConfigured(env: Env = process.env): boolean {
  return resolveSmsAdapter(env) !== null
}
