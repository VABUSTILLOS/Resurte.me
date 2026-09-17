/**
 * Adaptador de Google Wallet.
 *
 * Google no pide un archivo firmado como Apple: pide un **JWT firmado con
 * RS256** que se mete en una URL de guardado
 * (`https://pay.google.com/gp/v/save/<jwt>`). El comensal abre la URL y Google
 * crea el pase en su cuenta. Eso sí se puede hacer entero con `node:crypto`,
 * sin certificados intermedios ni CMS.
 *
 * Como Apple, las credenciales son de **plataforma**: es el pase de Resurte
 * con la marca del restaurante encima. Sin la cuenta de servicio, el módulo
 * devuelve `null` y la tarjeta web hace el trabajo.
 *
 * Referencia: "JWT" en la documentación de Google Wallet (generic pass con
 * `loyaltyObjects`/`loyaltyClass`). El `classId` debe existir antes de emitir
 * el objeto; aquí se envía también el `loyaltyClass` en línea para que Google
 * lo cree si aún no existe.
 */

import { createSign } from "node:crypto"
import { logger } from "@/lib/logger"
import type { WalletCard } from "./card"

export type Env = Record<string, string | undefined>

export interface GoogleWalletConfig {
  issuerId: string
  /** Sufijo del `classId`; agrupa las tarjetas de todos los restaurantes. */
  classSuffix: string
  serviceAccountEmail: string
  privateKeyPem: string
}

const SAVE_ORIGIN = "https://pay.google.com/gp/v/save"
const AUDIENCE = "google"
const DEFAULT_CLASS_SUFFIX = "foodos_loyalty"

function pem(value: string | undefined): string {
  return (value ?? "").trim().replace(/\\n/g, "\n")
}

export function googleWalletConfig(env: Env = process.env): GoogleWalletConfig | null {
  if ((env.GOOGLE_WALLET_ENABLED ?? "").trim().toLowerCase() === "false") return null

  const issuerId = (env.GOOGLE_WALLET_ISSUER_ID ?? "").trim()
  const serviceAccountEmail = (env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL ?? "").trim()
  const privateKeyPem = pem(env.GOOGLE_WALLET_PRIVATE_KEY)
  const classSuffix = (env.GOOGLE_WALLET_CLASS_SUFFIX ?? "").trim() || DEFAULT_CLASS_SUFFIX

  if (!issuerId || !serviceAccountEmail || !privateKeyPem) return null

  return { issuerId, classSuffix, serviceAccountEmail, privateKeyPem }
}

export function isGoogleWalletConfigured(env: Env = process.env): boolean {
  return googleWalletConfig(env) !== null
}

// ------------------------------------------------------------
// JWT
// ------------------------------------------------------------

/** `base64url` sin relleno, como exige JWT. */
export function base64url(input: string | Uint8Array): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input)
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export interface JwtParts {
  header: Record<string, unknown>
  payload: Record<string, unknown>
}

/**
 * Ensambla y firma un JWT RS256. `sign` es inyectable para poder probar el
 * formato sin una llave real.
 */
export function signJwt(
  parts: JwtParts,
  privateKeyPem: string,
  sign?: (payload: string, key: string) => string
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", ...parts.header }))
  const payload = base64url(JSON.stringify(parts.payload))
  const body = `${header}.${payload}`
  const signature = sign
    ? sign(body, privateKeyPem)
    : createSign("RSA-SHA256").update(body).sign(privateKeyPem, "base64url")
  return `${body}.${signature}`
}

// ------------------------------------------------------------
// Objeto de lealtad
// ------------------------------------------------------------

/** `classId` de la tarjeta (compartido por todos los restaurantes). */
export function loyaltyClassId(config: GoogleWalletConfig): string {
  return `${config.issuerId}.${config.classSuffix}`
}

/** `objectId`: único por pase. */
export function loyaltyObjectId(config: GoogleWalletConfig, serial: string): string {
  return `${config.issuerId}.${serial}`
}

/** El `loyaltyClass` en línea: permite crear el pase sin pre-registrar la clase. */
export function buildLoyaltyClass(config: GoogleWalletConfig): Record<string, unknown> {
  return {
    id: loyaltyClassId(config),
    issuerName: "Resurte.me",
    reviewStatus: "UNDER_REVIEW",
    programName: "Tarjeta de lealtad",
    hexBackgroundColor: "#0E7A0E",
  }
}

/**
 * El `loyaltyObject`. Los colores van en formato `#rrggbb` (Google no acepta
 * `rgb()` como Apple), así que aquí no se usa `toRgbString`.
 */
export function buildLoyaltyObject(
  card: WalletCard,
  config: GoogleWalletConfig
): Record<string, unknown> {
  const textModules: Record<string, unknown>[] = [
    { id: "points", header: card.labels.points, body: card.primary },
  ]
  if (card.secondary) {
    textModules.push({ id: "value", header: card.labels.value, body: card.secondary })
  }
  if (card.rewardText) {
    textModules.push({ id: "reward", header: card.labels.reward, body: card.rewardText })
  }

  return {
    id: loyaltyObjectId(config, card.serial),
    classId: loyaltyClassId(config),
    state: "ACTIVE",
    accountName: card.header,
    accountId: card.serial,
    loyaltyPoints: {
      label: card.labels.points,
      balance: { int: card.points },
    },
    hexBackgroundColor: card.backgroundColor,
    barcode: {
      type: "QR_CODE",
      value: card.barcode.message,
      alternateText: card.barcode.altText,
    },
    textModulesData: textModules,
  }
}

// ------------------------------------------------------------
// URL de guardado
// ------------------------------------------------------------

export interface GoogleSaveUrlDeps {
  now?: () => number
  sign?: (payload: string, key: string) => string
}

/**
 * URL de "Guardar en Google Wallet". Devuelve `null` si algo falla: una URL
 * rota es peor que no ofrecer el botón.
 */
export function buildGoogleSaveUrl(
  card: WalletCard,
  config: GoogleWalletConfig,
  deps: GoogleSaveUrlDeps = {}
): string | null {
  try {
    const now = deps.now ?? Date.now
    const iat = Math.floor(now() / 1000)
    const jwt = signJwt(
      {
        header: {},
        payload: {
          iss: config.serviceAccountEmail,
          aud: AUDIENCE,
          typ: "savetowallet",
          iat,
          origins: [],
          payload: {
            loyaltyClasses: [buildLoyaltyClass(config)],
            loyaltyObjects: [buildLoyaltyObject(card, config)],
          },
        },
      },
      config.privateKeyPem,
      deps.sign
    )
    return `${SAVE_ORIGIN}/${jwt}`
  } catch (err) {
    logger.warn("[Wallet] No se pudo firmar el pase de Google", { error: String(err) })
    return null
  }
}
