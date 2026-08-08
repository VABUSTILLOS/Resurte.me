// Núcleo de lectura/escritura de localStorage con schemas versionados.
//
// readStored parsea → migra → valida contra el registro de schemas; writeStored
// persiste el valor junto a la versión del formato; normalizeStored reescribe la
// data legacy/corrupta una vez (self-healing). La API es pura y acepta un objeto
// storage inyectable para tests en entornos sin localStorage (node).

import { getStorageSchema } from "./storage-schemas"

export type { StorageSchema } from "./storage-schemas"
export { registerStorageSchema, getStorageSchema } from "./storage-schemas"

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const VERSION_SUFFIX = "@v"

function getStorage(): StorageLike | null {
  if (typeof globalThis === "undefined") return null
  return (globalThis as { localStorage?: StorageLike }).localStorage ?? null
}

/** Clave con scope de colección, mismo formato que usaba el hook. */
export function storageKeyFor(key: string, collectionSlug?: string | null): string {
  return collectionSlug ? `resurte-${key}-${collectionSlug}` : `resurte-${key}`
}

function versionKeyFor(storageKey: string): string {
  return `${storageKey}${VERSION_SUFFIX}`
}

function parseVersion(raw: string | null): number {
  if (raw == null) return 1
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/**
 * Lee una key aplicando el schema registrado (migración + validación).
 * Sin schema registrado replica el parse legacy del hook (try/catch → initial).
 * `storage` es inyectable para tests; por defecto resuelve el localStorage global.
 */
export function readStored<T>(
  key: string,
  initial: T,
  collectionSlug?: string | null,
  storage: StorageLike | null = getStorage(),
): T {
  const schema = getStorageSchema(key)
  if (!storage) return initial
  const storageKey = storageKeyFor(key, collectionSlug)
  try {
    const raw = storage.getItem(storageKey)
    if (raw == null) return initial
    let data: unknown = JSON.parse(raw)
    if (schema) {
      const version = parseVersion(storage.getItem(versionKeyFor(storageKey)))
      if (schema.migrate && version < schema.version) {
        data = schema.migrate(data, version)
      }
      return schema.validate(data) as T
    }
    return data as T
  } catch {
    return initial
  }
}

/** Persiste `value` y, si hay schema, la versión del formato. */
export function writeStored<T>(
  key: string,
  value: T,
  collectionSlug?: string | null,
  storage: StorageLike | null = getStorage(),
): void {
  if (!storage) return
  const storageKey = storageKeyFor(key, collectionSlug)
  try {
    storage.setItem(storageKey, JSON.stringify(value))
    const schema = getStorageSchema(key)
    if (schema) storage.setItem(versionKeyFor(storageKey), String(schema.version))
  } catch {
    // Quota llena o storage no disponible — degrada silenciosamente
  }
}

/** Elimina la key y su versión. */
export function clearStored(
  key: string,
  collectionSlug?: string | null,
  storage: StorageLike | null = getStorage(),
): void {
  if (!storage) return
  const storageKey = storageKeyFor(key, collectionSlug)
  try {
    storage.removeItem(storageKey)
    storage.removeItem(versionKeyFor(storageKey))
  } catch {
    // Ignorar
  }
}

/**
 * Self-healing: si la data almacenada es inválida (o su versión está atrasada)
 * la reescribe normalizada con la versión actual. No escribe nada si ya es válida.
 * Los lectores ya devuelven la data validada en la misma lectura; esto solo
 * persiste la corrección para futuras lecturas y otras pestañas.
 */
export function normalizeStored(
  key: string,
  collectionSlug?: string | null,
  storage: StorageLike | null = getStorage(),
): void {
  const schema = getStorageSchema(key)
  if (!schema || !storage) return
  const storageKey = storageKeyFor(key, collectionSlug)
  try {
    const raw = storage.getItem(storageKey)
    if (raw == null) return
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      // JSON corrupto — elimina y deja que los lectores usen su default
      storage.removeItem(storageKey)
      storage.removeItem(versionKeyFor(storageKey))
      return
    }
    const version = parseVersion(storage.getItem(versionKeyFor(storageKey)))
    if (schema.migrate && version < schema.version) {
      data = schema.migrate(data, version)
    }
    const validated = schema.validate(data)
    const normalizedRaw = JSON.stringify(validated)
    const versionChanged = version !== schema.version
    if (versionChanged || normalizedRaw !== raw) {
      storage.setItem(storageKey, normalizedRaw)
      storage.setItem(versionKeyFor(storageKey), String(schema.version))
    }
  } catch {
    // Ignorar
  }
}
