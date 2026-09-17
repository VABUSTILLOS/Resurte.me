/**
 * Passkeys / WebAuthn (U13) — reglas puras.
 *
 * Lo que se prueba aquí es, sobre todo, que el **mapeo de errores** no se
 * desincronice: los códigos `ERROR_*` vienen de `@supabase/auth-js`, y si esa
 * librería los renombra, la UI se quedaría con el mensaje genérico en vez de
 * decir qué pasó. Por eso se enumeran todos los códigos que emite hoy.
 */

import { describe, it, expect, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  PASSKEY_NAME_MAX_LENGTH,
  PASSKEY_TIME_ZONE,
  formatPasskeyDate,
  isPasskeyCancelled,
  isPasskeySupported,
  passkeyErrorMessage,
  passkeyLabel,
  sortPasskeys,
  validatePasskeyName,
  type PasskeyLike,
} from "@/lib/passkeys"

/** Códigos reales de `WebAuthnError` (webauthn.errors.js de auth-js). */
const WEBAUTHN_CODES = [
  "ERROR_AUTHENTICATOR_GENERAL_ERROR",
  "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
  "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT",
  "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG",
  "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
  "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE",
  "ERROR_CEREMONY_ABORTED",
  "ERROR_INVALID_DOMAIN",
  "ERROR_INVALID_RP_ID",
  "ERROR_INVALID_USER_ID_LENGTH",
  "ERROR_MALFORMED_PUBKEYCREDPARAMS",
  "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
]

/** Nombres de `DOMException` que el spec documenta para WebAuthn. */
const DOM_NAMES = [
  "AbortError",
  "ConstraintError",
  "InvalidStateError",
  "NotAllowedError",
  "NotSupportedError",
  "SecurityError",
  "TypeError",
  "UnknownError",
]

describe("isPasskeySupported", () => {
  const originalWindow = (globalThis as { window?: unknown }).window

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it("es false en el servidor (sin window)", () => {
    delete (globalThis as { window?: unknown }).window
    expect(isPasskeySupported()).toBe(false)
  })

  it("es false si el navegador no expone PublicKeyCredential", () => {
    ;(globalThis as { window?: unknown }).window = { navigator: {} }
    expect(isPasskeySupported()).toBe(false)
  })

  it("es false si faltan create/get de credentials", () => {
    ;(globalThis as { window?: unknown }).window = {
      PublicKeyCredential: function PublicKeyCredential() {},
      navigator: { credentials: { create: () => {} } },
    }
    expect(isPasskeySupported()).toBe(false)
  })

  it("es true con las dos ceremonias disponibles", () => {
    ;(globalThis as { window?: unknown }).window = {
      PublicKeyCredential: function PublicKeyCredential() {},
      navigator: { credentials: { create: () => {}, get: () => {} } },
    }
    expect(isPasskeySupported()).toBe(true)
  })
})

describe("formatPasskeyDate", () => {
  it("formatea en la zona canónica del proyecto", () => {
    expect(PASSKEY_TIME_ZONE).toBe("America/Mexico_City")
    // 2026-03-12T02:00Z es 11 mar en CDMX (UTC-6): el test falla si alguien
    // quita la zona y deja que dependa del entorno.
    expect(formatPasskeyDate("2026-03-12T02:00:00.000Z")).toContain("11")
  })

  it("devuelve null sin fecha o con basura", () => {
    expect(formatPasskeyDate(null)).toBeNull()
    expect(formatPasskeyDate(undefined)).toBeNull()
    expect(formatPasskeyDate("")).toBeNull()
    expect(formatPasskeyDate("no-es-fecha")).toBeNull()
  })
})

describe("passkeyLabel", () => {
  it("usa el nombre que puso el usuario", () => {
    expect(passkeyLabel({ id: "a", friendly_name: "Mac de la oficina" })).toBe(
      "Mac de la oficina"
    )
  })

  it("ignora un nombre en blanco", () => {
    expect(passkeyLabel({ id: "a", friendly_name: "   " })).toBe("Llave de acceso")
  })

  it("cae a la fecha, no a un índice", () => {
    // Un índice se recorre al agregar otra llave y el usuario deja de
    // reconocer cuál es cuál.
    const label = passkeyLabel({ id: "a", created_at: "2026-03-12T18:00:00.000Z" })
    expect(label).toMatch(/^Llave de acceso · /)
    expect(label).toContain("2026")
  })

  it("sin nombre ni fecha sigue siendo legible", () => {
    expect(passkeyLabel({ id: "a" })).toBe("Llave de acceso")
  })
})

describe("sortPasskeys", () => {
  it("pone la más nueva primero y no muta la entrada", () => {
    const input: PasskeyLike[] = [
      { id: "vieja", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "nueva", created_at: "2026-06-01T00:00:00.000Z" },
      { id: "media", created_at: "2026-03-01T00:00:00.000Z" },
    ]
    const copy = [...input]
    expect(sortPasskeys(input).map((p) => p.id)).toEqual(["nueva", "media", "vieja"])
    expect(input).toEqual(copy)
  })

  it("manda al final las que no traen fecha usable", () => {
    const sorted = sortPasskeys<PasskeyLike>([
      { id: "sin-fecha" },
      { id: "fecha-rota", created_at: "ayer" },
      { id: "con-fecha", created_at: "2026-01-01T00:00:00.000Z" },
    ])
    expect(sorted[0]?.id).toBe("con-fecha")
    expect(sorted.slice(1).map((p) => p.id).sort()).toEqual(["fecha-rota", "sin-fecha"])
  })

  it("es estable cuando ninguna trae fecha", () => {
    expect(sortPasskeys<PasskeyLike>([{ id: "a" }, { id: "b" }]).map((p) => p.id)).toEqual([
      "a",
      "b",
    ])
  })
})

describe("validatePasskeyName", () => {
  it("recorta espacios", () => {
    expect(validatePasskeyName("  iPhone  ")).toEqual({ ok: true, value: "iPhone" })
  })

  it("rechaza vacío o solo espacios", () => {
    expect(validatePasskeyName("").ok).toBe(false)
    expect(validatePasskeyName("   ").ok).toBe(false)
  })

  it("acepta exactamente el tope y rechaza uno más", () => {
    const atLimit = "x".repeat(PASSKEY_NAME_MAX_LENGTH)
    expect(validatePasskeyName(atLimit)).toEqual({ ok: true, value: atLimit })
    expect(validatePasskeyName("x".repeat(PASSKEY_NAME_MAX_LENGTH + 1)).ok).toBe(false)
  })

  it("mide después de recortar, no antes", () => {
    const padded = `  ${"x".repeat(PASSKEY_NAME_MAX_LENGTH)}  `
    expect(validatePasskeyName(padded).ok).toBe(true)
  })
})

describe("isPasskeyCancelled", () => {
  it("detecta el aborto explícito de la ceremonia", () => {
    expect(isPasskeyCancelled({ code: "ERROR_CEREMONY_ABORTED" })).toBe(true)
    expect(isPasskeyCancelled(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true)
  })

  it("NO trata NotAllowedError como cancelación silenciosa", () => {
    // Puede significar "este dispositivo no tiene ninguna llave", y eso sí hay
    // que decirlo: si no, el botón parecería no hacer nada.
    expect(isPasskeyCancelled(Object.assign(new Error("x"), { name: "NotAllowedError" }))).toBe(
      false
    )
    expect(
      isPasskeyCancelled({
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        name: "NotAllowedError",
      })
    ).toBe(false)
  })

  it("no se traga errores desconocidos", () => {
    expect(isPasskeyCancelled(new Error("boom"))).toBe(false)
    expect(isPasskeyCancelled(null)).toBe(false)
    expect(isPasskeyCancelled(undefined)).toBe(false)
    expect(isPasskeyCancelled("boom")).toBe(false)
  })
})

describe("passkeyErrorMessage", () => {
  it("da un mensaje propio a cada código de WebAuthn", () => {
    for (const code of WEBAUTHN_CODES) {
      const message = passkeyErrorMessage({ code })
      expect(message.length, code).toBeGreaterThan(0)
      // Nunca se filtra el código crudo al usuario.
      expect(message, code).not.toContain(code)
    }
  })

  it("da un mensaje propio a cada código que la UI puede llegar a pintar", () => {
    // `ERROR_CEREMONY_ABORTED` se filtra antes con `isPasskeyCancelled`, así que
    // no tiene copy: si lo tuviera sería código muerto. El resto sí se muestra.
    const generic = passkeyErrorMessage(new Error("boom"))
    for (const code of WEBAUTHN_CODES) {
      if (code === "ERROR_CEREMONY_ABORTED") {
        expect(isPasskeyCancelled({ code }), code).toBe(true)
        continue
      }
      if (code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY") continue
      expect(passkeyErrorMessage({ code }), code).not.toBe(generic)
    }
  })

  it("el passthrough se resuelve por el nombre de la causa", () => {
    // auth-js copia `cause.name` al WebAuthnError; sin eso el mensaje caería al
    // genérico y el usuario no sabría qué hacer.
    const message = passkeyErrorMessage({
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      name: "NotAllowedError",
    })
    expect(message).toContain("llave de acceso")
  })

  it("cambia el copy de NotAllowedError según el flujo", () => {
    const err = Object.assign(new Error("x"), { name: "NotAllowedError" })
    const signin = passkeyErrorMessage(err, "signin")
    const register = passkeyErrorMessage(err, "register")
    expect(signin).not.toBe(register)
    // Al entrar, lo importante es que hay una salida por correo.
    expect(signin).toContain("correo")
    expect(register).toContain("No se creó")
    // Por defecto se asume entrada: es el uso más frecuente.
    expect(passkeyErrorMessage(err)).toBe(signin)
  })

  it("traduce los nombres de DOMException documentados", () => {
    for (const name of DOM_NAMES) {
      const message = passkeyErrorMessage(Object.assign(new Error("x"), { name }))
      expect(message.length, name).toBeGreaterThan(0)
      expect(message, name).not.toContain(name)
    }
  })

  it("explica el flag experimental apagado en vez de mostrarlo crudo", () => {
    const err = new Error(
      "@supabase/auth-js: the passkey API is experimental and disabled by default. Enable it by passing `auth: { experimental: { passkey: true } }` to createClient"
    )
    const message = passkeyErrorMessage(err)
    expect(message).toContain("no están habilitadas")
    expect(message).not.toContain("experimental")
  })

  it("siempre devuelve algo, con cualquier entrada", () => {
    for (const input of [null, undefined, "boom", 42, {}, [], new Error("")]) {
      expect(passkeyErrorMessage(input).length).toBeGreaterThan(0)
    }
  })
})

describe("contrato con @supabase/auth-js", () => {
  const source = readFileSync(
    join(process.cwd(), "node_modules/@supabase/auth-js/dist/module/lib/webauthn.errors.js"),
    "utf8"
  )

  it("todos los códigos que emitimos existen en la librería", () => {
    for (const code of WEBAUTHN_CODES) {
      expect(source, code).toContain(`'${code}'`)
    }
  })

  it("no quedó ningún código de la librería sin cubrir", () => {
    const inLibrary = new Set(
      [...source.matchAll(/code: '([A-Z_]+)'/g)].map((m) => m[1] as string)
    )
    expect([...inLibrary].sort()).toEqual([...WEBAUTHN_CODES].sort())
  })

  it("NotAllowedError sigue siendo el nombre que emite la librería al cancelar", () => {
    expect(source).toContain("error.name === 'NotAllowedError'")
  })
})

describe("contrato con el cliente de Supabase", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/supabase/client.ts"), "utf8")

  it("el cliente enciende el flag experimental de passkeys", () => {
    // Sin esto `signInWithPasskey` lanza en tiempo de llamada.
    expect(source).toContain("experimental")
    expect(source).toContain("passkey: true")
  })
})
