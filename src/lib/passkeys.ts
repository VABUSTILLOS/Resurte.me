/**
 * Passkeys / WebAuthn (ronda de mejoras, fase U13) — reglas puras.
 *
 * Este módulo NO toca `supabase.auth`: solo decide si el navegador puede usar
 * passkeys, cómo se llama cada una y qué decir cuando falla. Las ceremonias
 * (`signInWithPasskey`, `registerPasskey`, `auth.passkey.*`) las invoca la UI
 * porque necesitan el cliente de Supabase y el gesto del usuario.
 *
 * ⚠️ Los errores de WebAuthn son ilegibles para el usuario y, peor, **uno de
 * ellos no es un error**: cancelar la ventana del sistema (huella/Face ID/
 * llave física) lanza `NotAllowedError`. Por eso hay dos funciones separadas:
 * `isPasskeyCancelled` para no pintar nada y `passkeyErrorMessage` para todo
 * lo demás. Mapear los códigos `ERROR_*` que emite `@supabase/auth-js` a
 * español es la única razón de que este módulo exista.
 *
 * Los códigos vienen de `@supabase/auth-js/dist/module/lib/webauthn.errors.js`
 * (`WebAuthnError.code`), no son inventados.
 */

/** Nombre máximo que acepta la API de passkeys de Supabase. */
export const PASSKEY_NAME_MAX_LENGTH = 120

/**
 * Zona canónica del proyecto (igual que `wallet-progress.ts`). Se fija para que
 * la fecha de una passkey no cambie según dónde esté el servidor o el test.
 */
export const PASSKEY_TIME_ZONE = "America/Mexico_City"

/** Forma mínima que consumimos de `PasskeyListItem`. */
export interface PasskeyLike {
  id: string
  friendly_name?: string | null
  created_at?: string | null
  last_used_at?: string | null
}

/** ¿Este navegador puede hacer WebAuthn? Requiere contexto seguro (https/localhost). */
export function isPasskeySupported(): boolean {
  if (typeof window === "undefined") return false
  // Todo se lee desde `window` (incluido `navigator`) para que la comprobación
  // dependa de un solo objeto y sea verificable en pruebas.
  const credentials = window.navigator?.credentials
  return (
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof credentials?.create === "function" &&
    typeof credentials?.get === "function"
  )
}

/** Formatea `created_at` en la zona canónica. `null` si la fecha no sirve. */
export function formatPasskeyDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: PASSKEY_TIME_ZONE,
  }).format(date)
}

/**
 * Nombre a mostrar. El usuario solo nombra la llave si la renombra: las que
 * crea `registerPasskey()` llegan sin `friendly_name`, así que el respaldo
 * incluye la fecha en vez de un índice — un índice se recorre al agregar otra
 * llave y el usuario dejaría de reconocer cuál es cuál.
 */
export function passkeyLabel(passkey: PasskeyLike): string {
  const named = passkey.friendly_name?.trim()
  if (named) return named
  const date = formatPasskeyDate(passkey.created_at)
  return date ? `Llave de acceso · ${date}` : "Llave de acceso"
}

/**
 * Orden de la lista: la más nueva primero, para que la recién creada aparezca
 * arriba sin recargar. Las que no traen fecha van al final (no se pueden
 * ordenar, y adelantarlas sería mentir sobre cuál es nueva).
 */
export function sortPasskeys<T extends PasskeyLike>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : Number.NaN
    const tb = b.created_at ? Date.parse(b.created_at) : Number.NaN
    const validA = !Number.isNaN(ta)
    const validB = !Number.isNaN(tb)
    if (validA && validB) return tb - ta
    if (validA) return -1
    if (validB) return 1
    return 0
  })
}

export type PasskeyNameResult =
  | { ok: true; value: string }
  | { ok: false; error: string }

/** Valida el nombre antes de llamar a `auth.passkey.update` (tope 120). */
export function validatePasskeyName(raw: string): PasskeyNameResult {
  const value = raw.trim()
  if (!value) return { ok: false, error: "Escribe un nombre para la llave." }
  if (value.length > PASSKEY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `El nombre no puede pasar de ${PASSKEY_NAME_MAX_LENGTH} caracteres.`,
    }
  }
  return { ok: true, value }
}

function codeOf(err: unknown): string {
  if (typeof err !== "object" || err === null) return ""
  const code = (err as { code?: unknown }).code
  return typeof code === "string" ? code : ""
}

function nameOf(err: unknown): string {
  if (typeof err !== "object" || err === null) return ""
  const name = (err as { name?: unknown }).name
  return typeof name === "string" ? name : ""
}

/** Códigos de WebAuthn que significan "la ceremonia se abortó", no un fallo. */
const CANCELLED_CODES = new Set(["ERROR_CEREMONY_ABORTED"])

/**
 * Flujo del que viene el error. Importa porque el navegador **no dice** si
 * falló porque el usuario cerró la ventana o porque este dispositivo no tiene
 * ninguna llave de la cuenta (`NotAllowedError` cubre las dos, por privacidad),
 * y las dos lecturas necesitan copy distinto según se esté entrando o creando.
 */
export type PasskeyFlow = "signin" | "register"

/**
 * ¿Se abortó la ceremonia (señal de aborto propia)? En ese caso no hay que
 * pintar nada. Ojo: **cancelar la ventana del sistema NO entra aquí** — eso es
 * `NotAllowedError` y sí merece explicación, porque puede significar que este
 * dispositivo no tiene ninguna llave de la cuenta.
 */
export function isPasskeyCancelled(err: unknown): boolean {
  if (CANCELLED_CODES.has(codeOf(err))) return true
  return nameOf(err) === "AbortError"
}

/**
 * Mensaje en español para cualquier fallo de passkeys. Nunca devuelve cadena
 * vacía: si no reconocemos el error, se dice que falló sin inventar la causa.
 */
export function passkeyErrorMessage(err: unknown, flow: PasskeyFlow = "signin"): string {
  const code = codeOf(err)

  switch (code) {
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
      return "Este dispositivo ya tiene una llave de acceso de tu cuenta. Usa otro o bórrala antes de volver a crearla."
    case "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT":
      return "Tu dispositivo no admite llaves de acceso sin usuario, que son las que permiten entrar sin escribir el correo."
    case "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT":
      return "Tu dispositivo no puede verificar tu identidad (huella, rostro o PIN), así que no puede usar llaves de acceso."
    case "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG":
      return "Tu dispositivo no usa ningún algoritmo compatible con llaves de acceso."
    case "ERROR_AUTHENTICATOR_GENERAL_ERROR":
      return "Tu dispositivo rechazó la operación. Intenta de nuevo o usa otro método de acceso."
    case "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE":
      return "No se pudo verificar tu identidad. Intenta de nuevo."
    case "ERROR_INVALID_DOMAIN":
    case "ERROR_INVALID_RP_ID":
      return "Este dominio no está configurado para llaves de acceso. Avísanos si sigue pasando."
    case "ERROR_MALFORMED_PUBKEYCREDPARAMS":
    case "ERROR_INVALID_USER_ID_LENGTH":
      return "No pudimos completar la operación por un problema interno. Intenta más tarde."
    default:
      break
  }

  const name = nameOf(err)
  switch (name) {
    case "NotAllowedError":
      return flow === "register"
        ? "No se creó la llave: cerraste la ventana del sistema o el dispositivo no terminó de verificar tu identidad."
        : "No encontramos una llave de acceso de tu cuenta en este dispositivo, o cerraste la ventana. Puedes entrar con tu correo y contraseña."
    case "InvalidStateError":
      return "Este dispositivo ya tiene una llave de acceso de tu cuenta."
    case "NotSupportedError":
      return "Este dispositivo o navegador no admite llaves de acceso."
    case "SecurityError":
      return "El navegador bloqueó la llave de acceso. Debe abrirse en una conexión segura (https)."
    case "AbortError":
      return "Se interrumpió la operación de llave de acceso."
    default:
      break
  }

  // El cliente avisa así cuando falta `auth: { experimental: { passkey: true } }`.
  const message = err instanceof Error ? err.message : ""
  if (message.includes("passkey API is experimental")) {
    return "Las llaves de acceso no están habilitadas en este cliente."
  }

  return "No se pudo completar la operación con la llave de acceso. Intenta de nuevo."
}
