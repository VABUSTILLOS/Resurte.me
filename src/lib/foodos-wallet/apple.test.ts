import { describe, expect, it } from "vitest"
import { buildWalletCard, type WalletCard, type WalletCardInput } from "./card"
import {
  appleWalletConfig,
  buildApplePass,
  buildManifest,
  buildPassJson,
  isAppleWalletConfigured,
  opensslSigner,
  sha1Hex,
  type ApplePassSigner,
  type AppleWalletConfig,
  type Env,
} from "./apple"

const CONFIG: AppleWalletConfig = {
  passTypeIdentifier: "pass.me.resurte.loyalty",
  teamIdentifier: "TEAM123",
  certPem: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
  keyPem: "-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----",
  wwdrPem: "-----BEGIN CERTIFICATE-----\nWWDR\n-----END CERTIFICATE-----",
}

const FULL_ENV: Env = {
  APPLE_WALLET_PASS_TYPE_ID: "pass.me.resurte.loyalty",
  APPLE_WALLET_TEAM_ID: "TEAM123",
  APPLE_WALLET_CERT: "-----BEGIN CERTIFICATE-----\\nMIIB\\n-----END CERTIFICATE-----",
  APPLE_WALLET_KEY: "-----BEGIN PRIVATE KEY-----\\nMIIB\\n-----END PRIVATE KEY-----",
  APPLE_WALLET_WWDR: "-----BEGIN CERTIFICATE-----\\nWWDR\\n-----END CERTIFICATE-----",
}

const encoder = new TextEncoder()
const icon = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

function card(overrides: Partial<WalletCardInput> = {}): WalletCard {
  return buildWalletCard({
    serial: "Wabc",
    cardUrl: "https://resurte.me/r/taqueria/tarjeta/tok",
    restaurantName: "Taquería",
    points: 120,
    pointValue: 0.1,
    rewardLabel: "Café gratis",
    rewardThreshold: 200,
    ...overrides,
  })
}

/** Firmante falso: registra la llamada en vez de invocar openssl. */
function fakeSigner(signature: Uint8Array | null = new Uint8Array([1, 2, 3, 4])) {
  const calls: Array<{ manifest: string; config: AppleWalletConfig }> = []
  const signer: ApplePassSigner = async (manifest, config) => {
    calls.push({ manifest, config })
    return signature
  }
  return { signer, calls }
}

describe("foodos-wallet/apple: configuración", () => {
  it("sin credenciales no hay Apple Wallet (no es un error)", () => {
    expect(appleWalletConfig({})).toBeNull()
    expect(isAppleWalletConfigured({})).toBe(false)
  })

  it("exige los cinco valores y rechaza los que son solo espacios", () => {
    for (const key of Object.keys(FULL_ENV)) {
      expect(appleWalletConfig({ ...FULL_ENV, [key]: "   " })).toBeNull()
    }
  })

  it("acepta el kill switch", () => {
    expect(appleWalletConfig({ ...FULL_ENV, APPLE_WALLET_ENABLED: "false" })).toBeNull()
    expect(appleWalletConfig({ ...FULL_ENV, APPLE_WALLET_ENABLED: "FALSE" })).toBeNull()
    expect(isAppleWalletConfigured({ ...FULL_ENV, APPLE_WALLET_ENABLED: "true" })).toBe(true)
  })

  it("desescapa los \\n de las PEM multilínea", () => {
    const config = appleWalletConfig(FULL_ENV)
    expect(config?.certPem).toContain("\nMIIB\n")
    expect(config?.certPem).not.toContain("\\n")
  })

  it("la contraseña de la llave es opcional", () => {
    expect(appleWalletConfig(FULL_ENV)).not.toHaveProperty("keyPassphrase")
    expect(
      appleWalletConfig({ ...FULL_ENV, APPLE_WALLET_KEY_PASSPHRASE: "secreta" })?.keyPassphrase
    ).toBe("secreta")
  })
})

describe("foodos-wallet/apple: pass.json", () => {
  it("arma un storeCard con el saldo como campo principal", () => {
    const pass = buildPassJson(card(), CONFIG)
    expect(pass.formatVersion).toBe(1)
    expect(pass.passTypeIdentifier).toBe("pass.me.resurte.loyalty")
    expect(pass.teamIdentifier).toBe("TEAM123")
    expect(pass.serialNumber).toBe("Wabc")
    expect(pass.backgroundColor).toBe("rgb(14, 122, 14)")

    const storeCard = pass.storeCard as Record<string, Array<Record<string, unknown>>>
    expect(storeCard.headerFields?.[0]).toEqual({ key: "header", value: "Taquería" })
    expect(storeCard.primaryFields?.[0]).toEqual({
      key: "points",
      value: "120 pts",
      label: "PUNTOS",
    })
    expect(storeCard.secondaryFields?.[0]).toMatchObject({ value: "≈ $12.00" })
    expect(storeCard.auxiliaryFields?.[0]).toEqual({
      key: "aux0",
      value: "80 para Café gratis",
      label: "RECOMPENSA",
    })
  })

  it("sin recompensa no hay campos auxiliares ni secundarios", () => {
    const pass = buildPassJson(card({ rewardLabel: null, pointValue: 0 }), CONFIG)
    const storeCard = pass.storeCard as Record<string, Array<Record<string, unknown>>>
    expect(storeCard.auxiliaryFields).toEqual([])
    expect(storeCard.secondaryFields).toEqual([])
  })

  it("lleva el QR con el token y no con el serial", () => {
    const pass = buildPassJson(card(), CONFIG)
    const barcodes = pass.barcodes as Array<Record<string, unknown>>
    expect(barcodes[0]).toMatchObject({
      format: "PKBarcodeFormatQR",
      message: "https://resurte.me/r/taqueria/tarjeta/tok",
      altText: "Wabc",
    })
  })
})

describe("foodos-wallet/apple: manifiesto", () => {
  it("calcula el SHA-1 de cada archivo", () => {
    expect(sha1Hex(encoder.encode("abc"))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d")
  })

  it("incluye una entrada por archivo", () => {
    const manifest = buildManifest(
      new Map([
        ["pass.json", encoder.encode("{}")],
        ["icon.png", icon],
      ])
    )
    expect(Object.keys(manifest).sort()).toEqual(["icon.png", "pass.json"])
    expect(manifest["pass.json"]).toBe(sha1Hex(encoder.encode("{}")))
  })
})

describe("foodos-wallet/apple: bundle", () => {
  it("sin icon.png no emite pase (Apple lo rechazaría)", async () => {
    const { signer, calls } = fakeSigner()
    const result = await buildApplePass({ card: card(), config: CONFIG, signer })
    expect(result).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it("sin firma no emite pase", async () => {
    const { signer } = fakeSigner(null)
    const result = await buildApplePass({
      card: card(),
      config: CONFIG,
      images: new Map([["icon.png", icon]]),
      signer,
    })
    expect(result).toBeNull()
  })

  it("arma un ZIP con pass.json, manifest.json y signature", async () => {
    const { signer } = fakeSigner()
    const result = await buildApplePass({
      card: card(),
      config: CONFIG,
      images: new Map([["icon.png", icon]]),
      signer,
    })
    expect(result).not.toBeNull()
    const text = Buffer.from(result as Uint8Array).toString("latin1")
    expect(text).toContain("pass.json")
    expect(text).toContain("manifest.json")
    expect(text).toContain("signature")
    expect(text).toContain('"formatVersion":1')
  })

  it("la firma se calcula sobre el manifiesto, no sobre el pase", async () => {
    const { signer, calls } = fakeSigner(new Uint8Array([9]))
    await buildApplePass({
      card: card(),
      config: CONFIG,
      images: new Map([["icon.png", icon]]),
      signer,
    })
    expect(calls).toHaveLength(1)
    const manifest = JSON.parse(calls[0]?.manifest ?? "{}") as Record<string, unknown>
    expect(manifest).toHaveProperty("pass.json")
    expect(manifest).toHaveProperty("icon.png")
    expect(manifest).not.toHaveProperty("signature")
    expect(calls[0]?.config).toBe(CONFIG)
  })
})

describe("foodos-wallet/apple: firmante por defecto", () => {
  it("nunca lanza: devuelve null si openssl no puede firmar", async () => {
    expect(await opensslSigner("{}", CONFIG)).toBeNull()
  }, 20_000)
})
