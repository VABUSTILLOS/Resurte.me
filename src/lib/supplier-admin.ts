/**
 * Validación pura del CRUD de proveedores (`/api/admin/suppliers`).
 *
 * Vive fuera de las rutas para poder probar las reglas sin levantar el
 * contexto de Next.js. Las reglas no son arbitrarias: replican los CHECK y
 * los NOT NULL de la migración 00066, de modo que un input inválido se
 * rechace con un mensaje legible en vez de reventar en Postgres con un
 * `23514` que el admin no puede interpretar.
 */

export const SUPPLIER_STATUSES = [
  "prospecto",
  "localizado",
  "verificado",
  "contactado",
  "cotizado",
  "aprobado",
  "activo",
] as const

export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number]

export function isSupplierStatus(value: unknown): value is SupplierStatus {
  return typeof value === "string" && (SUPPLIER_STATUSES as readonly string[]).includes(value)
}

export interface SupplierWrite {
  name: string
  slug: string
  contact_name: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  status: SupplierStatus
  notes: string | null
}

export interface SupplierProductWrite {
  product_id: number
  supplier_sku: string | null
  presentation: string | null
  cost: number | null
  list_date: string | null
  is_primary: boolean
  notes: string | null
}

const MAX_NAME = 120
const MAX_TEXT = 200
const MAX_NOTES = 2000
const MAX_COST = 999_999_999

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Claves realmente presentes en el body (para el PATCH parcial). */
function has(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key)
}

/**
 * Texto opcional. `undefined` = "no lo mandaron" (o tipo equivocado, que
 * tratamos igual porque no hay forma de guardarlo); `null` = "bórralo".
 * La cadena vacía se guarda como NULL, no como `""`: si no, la UI tendría
 * que distinguir "sin teléfono" de "teléfono vacío" para siempre.
 */
function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

/**
 * WhatsApp se guarda en dígitos, sin `+` ni espacios, porque su único
 * consumidor es `wa.me/<dígitos>` (ver `whatsappUrl` en la página). Un
 * número con formato humano guardado tal cual rompería el enlace.
 * Devuelve `undefined` cuando hay dígitos pero no parecen un número real.
 */
export function normalizeWhatsApp(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") return undefined
  const digits = value.replace(/\D/g, "")
  if (!digits) return null
  if (digits.length < 10 || digits.length > 15) return undefined
  return digits
}

/** Acepta "proveedor.com" y lo vuelve "https://proveedor.com". */
export function normalizeWebsite(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

/**
 * Slug del proveedor a partir del nombre. Se conserva porque la columna es
 * `NOT NULL UNIQUE` desde 00066; hoy nadie lo consume en URLs, así que es
 * un identificador legible y estable, no una ruta pública.
 */
export function slugifySupplierName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
  return base || "proveedor"
}

/**
 * Resuelve la colisión de slug con sufijo numérico determinista (`-2`,
 * `-3`…) en vez de meter aleatoriedad: el mismo conjunto de slugs tomados
 * produce siempre el mismo resultado, así que es probable en pruebas.
 */
export function uniqueSupplierSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

export function validateSupplierInput(
  body: Record<string, unknown>
): { ok: true; value: Omit<SupplierWrite, "slug"> } | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME) : ""
  if (!name) return { ok: false, error: "El nombre del proveedor es obligatorio" }

  const status = body.status === undefined || body.status === null ? "prospecto" : body.status
  if (!isSupplierStatus(status)) {
    return { ok: false, error: `Estatus inválido (${SUPPLIER_STATUSES.join(", ")})` }
  }

  const email = optionalText(body.email, MAX_TEXT)
  if (email === undefined) return { ok: false, error: "El email no es válido" }
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "El email no es válido" }

  const whatsapp = normalizeWhatsApp(body.whatsapp)
  if (whatsapp === undefined) {
    return { ok: false, error: "El WhatsApp debe tener entre 10 y 15 dígitos" }
  }

  const website = optionalText(body.website, MAX_TEXT)
  if (website === undefined) return { ok: false, error: "El sitio web no es válido" }

  const contactName = optionalText(body.contact_name, MAX_TEXT)
  const phone = optionalText(body.phone, MAX_TEXT)
  const address = optionalText(body.address, MAX_TEXT)
  const city = optionalText(body.city, MAX_TEXT)
  const state = optionalText(body.state, MAX_TEXT)
  const notes = optionalText(body.notes, MAX_NOTES)
  if (
    contactName === undefined ||
    phone === undefined ||
    address === undefined ||
    city === undefined ||
    state === undefined ||
    notes === undefined
  ) {
    return { ok: false, error: "Alguno de los campos de texto no es válido" }
  }

  return {
    ok: true,
    value: {
      name,
      contact_name: contactName,
      phone,
      whatsapp,
      email,
      website: website ? normalizeWebsite(website) : null,
      address,
      city,
      state,
      status,
      notes,
    },
  }
}

/**
 * PATCH parcial: sólo toca las claves presentes. Un body vacío se rechaza
 * en vez de tratarse como un `UPDATE` sin columnas, que PostgREST rechaza
 * con un error opaco.
 */
export function validateSupplierPatch(
  body: Record<string, unknown>
): { ok: true; value: Partial<Omit<SupplierWrite, "slug">>; renamed: boolean } | { ok: false; error: string } {
  const value: Partial<Omit<SupplierWrite, "slug">> = {}
  let renamed = false

  if (has(body, "name")) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME) : ""
    if (!name) return { ok: false, error: "El nombre del proveedor no puede quedar vacío" }
    value.name = name
    renamed = true
  }

  if (has(body, "status")) {
    if (!isSupplierStatus(body.status)) {
      return { ok: false, error: `Estatus inválido (${SUPPLIER_STATUSES.join(", ")})` }
    }
    value.status = body.status
  }

  if (has(body, "email")) {
    const email = optionalText(body.email, MAX_TEXT)
    if (email === undefined) return { ok: false, error: "El email no es válido" }
    if (email && !EMAIL_RE.test(email)) return { ok: false, error: "El email no es válido" }
    value.email = email
  }

  if (has(body, "whatsapp")) {
    const whatsapp = normalizeWhatsApp(body.whatsapp)
    if (whatsapp === undefined) {
      return { ok: false, error: "El WhatsApp debe tener entre 10 y 15 dígitos" }
    }
    value.whatsapp = whatsapp
  }

  if (has(body, "website")) {
    const website = optionalText(body.website, MAX_TEXT)
    if (website === undefined) return { ok: false, error: "El sitio web no es válido" }
    value.website = website ? normalizeWebsite(website) : null
  }

  const textFields: [Exclude<keyof SupplierWrite, "slug">, number][] = [
    ["contact_name", MAX_TEXT],
    ["phone", MAX_TEXT],
    ["address", MAX_TEXT],
    ["city", MAX_TEXT],
    ["state", MAX_TEXT],
    ["notes", MAX_NOTES],
  ]
  for (const [key, max] of textFields) {
    if (!has(body, key)) continue
    const text = optionalText(body[key], max)
    if (text === undefined) return { ok: false, error: `El campo ${key} no es válido` }
    value[key] = text as never
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: "No mandaste ningún campo que se pueda editar" }
  }

  return { ok: true, value, renamed }
}

export function validateSupplierProductInput(
  body: Record<string, unknown>
): { ok: true; value: SupplierProductWrite } | { ok: false; error: string } {
  const productId = Number(body.product_id)
  if (!Number.isInteger(productId) || productId <= 0) {
    return { ok: false, error: "Elige un producto válido" }
  }

  const cost = validateCost(body.cost)
  if (cost === undefined) {
    return { ok: false, error: "El costo debe ser un número mayor o igual a cero" }
  }

  const listDate = validateListDate(body.list_date)
  if (listDate === undefined) {
    return { ok: false, error: "La fecha de lista debe tener el formato AAAA-MM-DD" }
  }

  const supplierSku = optionalText(body.supplier_sku, MAX_TEXT)
  const presentation = optionalText(body.presentation, MAX_TEXT)
  const notes = optionalText(body.notes, MAX_NOTES)
  if (supplierSku === undefined || presentation === undefined || notes === undefined) {
    return { ok: false, error: "Alguno de los campos de texto no es válido" }
  }

  const primary =
    body.is_primary === undefined || body.is_primary === null ? true : toBoolean(body.is_primary)
  if (primary === undefined) {
    return { ok: false, error: "El campo de proveedor principal no es válido" }
  }

  return {
    ok: true,
    value: {
      product_id: productId,
      supplier_sku: supplierSku,
      presentation,
      cost,
      list_date: listDate,
      is_primary: primary,
      notes,
    },
  }
}

/**
 * PATCH del vínculo. `product_id` no se acepta a propósito: mover un
 * vínculo de producto es borrar y crear, y permitirlo aquí dejaría dos
 * filas apuntando al mismo producto sin que nadie lo note.
 */
export function validateSupplierProductPatch(
  body: Record<string, unknown>
): { ok: true; value: Partial<Omit<SupplierProductWrite, "product_id">> } | { ok: false; error: string } {
  const value: Partial<Omit<SupplierProductWrite, "product_id">> = {}

  if (has(body, "cost")) {
    const cost = validateCost(body.cost)
    if (cost === undefined) {
      return { ok: false, error: "El costo debe ser un número mayor o igual a cero" }
    }
    value.cost = cost
  }

  if (has(body, "list_date")) {
    const listDate = validateListDate(body.list_date)
    if (listDate === undefined) {
      return { ok: false, error: "La fecha de lista debe tener el formato AAAA-MM-DD" }
    }
    value.list_date = listDate
  }

  if (has(body, "is_primary")) {
    const primary = toBoolean(body.is_primary)
    if (primary === undefined) {
      return { ok: false, error: "El campo de proveedor principal no es válido" }
    }
    value.is_primary = primary
  }

  const textFields: [Exclude<keyof SupplierProductWrite, "product_id">, number][] = [
    ["supplier_sku", MAX_TEXT],
    ["presentation", MAX_TEXT],
    ["notes", MAX_NOTES],
  ]
  for (const [key, max] of textFields) {
    if (!has(body, key)) continue
    const text = optionalText(body[key], max)
    if (text === undefined) return { ok: false, error: `El campo ${key} no es válido` }
    value[key] = text as never
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: "No mandaste ningún campo que se pueda editar" }
  }

  return { ok: true, value }
}

/**
 * `is_primary` llega de un `<input type="checkbox">` como booleano, pero
 * también puede llegar como `"true"`/`1` de un cliente que serializa a
 * formulario. Se aceptan esas formas y se rechaza lo demás en vez de
 * convertirlo a `false` en silencio: un `{}` que apaga la marca principal
 * de un proveedor sin avisar es justo el tipo de daño invisible que este
 * CRUD debe evitar.
 */
function toBoolean(value: unknown): boolean | undefined {
  if (value === true || value === false) return value
  if (value === "true" || value === "1" || value === 1) return true
  if (value === "false" || value === "0" || value === 0) return false
  return undefined
}

/** `null` = sin costo capturado; `undefined` = no es un número válido. */
function validateCost(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n < 0 || n > MAX_COST) return undefined
  return Math.round(n * 100) / 100
}

function validateListDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString().slice(0, 10) === value ? value : undefined
}
