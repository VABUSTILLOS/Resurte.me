/**
 * Tipos y catálogo de los workflows de pedido.
 *
 * Módulo deliberadamente libre de dependencias de servidor: lo consumen tanto
 * el motor (`src/lib/workflows.ts`, `POST /api/workflows/trigger`) como el
 * panel de disparo manual en `/admin/whatsapp/automations`, que es un
 * componente cliente. Importar `src/lib/workflows.ts` desde el cliente
 * arrastraría el cliente de service role al bundle, por eso la lista vive aquí.
 */

export type WorkflowType =
  | "new_order_staff"
  | "new_order_customer"
  | "status_update"
  | "payment_reminder"
  | "payment_confirmed"
  | "fulfillment_update"

/** Única fuente de verdad de los workflows disparables sobre un pedido. */
export const VALID_WORKFLOWS: WorkflowType[] = [
  "new_order_staff",
  "new_order_customer",
  "status_update",
  "payment_reminder",
  "payment_confirmed",
  "fulfillment_update",
]

/** Etiquetas para la UI; deben cubrir todo `WorkflowType`. */
export const WORKFLOW_LABELS: Record<WorkflowType, string> = {
  new_order_staff: "Notificar nuevo pedido al staff",
  new_order_customer: "Confirmar pedido al cliente",
  status_update: "Avisar cambio de estado del pedido",
  payment_reminder: "Recordar pago pendiente",
  payment_confirmed: "Confirmar pago recibido",
  fulfillment_update: "Avisar actualización de entrega",
}
