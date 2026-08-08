import { normalizeName } from "./normalize";

/**
 * Modelo de unidades unificado para el panel.
 *
 * Históricamente `planner-manual-qtys` guardaba valores numéricos desnudos
 * (mezclando g, kg, pza…) y el inventario asumía gramos (`/1000`) con unidad
 * fija "kg". Este módulo define el formato nuevo `{ qty, unit, price? }`,
 * lee datos legacy de forma defensiva y provee conversión entre unidades
 * dentro de la misma dimensión (masa / volumen / piezas).
 */

export type UnitDimension = "mass" | "volume" | "count" | "unknown";

export interface ManualQty {
  qty: number;
  unit: string;
  /** Precio por unidad de la unidad indicada (opcional; respeta el precio del platillo). */
  price?: number;
}

export type ManualQtys = Record<string, ManualQty>;

const COUNT_UNITS = new Set(["pza", "pieza", "piezas", "rebanada", "rebanadas", "hoja", "hojas", "docena", "docenas", "manojo", "manojos", "lata", "latas", "paquete", "paquetes", "bote", "botes", "frasco", "frascos", "bolsa", "bolsas", "caja", "cajas", "unidad", "unidades", "clavo", "diente", "ramita", "ramo"]);

const CONTAINER_WORDS = new Set(["lata", "paquete", "bote", "frasco", "bolsa", "caja", "charola", "tarrina", "sobre"]);

/** Extrae la palabra de contenedor de unidades compuestas: "lata 2.5kg" → "lata". */
function containerWord(unit: string): string {
  const u = (unit ?? "").trim().toLowerCase();
  const m = u.match(/^(lata|paquete|bote|frasco|bolsa|caja|charola|tarrina|sobre)\b/);
  return m ? m[1] ?? u : u;
}

/** Multiplicador a piezas para unidades de conteo compuestas: "docena" → 12, "paquete 20pz" → 20. */
function countMultiplier(unit: string): number | null {
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "docena" || u === "docenas") return 12;
  if (u === "media docena") return 6;
  if (CONTAINER_WORDS.has(containerWord(u))) {
    const m = u.match(/^[a-zñ]+\s+(?:de\s+)?(\d+(?:\.\d+)?)\s*(pz|pzs|piezas?|und|unidades?|hojas?|h)?$/);
    if (m) {
      // "paquete 20pz" → 20 piezas; "lata 2.5kg" → 1 pieza (contenedor)
      return /pz|pieza|und|hoja|h$/.test(m[2] || "") ? parseFloat(m[1] ?? "0") : 1;
    }
  }
  return null;
}

export function unitDimension(unit: string): UnitDimension {
  const u = (unit ?? "").trim().toLowerCase();
  if (["kg", "kilo", "kilos", "g", "gr", "gramo", "gramos", "ton", "lb", "oz"].includes(u)) return "mass";
  if (["l", "litro", "litros", "ml", "cl", "gal"].includes(u)) return "volume";
  if (COUNT_UNITS.has(u) || COUNT_UNITS.has(containerWord(u))) return "count";
  return "unknown";
}

/** Convierte una cantidad a su unidad base de dimensión: kg / L / cantidad. */
function toBaseQty(qty: number, unit: string): number {
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "g" || u === "gr" || u === "gramo" || u === "gramos") return qty / 1000;
  if (u === "ml" || u === "cl") return u === "ml" ? qty / 1000 : qty / 100;
  if (u === "lb") return qty * 0.453592;
  if (u === "oz") return qty * 0.0283495;
  const mult = countMultiplier(u);
  if (mult !== null) return qty * mult;
  return qty; // kg, L y unidades de pieza ya son base
}

/** Cantidad de la unidad base que representa una unidad de `unit`. */
function basePerUnit(unit: string): number {
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "g" || u === "gr" || u === "gramo" || u === "gramos") return 0.001;
  if (u === "ml") return 0.001;
  if (u === "cl") return 0.01;
  if (u === "lb") return 0.453592;
  if (u === "oz") return 0.0283495;
  const mult = countMultiplier(u);
  if (mult !== null) return mult;
  return 1;
}

/**
 * Convierte `qty` de `fromUnit` a `toUnit`. Devuelve `null` si las unidades
 * pertenecen a dimensiones distintas (p. ej. kg → pza) o `toUnit` no es convertible.
 */
export function convertQty(qty: number, fromUnit: string, toUnit: string): number | null {
  const fromDim = unitDimension(fromUnit);
  const toDim = unitDimension(toUnit);
  if (fromDim !== toDim || fromDim === "unknown") return null;
  const perTo = basePerUnit(toUnit);
  if (!Number.isFinite(perTo) || perTo === 0) return null;
  return toBaseQty(qty, fromUnit) / perTo;
}

/**
 * Lee `planner-manual-qtys` en el formato nuevo, tolerando datos legacy.
 *
 * - Objetos `{ qty, unit, price? }` pasan tal cual.
 * - Valores numéricos legacy se envuelven como `{ qty, unit }` usando la unidad
 *   del catálogo cuando se conoce (`catalogLookup`), si no "kg" por compatibilidad.
 */
export function readManualQtys(
  raw: unknown,
  catalogLookup?: (name: string) => string | undefined,
): ManualQtys {
  const out: ManualQtys = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [name, value] of Object.entries(raw)) {
    if (!name) continue;
    if (value && typeof value === "object" && typeof (value as { qty?: unknown }).qty === "number") {
      const v = value as Record<string, unknown>;
      out[name] = {
        qty: (v.qty as number) || 0,
        unit: typeof v.unit === "string" && v.unit.trim() ? v.unit.trim() : "kg",
        price: typeof v.price === "number" ? v.price : undefined,
      };
    } else if (typeof value === "number") {
      const unit = catalogLookup?.(name) ?? "kg";
      out[name] = { qty: value, unit };
    }
  }
  return out;
}

/** Busca una entrada en `ManualQtys` comparando nombres normalizados. */
export function findManualQty(manual: ManualQtys | undefined, name: string): ManualQty | undefined {
  if (!manual) return undefined;
  const key = findManualQtyKey(manual, normalizeName(name));
  if (!key) return undefined;
  return manual[key];
}

export function findManualQtyKey(manual: ManualQtys | undefined, normalizedName: string): string | undefined {
  if (!manual || !normalizedName) return undefined;
  if (normalizedName in manual) return normalizedName;
  for (const k of Object.keys(manual)) {
    if (normalizeName(k) === normalizedName) return k;
  }
  return undefined;
}
