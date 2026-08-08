import { useMemo } from "react"
import { useLocalStorage } from "@/hooks/use-local-storage"

/**
 * Configuración central de umbrales y constantes del panel.
 * Cada valor tiene un default; se puede sobreescribir globalmente
 * (`resurte-panel-config`) o por colección (`resurte-panel-config-${slug}`).
 */

export interface PanelConfig {
  /** Food cost ≤ este valor → semáforo verde */
  foodCostGreenMax: number
  /** Food cost > este valor → semáforo rojo */
  foodCostRedAbove: number
  /** Rango mínimo del objetivo de food cost en costeo */
  costeoTargetFcMin: number
  /** Rango máximo del objetivo de food cost en costeo */
  costeoTargetFcMax: number
  /** Máximo % de merma antes de considerar alerta */
  mermaMaxPct: number
  /** Máximo de alertas visibles en el hub */
  alertCap: number
}

const DEFAULT_PANEL_CONFIG: PanelConfig = {
  foodCostGreenMax: 30,
  foodCostRedAbove: 38,
  costeoTargetFcMin: 20,
  costeoTargetFcMax: 45,
  mermaMaxPct: 25,
  alertCap: 5,
}

export type FoodCostStatus = "green" | "amber" | "red"

export function foodCostStatus(pct: number, cfg: PanelConfig = DEFAULT_PANEL_CONFIG): FoodCostStatus {
  if (pct <= cfg.foodCostGreenMax) return "green"
  if (pct <= cfg.foodCostRedAbove) return "amber"
  return "red"
}

function parseConfig(raw: string | null | undefined): Partial<PanelConfig> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Partial<PanelConfig>
    return typeof parsed === "object" && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Lee la config efectiva para una colección: override por colección > override
 * global > defaults.
 */
export function usePanelConfig(slug: string | null): PanelConfig {
  const [globalRaw] = useLocalStorage<string>("panel-config", "", slug && "global")
  const [perCollectionRaw] = useLocalStorage<string>("panel-config", "", slug)
  return useMemo(() => {
    const merged = {
      ...DEFAULT_PANEL_CONFIG,
      ...parseConfig(globalRaw),
      ...parseConfig(perCollectionRaw),
    }
    return merged
  }, [globalRaw, perCollectionRaw])
}
