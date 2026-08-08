// Registro de schemas de localStorage del panel.
//
// Cada key persistida por useLocalStorage declara aquí su forma canónica y un
// validador de parse. Antes de la Fase 12 los datos se leían con `as T` sin
// validación: un JSON válido pero de forma incorrecta (o datos legacy) pasaba
// como el tipo y rompía el render. Este registro permite a readStored sanear
// cada key al leerla y reescribirla normalizada (self-healing).

export interface StorageSchema<T = unknown> {
  key: string
  /** Versión del formato. Al subirla, añade `migrate` para transformar la data antigua. */
  version: number
  /** Valor por defecto canónico (debe coincidir con el initialValue de los call sites). */
  default: () => T
  /** Parse + validación de forma. Siempre devuelve un valor válido para la shape. */
  validate: (data: unknown) => T
  /** Migración opcional de una versión antigua almacenada. */
  migrate?: (data: unknown, fromVersion: number) => T
}

const schemaRegistry = new Map<string, StorageSchema>()

export function registerStorageSchema(schema: StorageSchema): void {
  schemaRegistry.set(schema.key, schema)
}

export function getStorageSchema(key: string): StorageSchema | undefined {
  return schemaRegistry.get(key)
}

// ── Validadores primitivos (compositores sobre unknown) ──

const isStr = (x: unknown): boolean => typeof x === "string"
const isNum = (x: unknown): boolean => typeof x === "number" && Number.isFinite(x)
const isObj = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x)

const numOr = (fallback: () => number) => (data: unknown): number =>
  isNum(data) ? (data as number) : fallback()
const boolOr = (fallback: () => boolean) => (data: unknown): boolean =>
  typeof data === "boolean" ? data : fallback()
const strOr = (fallback: () => string) => (data: unknown): string =>
  typeof data === "string" ? data : fallback()
const arrOf =
  <T>(guard: (x: unknown) => boolean) =>
  (data: unknown): T[] =>
    Array.isArray(data) ? data.filter(guard) : []
const recOf =
  <T>(guard: (x: unknown) => boolean) =>
  (data: unknown): Record<string, T> => {
    if (!isObj(data)) return {}
    const out: Record<string, T> = {}
    for (const [k, v] of Object.entries(data)) {
      if (guard(v)) out[k] = v as T
    }
    return out
  }

const numSchema = (key: string, def: number | (() => number), version = 1): StorageSchema<number> => {
  const fallback = typeof def === "function" ? def : () => def
  return { key, version, default: fallback, validate: numOr(fallback) }
}
const boolSchema = (key: string, def: boolean, version = 1): StorageSchema<boolean> => ({
  key,
  version,
  default: () => def,
  validate: boolOr(() => def),
})
const strSchema = (key: string, def: string, version = 1): StorageSchema<string> => ({
  key,
  version,
  default: () => def,
  validate: strOr(() => def),
})
const arrSchema = <T>(key: string, guard: (x: unknown) => boolean, version = 1): StorageSchema<T[]> => ({
  key,
  version,
  default: () => [],
  validate: arrOf<T>(guard),
})
const recSchema = <T>(key: string, guard: (x: unknown) => boolean, version = 1): StorageSchema<Record<string, T>> => ({
  key,
  version,
  default: () => ({}),
  validate: recOf<T>(guard),
})

// ── Guards por ítem (solo campos requeridos — los opcionales no se validan) ──

function isSaleEntry(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.id) && isStr(x.dishId) && isStr(x.dishName) && isStr(x.date) &&
    isNum(x.quantity) && isNum(x.unitPrice) && isNum(x.unitCost)
}

function isMesa(x: unknown): boolean {
  if (!isObj(x)) return false
  if (!isStr(x.id) || !isStr(x.nombre)) return false
  if (x.capacidad !== undefined && !isNum(x.capacidad)) return false
  return true
}

const COMANDA_STATUSES = new Set(["pendiente", "en-cocina", "listo"])
function isComandaStatus(x: unknown): boolean {
  if (!isObj(x)) return false
  if (typeof x.status !== "string" || !COMANDA_STATUSES.has(x.status)) return false
  if (x.startedAt !== undefined && !isNum(x.startedAt)) return false
  if (x.readyAt !== undefined && !isNum(x.readyAt)) return false
  if (x.hidden !== undefined && typeof x.hidden !== "boolean") return false
  return true
}

function isInventoryItem(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.id) && isStr(x.name) && isStr(x.unit) &&
    isNum(x.stock) && isNum(x.minStock) && isNum(x.pricePerUnit)
}

const MOVIMIENTO_TIPOS = new Set(["entrada", "salida", "ajuste"])
function isStockMovement(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.fecha) && isStr(x.itemId) && isStr(x.itemName) && isStr(x.motivo) &&
    typeof x.tipo === "string" && MOVIMIENTO_TIPOS.has(x.tipo) && isNum(x.delta)
}

function isWasteEntry(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.id) && isStr(x.category) && isStr(x.date) && isStr(x.cause) &&
    isNum(x.amountKg) && isNum(x.costPerKg)
}

function isCliente(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.id) && isStr(x.nombre) && isStr(x.createdAt) &&
    isNum(x.puntos) && isNum(x.visitas) && isNum(x.totalGastado)
}

function isEmpleado(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.id) && isStr(x.nombre) && isNum(x.tarifa)
}

function isFichaje(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.id) && isStr(x.empleadoId) && isStr(x.entrada)
}

function isTarjetaRegalo(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.id) && isStr(x.codigo) && isStr(x.creada) &&
    isNum(x.monto) && isNum(x.saldo) && isStr(x.estado)
}

function isTransferItem(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.name) && isStr(x.unit) && isNum(x.price) && isNum(x.qty)
}

function isShoppingItem(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.key) && isStr(x.name) && isNum(x.pricePerKg) && isNum(x.quantityKg)
}

function isAperturaCustom(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.name) && isNum(x.low) && isNum(x.high)
}

function isDish(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.id) && isStr(x.name) && isStr(x.category) &&
    isNum(x.foodCostPercent) && isNum(x.sellingPrice) && isNum(x.portions)
}

function isRecipe(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.id) && isStr(x.name) && isStr(x.category) && isNum(x.portions)
}

function isCombo(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.id) && isStr(x.name) && isNum(x.price)
}

function isProveedor(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.id) && isStr(x.nombre)
}

function isSharedDish(x: unknown): boolean {
  if (!isObj(x)) return false
  return isStr(x.id) && isStr(x.name) && isNum(x.foodCostPercent) && isNum(x.sellingPrice)
}

// ── Registro canónico de keys del panel (41) ──
// Un validador por key aunque haya múltiples lectores con subtipos distintos:
// la forma canónica es la del escritor.

import { readManualQtys } from "@/lib/panel-units"

const PANEL_STORAGE_SCHEMAS: StorageSchema[] = [
  // Ventas
  arrSchema("ventas-entries", isSaleEntry),
  arrSchema("mesas", isMesa),
  recSchema("comanda-statuses", isComandaStatus),
  arrSchema("clientes", isCliente),
  arrSchema("reloj-empleados", isEmpleado),
  arrSchema("reloj-fichajes", isFichaje),
  arrSchema("tarjetas-regalo", isTarjetaRegalo),
  boolSchema("ventas-descontar-stock", false),
  numSchema("ventas-meta-dia", 0),
  numSchema("ventas-meta-mes", 0),
  numSchema("ventas-umbral-ticket", 3000),
  numSchema("ventas-puntos-tasa", 100),
  numSchema("ventas-puntos-canje", 1),
  numSchema("ventas-tipo-cambio", 1),
  recSchema("ventas-comisiones", isNum),
  // Inventario
  arrSchema("inventario-items", isInventoryItem),
  arrSchema("inventario-movimientos", isStockMovement),
  arrSchema("proveedores", isProveedor),
  strSchema("inventario-sort", "name"),
  // Mermas
  arrSchema("mermas-entries", isWasteEntry),
  numSchema("merma-monthly-goal", 0),
  // Planificador
  numSchema("planner-covers", 50),
  recSchema("planner-waste-pcts", isNum),
  {
    key: "planner-manual-qtys",
    version: 1,
    default: () => ({}),
    validate: (data) => readManualQtys(data),
  },
  // Temporada
  arrSchema("temporada-shopping-list", isShoppingItem),
  arrSchema("temporada-transfer", isTransferItem),
  numSchema("temporada-month", () => new Date().getMonth() + 1),
  // Apertura
  arrSchema("apertura-checked", isStr),
  recSchema("apertura-dates", isStr),
  arrSchema("apertura-custom", isAperturaCustom),
  // Costeo
  arrSchema("costeo-dishes", isDish),
  numSchema("costeo-target-fc", 30),
  strSchema("costeo-view", "lista"),
  arrSchema("costeo-recetas", isRecipe),
  arrSchema("costeo-combos", isCombo),
  // Rentabilidad
  recSchema("rentabilidad-prices", isNum),
  strSchema("rentabilidad-sort", "name"),
  numSchema("rentabilidad-sim", 0),
  // Compartido entre tools
  arrSchema("shared-dishes", isSharedDish),
]

for (const schema of PANEL_STORAGE_SCHEMAS) {
  registerStorageSchema(schema)
}
