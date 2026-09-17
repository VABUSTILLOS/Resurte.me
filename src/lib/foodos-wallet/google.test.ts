import { describe, expect, it } from "vitest"
import { buildWalletCard, DEFAULT_CARD_COLOR, type WalletCard, type WalletCardInput } from "./card"
import {
  base64url,
  buildGoogleSaveUrl,
  buildLoyaltyClass,
  buildLoyaltyObject,
  googleWalletConfig,
  isGoogleWalletConfigured,
  loyaltyClassId,
  loyaltyObjectId,
  signJwt,
  type Env,
  type GoogleWalletConfig,
} from "./google"

const CONFIG: GoogleWalletConfig = {
  issuerId: "3388000000022000000",
  classSuffix: "foodos_loyalty",
  serviceAccountEmail: "wallet@resurte.iam.gserviceaccount.com",
  privateKeyPem: "-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----",
}

const FULL_ENV: Env = {
  GOOGLE_WALLET_ISSUER_ID: "3388000000022000000",
  GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: "wallet@resurte.iam.gserviceaccount.com",
  GOOGLE_WALLET_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nMIIB\\n-----END PRIVATE KEY-----",
}

const FAKE_SIGNATURE = "firma-falsa"

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

/** Decodifica un segmento base64url de vuelta a objeto. */
function segment(jwt: string, index: number): Record<string, unknown> {
  const part = jwt.split(".")[index] ?? ""
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>
}

describe("foodos-wallet/google: configuración", () => {
  it("sin credenciales no hay Google Wallet (no es un error)", () => {
    expect(googleWalletConfig({})).toBeNull()
    expect(isGoogleWalletConfigured({})).toBe(false)
  })

  it("exige emisor, cuenta de servicio y llave", () => {
    for (const key of Object.keys(FULL_ENV)) {
      expect(googleWalletConfig({ ...FULL_ENV, [key]: "  " })).toBeNull()
    }
  })

  it("acepta el kill switch", () => {
    expect(googleWalletConfig({ ...FULL_ENV, GOOGLE_WALLET_ENABLED: "false" })).toBeNull()
    expect(isGoogleWalletConfigured({ ...FULL_ENV, GOOGLE_WALLET_ENABLED: "true" })).toBe(true)
  })

  it("el sufijo de la clase tiene valor por defecto", () => {
    expect(googleWalletConfig(FULL_ENV)?.classSuffix).toBe("foodos_loyalty")
    expect(
      googleWalletConfig({ ...FULL_ENV, GOOGLE_WALLET_CLASS_SUFFIX: "otra" })?.classSuffix
    ).toBe("otra")
  })

  it("desescapa los \\n de la llave", () => {
    expect(googleWalletConfig(FULL_ENV)?.privateKeyPem).toContain("\nMIIB\n")
  })
})

describe("foodos-wallet/google: JWT", () => {
  it("base64url no lleva relleno ni + ni /", () => {
    expect(base64url("hola")).toBe("aG9sYQ")
    expect(base64url(new Uint8Array([0xfb, 0xff]))).toBe("-_8")
    expect(base64url(new Uint8Array([0xff, 0xff, 0xff]))).toBe("____")
    expect(base64url("")).toBe("")
  })

  it("firma RS256 con cabecera y cuerpo base64url", () => {
    const jwt = signJwt({ header: {}, payload: { hola: "mundo" } }, CONFIG.privateKeyPem, () =>
      FAKE_SIGNATURE
    )
    expect(jwt.split(".")).toHaveLength(3)
    expect(jwt.endsWith(`.${FAKE_SIGNATURE}`)).toBe(true)
    expect(segment(jwt, 0)).toEqual({ alg: "RS256", typ: "JWT" })
    expect(segment(jwt, 1)).toEqual({ hola: "mundo" })
  })

  it("deja que el llamador sobrescriba la cabecera", () => {
    const jwt = signJwt(
      { header: { kid: "abc" }, payload: {} },
      CONFIG.privateKeyPem,
      () => FAKE_SIGNATURE
    )
    expect(segment(jwt, 0)).toEqual({ alg: "RS256", typ: "JWT", kid: "abc" })
  })
})

describe("foodos-wallet/google: objeto de lealtad", () => {
  it("deriva classId y objectId del emisor", () => {
    expect(loyaltyClassId(CONFIG)).toBe("3388000000022000000.foodos_loyalty")
    expect(loyaltyObjectId(CONFIG, "Wabc")).toBe("3388000000022000000.Wabc")
  })

  it("la clase se envía en línea para no pre-registrarla", () => {
    expect(buildLoyaltyClass(CONFIG)).toEqual({
      id: "3388000000022000000.foodos_loyalty",
      issuerName: "Resurte.me",
      reviewStatus: "UNDER_REVIEW",
      programName: "Tarjeta de lealtad",
      hexBackgroundColor: "#0E7A0E",
    })
  })

  it("arma el objeto con saldo, color y QR", () => {
    const object = buildLoyaltyObject(card(), CONFIG)
    expect(object.id).toBe("3388000000022000000.Wabc")
    expect(object.classId).toBe("3388000000022000000.foodos_loyalty")
    expect(object.state).toBe("ACTIVE")
    expect(object.accountName).toBe("Taquería")
    expect(object.accountId).toBe("Wabc")
    expect(object.loyaltyPoints).toEqual({ label: "PUNTOS", balance: { int: 120 } })
    // Google quiere `#rrggbb`, no `rgb()`.
    expect(object.hexBackgroundColor).toBe(DEFAULT_CARD_COLOR)
    expect(object.barcode).toEqual({
      type: "QR_CODE",
      value: "https://resurte.me/r/taqueria/tarjeta/tok",
      alternateText: "Wabc",
    })
  })

  it("usa módulos de texto para el saldo, la equivalencia y la recompensa", () => {
    const modules = buildLoyaltyObject(card(), CONFIG).textModulesData as Array<
      Record<string, unknown>
    >
    expect(modules.map((m) => m.id)).toEqual(["points", "value", "reward"])
    expect(modules[2]).toEqual({
      id: "reward",
      header: "RECOMPENSA",
      body: "80 para Café gratis",
    })
  })

  it("omite los módulos que no aplican", () => {
    const onlyPoints = buildLoyaltyObject(card({ rewardLabel: null, pointValue: 0 }), CONFIG)
      .textModulesData as Array<Record<string, unknown>>
    expect(onlyPoints.map((m) => m.id)).toEqual(["points"])

    const withReward = buildLoyaltyObject(card({ pointValue: 0 }), CONFIG)
      .textModulesData as Array<Record<string, unknown>>
    expect(withReward.map((m) => m.id)).toEqual(["points", "reward"])
  })

  it("respeta el color de marca del restaurante", () => {
    const object = buildLoyaltyObject(card({ themeColor: "#FF0000" }), CONFIG)
    expect(object.hexBackgroundColor).toBe("#ff0000")
  })
})

describe("foodos-wallet/google: URL de guardado", () => {
  it("arma la URL con el JWT del pase", () => {
    const url = buildGoogleSaveUrl(card(), CONFIG, { now: () => 1_700_000_000_000, sign: () => FAKE_SIGNATURE })
    expect(url).not.toBeNull()
    expect(url?.startsWith("https://pay.google.com/gp/v/save/")).toBe(true)

    const jwt = (url ?? "").replace("https://pay.google.com/gp/v/save/", "")
    const payload = segment(jwt, 1)
    expect(payload.iss).toBe(CONFIG.serviceAccountEmail)
    expect(payload.aud).toBe("google")
    expect(payload.typ).toBe("savetowallet")
    expect(payload.iat).toBe(1_700_000_000)

    const inner = payload.payload as { loyaltyObjects: Array<Record<string, unknown>> }
    expect(inner.loyaltyObjects[0]?.id).toBe("3388000000022000000.Wabc")
  })

  it("devuelve null en vez de una URL rota", () => {
    const url = buildGoogleSaveUrl(card(), CONFIG, {
      sign: () => {
        throw new Error("llave inválida")
      },
    })
    expect(url).toBeNull()
  })
})
