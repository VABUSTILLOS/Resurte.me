/**
 * Adaptador de Apple Wallet (`.pkpass`).
 *
 * Un pase de Apple es un ZIP con `pass.json`, `manifest.json` (SHA-1 de cada
 * archivo), `signature` (PKCS#7 detached de `manifest.json`) y las imágenes.
 * El ZIP y el manifiesto los producimos nosotros; **la firma no**: requiere
 * certificado de Apple, certificado intermedio WWDR y una implementación de
 * CMS/PKCS#7 que Node no trae.
 *
 * Por eso la firma es una **interfaz inyectable** (`ApplePassSigner`). El
 * firmante por defecto invoca `openssl smime -sign` (disponible en un runtime
 * propio o en Docker, no en serverless). Si no hay firmante o falla, el pase
 * devuelve `null` y el producto cae a la tarjeta web con QR, que no necesita
 * certificado alguno.
 *
 * Las credenciales son de **plataforma** (variables de entorno), no por
 * restaurante: es el pase de Resurte, con la marca del restaurante encima.
 */

import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { logger } from "@/lib/logger"
import { toRgbString, type WalletCard } from "./card"
import { buildZip, type ZipEntry } from "./zip"

const execFileAsync = promisify(execFile)

export type Env = Record<string, string | undefined>

export interface AppleWalletConfig {
  passTypeIdentifier: string
  teamIdentifier: string
  /** Certificado del pase (PEM). */
  certPem: string
  /** Llave privada del pase (PEM). */
  keyPem: string
  /** Certificado intermedio WWDR (PEM). */
  wwdrPem: string
  keyPassphrase?: string
}

/**
 * Las PEM se guardan en variables de entorno con `\n` escapados (son
 * multilínea). Aceptamos ambas formas.
 */
function pem(value: string | undefined): string {
  return (value ?? "").trim().replace(/\\n/g, "\n")
}

/** `false` desactiva la emisión aunque haya certificados (kill switch). */
function disabled(env: Env): boolean {
  return (env.APPLE_WALLET_ENABLED ?? "").trim().toLowerCase() === "false"
}

/**
 * Credenciales del pase. Fail-closed: sin los cinco valores no hay Apple
 * Wallet, y eso **no** es un error de la aplicación — es el modo sin
 * certificados, en el que la tarjeta web hace el trabajo.
 */
export function appleWalletConfig(env: Env = process.env): AppleWalletConfig | null {
  if (disabled(env)) return null

  const passTypeIdentifier = (env.APPLE_WALLET_PASS_TYPE_ID ?? "").trim()
  const teamIdentifier = (env.APPLE_WALLET_TEAM_ID ?? "").trim()
  const certPem = pem(env.APPLE_WALLET_CERT)
  const keyPem = pem(env.APPLE_WALLET_KEY)
  const wwdrPem = pem(env.APPLE_WALLET_WWDR)
  const keyPassphrase = (env.APPLE_WALLET_KEY_PASSPHRASE ?? "").trim()

  if (!passTypeIdentifier || !teamIdentifier || !certPem || !keyPem || !wwdrPem) return null

  return {
    passTypeIdentifier,
    teamIdentifier,
    certPem,
    keyPem,
    wwdrPem,
    ...(keyPassphrase ? { keyPassphrase } : {}),
  }
}

export function isAppleWalletConfigured(env: Env = process.env): boolean {
  return appleWalletConfig(env) !== null
}

// ------------------------------------------------------------
// pass.json
// ------------------------------------------------------------

/**
 * `pass.json` en formato `storeCard`: el estilo natural para una tarjeta de
 * lealtad (cabecera = nombre, principal = saldo, auxiliares = recompensa).
 */
export function buildPassJson(card: WalletCard, config: AppleWalletConfig): Record<string, unknown> {
  const pass: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeIdentifier,
    teamIdentifier: config.teamIdentifier,
    serialNumber: card.serial,
    organizationName: card.organizationName,
    description: card.description,
    logoText: card.logoText,
    backgroundColor: toRgbString(card.backgroundColor),
    foregroundColor: card.foregroundColor,
    labelColor: card.labelColor,
    storeCard: {
      headerFields: [{ key: "header", value: card.header }],
      primaryFields: [{ key: "points", value: card.primary, label: card.labels.points }],
      secondaryFields: card.secondary
        ? [{ key: "value", value: card.secondary, label: card.labels.value }]
        : [],
      auxiliaryFields: card.auxiliary.map((value, index) => ({
        key: `aux${index}`,
        value,
        label: index === 0 ? card.labels.reward : "",
      })),
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: card.barcode.message,
        messageEncoding: "iso-8859-1",
        altText: card.barcode.altText,
      },
    ],
  }

  return pass
}

// ------------------------------------------------------------
// Manifest
// ------------------------------------------------------------

/** SHA-1 hex de un archivo, tal como lo exige el manifiesto de Apple. */
export function sha1Hex(data: Uint8Array): string {
  return createHash("sha1").update(data).digest("hex")
}

/** `manifest.json`: nombre de archivo → SHA-1 de su contenido. */
export function buildManifest(files: Map<string, Uint8Array>): Record<string, string> {
  const manifest: Record<string, string> = {}
  for (const [name, data] of files) {
    manifest[name] = sha1Hex(data)
  }
  return manifest
}

// ------------------------------------------------------------
// Firma
// ------------------------------------------------------------

export type ApplePassSigner = (
  manifestJson: string,
  config: AppleWalletConfig
) => Promise<Uint8Array | null>

/**
 * Firmante por defecto: `openssl smime -sign` en modo detached con el
 * certificado, la llave y el WWDR.
 *
 * Escribe las PEM en un directorio temporal efímero, firma y limpia. Si
 * `openssl` no existe o falla, devuelve `null` (y el pase cae a la tarjeta
 * web). Nunca lanza.
 */
export const opensslSigner: ApplePassSigner = async (manifestJson, config) => {
  let dir: string | null = null
  try {
    dir = await mkdtemp(join(tmpdir(), "pkpass-"))
    const certPath = join(dir, "cert.pem")
    const keyPath = join(dir, "key.pem")
    const wwdrPath = join(dir, "wwdr.pem")
    const manifestPath = join(dir, "manifest.json")
    const outPath = join(dir, "signature")

    await Promise.all([
      writeFile(certPath, config.certPem, "utf8"),
      writeFile(keyPath, config.keyPem, "utf8"),
      writeFile(wwdrPath, config.wwdrPem, "utf8"),
      writeFile(manifestPath, manifestJson, "utf8"),
    ])

    const args = [
      "smime",
      "-binary",
      "-sign",
      "-certfile",
      wwdrPath,
      "-signer",
      certPath,
      "-inkey",
      keyPath,
      "-in",
      manifestPath,
      "-out",
      outPath,
      "-outform",
      "DER",
    ]
    if (config.keyPassphrase) args.push("-passin", `pass:${config.keyPassphrase}`)

    await execFileAsync("openssl", args, { timeout: 10_000 })

    const signature = await readFile(outPath)
    return new Uint8Array(signature)
  } catch (err) {
    logger.warn("[Wallet] No se pudo firmar el pase de Apple", { error: String(err) })
    return null
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// ------------------------------------------------------------
// Bundle
// ------------------------------------------------------------

export interface ApplePassInput {
  card: WalletCard
  config: AppleWalletConfig
  /** Imágenes del pase (`icon.png`, `logo.png`…). Sin `icon.png` no es válido. */
  images?: Map<string, Uint8Array>
  signer?: ApplePassSigner
}

/**
 * Arma el `.pkpass` completo. Devuelve `null` si falta la firma o el icono:
 * preferimos no emitir un pase que Apple vaya a rechazar.
 */
export async function buildApplePass(input: ApplePassInput): Promise<Uint8Array | null> {
  const signer = input.signer ?? opensslSigner
  const files = new Map<string, Uint8Array>(input.images ?? [])
  if (!files.has("icon.png")) return null

  const passJson = JSON.stringify(buildPassJson(input.card, input.config))
  files.set("pass.json", new TextEncoder().encode(passJson))

  const manifestJson = JSON.stringify(buildManifest(files))
  const signature = await signer(manifestJson, input.config)
  if (!signature) return null

  const entries: ZipEntry[] = []
  for (const [name, data] of files) entries.push({ name, data })
  entries.push({ name: "manifest.json", data: new TextEncoder().encode(manifestJson) })
  entries.push({ name: "signature", data: signature })

  return buildZip(entries)
}
