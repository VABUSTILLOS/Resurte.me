// Punto de entrada estable: los módulos de dominio viven en ./actions/*.
// Este barrel NO lleva "use server" propio; cada módulo lo declara.
export * from "./actions/prospectos"
export * from "./actions/actividades"
export * from "./actions/vinculos"
export * from "./actions/dashboard"
export * from "./actions/pedidos"
