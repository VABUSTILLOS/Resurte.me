/**
 * i18n structure for the panel tools.
 *
 * Scope: Spanish only (current product language). This module establishes the
 * structure so future locales can be added without touching component code.
 *
 * Usage: `t("costeo.newDish")` — fallback returns the key if a string is missing.
 */

export const es = {
  common: {
    save: "Guardar",
    cancel: "Cancelar",
    delete: "Eliminar",
    confirm: "Confirmar",
    close: "Cerrar",
    add: "Agregar",
    edit: "Editar",
    search: "Buscar",
    export: "Exportar CSV",
    copy: "Copiar",
    back: "Volver",
    loading: "Cargando…",
  },
  costeo: {
    title: "Costeando mi menú",
    newDish: "Nuevo platillo",
    editDish: "Editar platillo",
    foodCostTarget: "Food Cost objetivo",
    exportCsv: "Exportar CSV",
    emptyTitle: "Tu menú aún no tiene platillos costeados",
    emptyDescription:
      "Costea tu primer platillo con sus ingredientes y el precio sugerido se calculará automáticamente según tu food cost objetivo.",
    createFirst: "Crear tu primer platillo",
  },
  inventario: {
    title: "Inventario",
    newItem: "Nuevo artículo",
    importFromPlanner: "Importar desde planificador",
    emptyTitle: "Tu inventario aún no tiene artículos",
  },
  planificador: {
    title: "Planificador de pedidos",
    sendToInventory: "Enviar a inventario",
    copyOrder: "📋 Copiar",
    emptyTitle: "Planifica tu primer pedido",
  },
  mermas: {
    title: "Control de mermas",
    newEntry: "Registrar merma",
    emptyTitle: "Aún no registras mermas",
  },
  rentabilidad: {
    title: "Rentabilidad",
    exportCsv: "Exportar CSV",
    emptyTitle: "Sin platillos para analizar",
  },
  ventas: {
    title: "Ventas del día",
    newSale: "Nueva venta",
    emptyTitle: "Sin ventas hoy",
    summaryCopied: "Resumen copiado al portapapeles",
  },
  apertura: {
    title: "Apertura de caja",
    emptyTitle: "Sin aperturas registradas",
  },
  comanda: {
    title: "Comanda",
    emptyTitle: "Sin comandas activas",
  },
  temporada: {
    title: "Temporada",
    emptyTitle: "Sin productos de temporada",
  },
  theme: {
    light: "Claro",
    dark: "Oscuro",
    system: "Sistema",
    label: "Tema de color",
  },
}

export type TranslationKey = string

export function t(key: TranslationKey): string {
  const parts = key.split(".")
  let node: unknown = es
  for (const part of parts) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part]
    } else {
      return key
    }
  }
  return typeof node === "string" ? node : key
}
