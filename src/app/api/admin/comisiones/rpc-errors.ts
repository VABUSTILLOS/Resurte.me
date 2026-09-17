/**
 * Reexporta el mapeo compartido de errores de RPC.
 *
 * Vivía aquí y se duplicó al agregar las rutas de dispersiones FoodOS (00157);
 * se movió a `@/lib/rpc-error-response` para que las dos familias de rutas
 * contesten igual ante los mismos códigos de Postgres.
 */
export { rpcErrorResponse } from "@/lib/rpc-error-response"
