"use client"

import { useToolGuide } from "@/hooks/use-tool-guide"
import { useToolDemo } from "@/hooks/use-tool-demo"
import { getToolGuide } from "./tool-guides"
import { getToolDemo } from "./tool-demo"
import ToolGuide from "./tool-guide"
import GuideToggleButton from "./guide-toggle-button"
import DemoBanner from "./demo-banner"
import ToolSwitcher from "./tool-switcher"
import DemoView from "./demo-view"

interface ToolGuideHostProps {
  /** Identificador corto de la herramienta (para persistencia) */
  toolKey: string
  /** Ruta actual de la herramienta (ej. /panel/ventas) */
  pathname: string
  /** Slug de la colección seleccionada (para aislar storage) */
  slug: string | null | undefined
  icon?: string
  title?: string
  subtitle?: string
  /** Forzar ocultar el toggle de demo (páginas sin dataset demo) */
  hideDemo?: boolean
}

/**
 * Host único que cada herramienta monta al final de su página.
 *
 * - Renderiza el panel lateral de guía (auto-open primera vez), el botón
 *   flotante "Guía" y, cuando el modo demo está activo, un overlay de
 *   presentación con la herramienta "en activo" usando data de ejemplo.
 * - El modo demo es 100% presentación: no escribe localStorage real ni
 *   Supabase; solo cubre la pantalla con datos de muestra.
 */
export default function ToolGuideHost({
  toolKey, pathname, slug, icon, title, subtitle, hideDemo = false,
}: ToolGuideHostProps) {
  const guide = useToolGuide(toolKey, slug ?? null)
  const demo = useToolDemo()
  const guideConfig = getToolGuide(pathname)
  const demoData = getToolDemo(pathname)
  const showDemo = !hideDemo && !!demoData

  return (
    <>
      {/* Overlay del modo demo */}
      {showDemo && demo.demoOn && (
        <div className="fixed inset-0 z-40 bg-white flex flex-col">
          <div className="shrink-0 border-b border-gray-200">
            <DemoBanner onExit={demo.disableDemo} />
            <ToolSwitcher />
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
              <DemoView demo={demoData} icon={icon} title={title} subtitle={subtitle} />
            </div>
          </div>
        </div>
      )}

      {/* Panel de guía lateral */}
      {guideConfig && (
        <ToolGuide
          guide={guideConfig}
          open={guide.open}
          onClose={guide.closeGuide}
          demoOn={demo.demoOn}
          onToggleDemo={demo.toggleDemo}
          showDemoToggle={showDemo}
          collapsed={guide.collapsed}
          onToggleCollapsed={guide.toggleCollapsed}
        />
      )}

      {/* Botón flotante para reabrir */}
      {guideConfig && (
        <GuideToggleButton onClick={guide.openGuide} label={title ?? guideConfig.tool} />
      )}
    </>
  )
}
