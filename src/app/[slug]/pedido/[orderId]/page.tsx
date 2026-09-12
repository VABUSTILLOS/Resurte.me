import { TrackingClient } from "./tracking-client"

/**
 * Seguimiento público del pedido: funciona con sesión o sin ella gracias al
 * token capability (?t=restore_token) que el cliente recibe en la
 * confirmación y en los emails transaccionales.
 */
export default function OrderTrackingPage() {
  return <TrackingClient />
}
