/**
 * Registro de proveedores de punto de venta (Fase 7, sin candado de nivel).
 *
 * Núcleo **puro**: describe qué es cada proveedor, qué credenciales pide y qué
 * sabe hacer. No hace red ni toca Supabase, así que el panel, el validador y
 * los tests leen exactamente la misma verdad.
 *
 * Ninguno de los seis adaptadores comerciales está implementado todavía
 * (`implemented: false`). Se declaran a propósito: el restaurantero ve que su
 * proveedor está contemplado, el panel explica qué falta, y activarlo es
 * cambiar un booleano más el adaptador — no rehacer la superficie. Fingir una
 * sincronización produciría un menú desincronizado en silencio, que es peor
 * que no ofrecerla.
 *
 * Y precisamente porque **ninguno** está implementado, la capacidad no tiene
 * candado de nivel (`pos_integraciones` es la única en `Verde`; ver
 * `FEATURE_MIN_TIER`). El candado existe para cobrar lo que cuesta operar; hoy
 * no hay nada que operar, así que pedir Diamante por esto sería cobrar por una
 * hoja de ruta. Cuando el primer adaptador exista, el nivel sube con él.
 *
 * El camino de entrada sin credenciales sigue siendo la importación CSV de
 * `/panel/foodos/menu`, que ya existía antes de esta fase.
 */

export type PosProvider =
  | "soft_restaurant"
  | "parrot"
  | "ncr_aloha"
  | "toast"
  | "clip"
  | "mercado_pago"

export const POS_PROVIDERS: PosProvider[] = [
  "soft_restaurant",
  "parrot",
  "ncr_aloha",
  "toast",
  "clip",
  "mercado_pago",
]

export type PosConnectionStatus = "disconnected" | "connected" | "error"
export type PosSyncKind = "menu" | "order" | "health"
export type PosSyncStatus = "ok" | "failed" | "skipped"

/** Qué sabe hacer el proveedor. Determina qué ofrece el panel. */
export interface PosCapabilities {
  /** Puede exportar su catálogo para no capturarlo dos veces. */
  menu: boolean
  /** Puede recibir pedidos de FoodOS. */
  orders: boolean
  /** Emite webhooks que FoodOS puede verificar. */
  webhook: boolean
}

/**
 * Un campo de credencial.
 *
 * `secret` no es decorativo: el panel lo enmascara. Un campo que no es secreto
 * se muestra en claro porque el restaurantero necesita verificarlo (el id de
 * sucursal, por ejemplo).
 */
export interface PosCredentialField {
  key: string
  label: string
  hint?: string
  secret: boolean
  required: boolean
}

export interface PosDescriptor {
  provider: PosProvider
  label: string
  /** Documentación oficial del proveedor, para que el dueño sepa qué pedir. */
  docsUrl: string
  capabilities: PosCapabilities
  credentials: PosCredentialField[]
  /**
   * `false` mientras no exista adaptador real. El panel lo dice explícitamente
   * en vez de dejar creer que ya sincroniza.
   */
  implemented: boolean
  /** Qué falta para activarlo. Se muestra al dueño, sin rodeos. */
  pendingNote: string
}

const apiKey = (label = "API key"): PosCredentialField => ({
  key: "apiKey",
  label,
  secret: true,
  required: true,
})
const apiSecret = (label = "API secret"): PosCredentialField => ({
  key: "apiSecret",
  label,
  secret: true,
  required: true,
})
const token = (label = "Token de acceso"): PosCredentialField => ({
  key: "token",
  label,
  secret: true,
  required: true,
})
const location = (label = "Id de sucursal"): PosCredentialField => ({
  key: "locationId",
  label,
  hint: "Lo entrega el proveedor al dar de alta la ubicación.",
  secret: false,
  required: true,
})

export const POS_DESCRIPTORS: Record<PosProvider, PosDescriptor> = {
  soft_restaurant: {
    provider: "soft_restaurant",
    label: "Soft Restaurant",
    docsUrl: "https://www.softrestaurant.com.mx/",
    capabilities: { menu: true, orders: true, webhook: false },
    credentials: [apiKey(), location("Id de la sucursal en Soft")],
    implemented: false,
    pendingNote:
      "Falta el adaptador de su API de integración (requiere convenio y credenciales de socio).",
  },
  parrot: {
    provider: "parrot",
    label: "Parrot",
    docsUrl: "https://www.parrot.com.mx/",
    capabilities: { menu: true, orders: true, webhook: false },
    credentials: [token(), location()],
    implemented: false,
    pendingNote:
      "Falta el adaptador de su API de integración (requiere convenio y credenciales de socio).",
  },
  ncr_aloha: {
    provider: "ncr_aloha",
    label: "NCR Aloha",
    docsUrl: "https://www.ncr.com/restaurants",
    capabilities: { menu: false, orders: true, webhook: false },
    credentials: [apiKey(), apiSecret(), location("Id del sitio en Aloha")],
    implemented: false,
    // Aloha no expone el catálogo por API: el menú se importa por CSV.
    pendingNote:
      "Falta el adaptador de su API de pedidos. El menú no se exporta por API: se importa por CSV.",
  },
  toast: {
    provider: "toast",
    label: "Toast",
    docsUrl: "https://doc.toasttab.com/",
    capabilities: { menu: true, orders: true, webhook: true },
    credentials: [
      apiKey("Client id"),
      apiSecret("Client secret"),
      location("GUID del restaurante"),
    ],
    implemented: false,
    pendingNote:
      "Falta el adaptador de su API y el alta de la app como socio de Toast.",
  },
  clip: {
    provider: "clip",
    label: "Clip",
    docsUrl: "https://developer.clip.mx/",
    capabilities: { menu: false, orders: true, webhook: true },
    credentials: [apiKey(), apiSecret()],
    implemented: false,
    // Clip es un procesador de pagos: no tiene catálogo.
    pendingNote:
      "Falta el adaptador de su API de pagos. Clip no maneja catálogo: el menú se importa por CSV.",
  },
  mercado_pago: {
    provider: "mercado_pago",
    label: "Mercado Pago",
    docsUrl: "https://www.mercadopago.com.mx/developers/es/docs",
    capabilities: { menu: false, orders: true, webhook: true },
    credentials: [token("Access token"), location("Id de la sucursal (Point)")],
    implemented: false,
    pendingNote:
      "Falta el adaptador de su API de Point. Mercado Pago no maneja catálogo: el menú se importa por CSV.",
  },
}

export const POS_DESCRIPTOR_LIST: PosDescriptor[] = POS_PROVIDERS.map(
  (provider) => POS_DESCRIPTORS[provider]
)

export function isPosProvider(value: unknown): value is PosProvider {
  return typeof value === "string" && (POS_PROVIDERS as string[]).includes(value)
}

export function posDescriptor(provider: PosProvider): PosDescriptor {
  return POS_DESCRIPTORS[provider]
}

/** Proveedores que, cuando estén implementados, podrán exportar el catálogo. */
export function posProvidersWithMenu(): PosDescriptor[] {
  return POS_DESCRIPTOR_LIST.filter((d) => d.capabilities.menu)
}

// ------------------------------------------------------------
// Validación de credenciales
// ------------------------------------------------------------

export type PosCredentials = Record<string, string>

export interface PosCredentialCheck {
  ok: boolean
  /** Campos obligatorios que faltan o vienen vacíos. */
  missing: string[]
  /** Claves recibidas que el descriptor no declara. Se descartan al guardar. */
  unknown: string[]
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Valida un juego de credenciales contra el descriptor.
 *
 * Se queda solo con los campos declarados: así una clave de más en el
 * formulario no acaba guardada en `credentials` sin que nadie sepa qué es.
 */
export function checkPosCredentials(
  provider: PosProvider,
  values: PosCredentials | null | undefined
): PosCredentialCheck {
  const descriptor = POS_DESCRIPTORS[provider]
  const input = values ?? {}
  const missing: string[] = []
  const unknown: string[] = []

  for (const field of descriptor.credentials) {
    if (field.required && !clean(input[field.key])) missing.push(field.key)
  }

  const declared = new Set(descriptor.credentials.map((f) => f.key))
  for (const key of Object.keys(input)) {
    if (!declared.has(key)) unknown.push(key)
  }

  return { ok: missing.length === 0, missing, unknown }
}

/** Deja únicamente los campos declarados por el descriptor, ya recortados. */
export function normalizePosCredentials(
  provider: PosProvider,
  values: PosCredentials | null | undefined
): PosCredentials {
  const descriptor = POS_DESCRIPTORS[provider]
  const input = values ?? {}
  const out: PosCredentials = {}
  for (const field of descriptor.credentials) {
    const value = clean(input[field.key])
    if (value) out[field.key] = value
  }
  return out
}

/**
 * Enmascara los campos secretos para mostrarlos.
 *
 * Deja los últimos 4 caracteres visibles: sin eso el dueño no puede distinguir
 * "guardé la clave buena" de "guardé basura", y solo le queda reconectar. Los
 * valores de 8 caracteres o menos se tapan completos.
 */
export function maskPosCredentials(
  provider: PosProvider,
  values: PosCredentials | null | undefined
): PosCredentials {
  const descriptor = POS_DESCRIPTORS[provider]
  const input = values ?? {}
  const out: PosCredentials = {}
  for (const field of descriptor.credentials) {
    const value = clean(input[field.key])
    if (!value) continue
    out[field.key] = field.secret
      ? value.length > 8
        ? `••••${value.slice(-4)}`
        : "••••"
      : value
  }
  return out
}

// ------------------------------------------------------------
// Estado de la conexión
// ------------------------------------------------------------

export interface PosConnectionFacts {
  provider: PosProvider
  status: PosConnectionStatus
  credentials: PosCredentials
  externalLocationId?: string | null
  hasWebhookSecret: boolean
  lastSyncAt: string | null
  lastError: string | null
}

export type PosConnectionHealth =
  /** El adaptador todavía no existe. */
  | "pending"
  /** Existe el adaptador pero faltan credenciales. */
  | "needs_credentials"
  /** Listo para operar. */
  | "ready"
  /** Falló la última operación. */
  | "error"

export interface PosConnectionView {
  descriptor: PosDescriptor
  status: PosConnectionStatus
  health: PosConnectionHealth
  /** Solo los campos guardados, ya enmascarados. */
  credentials: PosCredentials
  /** Campos obligatorios que faltan por capturar. */
  missingFields: string[]
  externalLocationId: string | null
  hasWebhookSecret: boolean
  lastSyncAt: string | null
  lastError: string | null
  /** El webhook entrante solo se ofrece si el proveedor lo emite. */
  webhookUrl: string | null
}

/**
 * Deriva el estado visible de una conexión.
 *
 * El orden importa: un adaptador sin implementar nunca está "listo", aunque
 * tenga credenciales guardadas de un intento anterior. Mostrar "conectado"
 * sobre algo que no sincroniza es exactamente el engaño que esta fase evita.
 */
export function posConnectionView(
  facts: PosConnectionFacts,
  opts: { origin?: string; restaurantId?: string } = {}
): PosConnectionView {
  const descriptor = POS_DESCRIPTORS[facts.provider]
  const saved = new Set(Object.keys(facts.credentials ?? {}))
  const missingFields = descriptor.credentials
    .filter((f) => f.required && !saved.has(f.key))
    .map((f) => f.key)

  let health: PosConnectionHealth
  if (!descriptor.implemented) health = "pending"
  else if (missingFields.length > 0) health = "needs_credentials"
  else if (facts.status === "error") health = "error"
  else health = "ready"

  const origin = (opts.origin ?? "").replace(/\/$/, "")
  // La URL solo se muestra cuando el endpoint realmente puede aceptar algo: sin
  // adaptador devolvería "no implementado" y sin secreto no puede verificar la
  // firma. Enseñar una URL que rechaza todo es peor que no enseñarla.
  //
  // El restaurante va en la ruta porque el webhook llega sin sesión: el
  // proveedor solo conoce la URL, así que la URL tiene que decir a quién
  // pertenece la conexión.
  const webhookReady =
    descriptor.implemented && descriptor.capabilities.webhook && facts.hasWebhookSecret

  return {
    descriptor,
    status: facts.status,
    health,
    credentials: maskPosCredentials(facts.provider, facts.credentials),
    missingFields,
    externalLocationId: facts.externalLocationId ?? null,
    hasWebhookSecret: facts.hasWebhookSecret,
    lastSyncAt: facts.lastSyncAt,
    lastError: facts.lastError,
    webhookUrl:
      webhookReady && origin && opts.restaurantId
        ? `${origin}/api/foodos/pos/${descriptor.provider}/webhook/${opts.restaurantId}`
        : null,
  }
}

/** Conexión vacía: el proveedor contemplado pero todavía sin conectar. */
export function emptyPosConnectionView(
  provider: PosProvider,
  opts: { origin?: string; restaurantId?: string } = {}
): PosConnectionView {
  return posConnectionView(
    {
      provider,
      status: "disconnected",
      credentials: {},
      externalLocationId: null,
      hasWebhookSecret: false,
      lastSyncAt: null,
      lastError: null,
    },
    opts
  )
}

// ------------------------------------------------------------
// Bitácora y KPIs
// ------------------------------------------------------------

export interface PosSyncEntry {
  id: string
  provider: PosProvider
  kind: PosSyncKind
  status: PosSyncStatus
  itemsCount: number
  detail: string | null
  createdAt: string
}

export interface PosKpis {
  total: number
  ready: number
  pending: number
  withError: number
  lastSyncAt: string | null
  failedSyncs7d: number
}

export const EMPTY_POS_KPIS: PosKpis = {
  total: 0,
  ready: 0,
  pending: 0,
  withError: 0,
  lastSyncAt: null,
  failedSyncs7d: 0,
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * KPIs del panel.
 *
 * `pending` cuenta las conexiones cuyo adaptador no existe: es la cifra que
 * explica por qué "no pasa nada" aunque el dueño ya haya guardado sus
 * credenciales.
 */
export function summarizePos(
  connections: PosConnectionView[],
  log: PosSyncEntry[],
  now: Date = new Date()
): PosKpis {
  const cutoff = now.getTime() - 7 * DAY_MS
  let lastSync: string | null = null
  let lastSyncMs = Number.NEGATIVE_INFINITY

  for (const connection of connections) {
    if (!connection.lastSyncAt) continue
    const ms = Date.parse(connection.lastSyncAt)
    if (!Number.isFinite(ms) || ms <= lastSyncMs) continue
    lastSyncMs = ms
    lastSync = connection.lastSyncAt
  }

  let failedSyncs7d = 0
  for (const entry of log) {
    if (entry.status !== "failed") continue
    const ms = Date.parse(entry.createdAt)
    if (!Number.isFinite(ms) || ms < cutoff) continue
    failedSyncs7d++
  }

  return {
    total: connections.length,
    ready: connections.filter((c) => c.health === "ready").length,
    pending: connections.filter((c) => c.health === "pending").length,
    withError: connections.filter((c) => c.health === "error").length,
    lastSyncAt: lastSync,
    failedSyncs7d,
  }
}
