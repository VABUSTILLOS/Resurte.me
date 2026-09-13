"use server"

// ============================================================
// Server Actions de FoodOS: revisión de comprobantes de pago
// manuales (transferencia / OXXO / efectivo).
//
// Archivo separado de actions.ts a propósito: es una unidad de
// trabajo distinta (conciliación de pagos) y así el archivo
// principal no crece más.
//
// Todas usan requireAuth() y operan con el cliente de sesión, de
// modo que RLS es la última línea de defensa: sólo el dueño del
// restaurante puede leer y decidir sobre sus comprobantes.
// ============================================================

import { requireAuth } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/service"
import { notifyFoodosCustomer } from "@/lib/foodos-notifications"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { logger } from "@/lib/logger"
import type { FoodosOrderPayment } from "@/types/foodos"

/** Pedido resumido que se muestra junto al comprobante en la cola. */
export interface PaymentProofWithOrder extends FoodosOrderPayment {
  order: {
    id: string
    customer_name: string | null
    customer_phone: string | null
    total: number
    payment_status: string
    created_at: string
  } | null
}

/**
 * Comprobantes pendientes de revisión del restaurante, con el pedido
 * al que pertenecen. `restaurantId` es obligatorio porque un dueño
 * puede tener varios restaurantes y RLS no distingue entre ellos.
 */
export async function listPendingPaymentProofs(
  restaurantId: string
): Promise<PaymentProofWithOrder[]> {
  const { supabase } = await requireAuth()

  const { data: proofs, error } = await supabase
    .from("foodos_order_payments")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100)

  if (error) throw new Error(error.message)
  const rows = (proofs ?? []) as FoodosOrderPayment[]
  if (rows.length === 0) return []

  // Se resuelven los pedidos en una segunda consulta en lugar de un
  // embed: así el tipo es explícito y no depende de la forma que
  // PostgREST devuelva para la relación.
  const orderIds = [...new Set(rows.map((p) => p.order_id))]
  const { data: orders, error: ordersError } = await supabase
    .from("foodos_orders")
    .select("id, customer_name, customer_phone, total, payment_status, created_at")
    .in("id", orderIds)

  if (ordersError) throw new Error(ordersError.message)

  const byId = new Map(
    (orders ?? []).map((o) => [
      o.id as string,
      {
        id: o.id as string,
        customer_name: (o.customer_name as string | null) ?? null,
        customer_phone: (o.customer_phone as string | null) ?? null,
        total: Number(o.total ?? 0),
        payment_status: String(o.payment_status ?? "pending"),
        created_at: String(o.created_at ?? ""),
      },
    ])
  )

  return rows.map((p) => ({ ...p, order: byId.get(p.order_id) ?? null }))
}

/** Cuántos comprobantes esperan revisión (badge del panel). */
export async function countPendingPaymentProofs(restaurantId: string): Promise<number> {
  const { supabase } = await requireAuth()
  const { count, error } = await supabase
    .from("foodos_order_payments")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending")
  if (error) throw new Error(error.message)
  return count ?? 0
}

/**
 * URL firmada (1 h) para ver el comprobante. El bucket es privado y no
 * tiene políticas de lectura, así que la firma se genera con la
 * service key — pero sólo después de que el cliente de sesión haya
 * podido leer la fila, lo que prueba que el solicitante es el dueño.
 */
export async function getPaymentProofUrl(proofId: number): Promise<string | null> {
  const { supabase } = await requireAuth()

  const { data: proof, error } = await supabase
    .from("foodos_order_payments")
    .select("proof_path")
    .eq("id", proofId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!proof?.proof_path) return null

  const service = await createServiceClient()
  const { data: signed, error: signError } = await service.storage
    .from("comprobantes")
    .createSignedUrl(proof.proof_path as string, 3600)

  if (signError) {
    logger.error("[FOODOS PROOF] sign error:", signError)
    return null
  }
  return signed?.signedUrl ?? null
}

/**
 * Aprueba el comprobante y marca el pedido como pagado. Al quedar en
 * `paid`, `listOrdersForSync` lo incorpora a las ventas del panel sin
 * ningún paso extra.
 */
export async function approvePaymentProof(proofId: number): Promise<void> {
  const { supabase, user } = await requireAuth()

  const { data: proof, error: readError } = await supabase
    .from("foodos_order_payments")
    .select("id, order_id, status")
    .eq("id", proofId)
    .maybeSingle()

  if (readError) throw new Error(readError.message)
  if (!proof) throw new Error("Comprobante no encontrado")
  if (proof.status !== "pending") throw new Error("Este comprobante ya fue revisado")

  const { error } = await supabase
    .from("foodos_order_payments")
    .update({
      status: "approved",
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", proofId)

  if (error) throw new Error(error.message)

  const { error: orderError } = await supabase
    .from("foodos_orders")
    .update({ payment_status: "paid" })
    .eq("id", proof.order_id)

  if (orderError) throw new Error(orderError.message)

  revalidatePath("/panel/foodos/pedidos")
  revalidatePath("/panel/foodos/tablero")

  after(() => {
    void notifyFoodosCustomer(proof.order_id, "payment:paid")
  })
}

/**
 * Rechaza el comprobante con un motivo. El pedido permanece en
 * `pending`: el cliente puede volver a subir otro (el índice único
 * sólo bloquea mientras haya uno pendiente).
 */
export async function rejectPaymentProof(proofId: number, notes: string): Promise<void> {
  const { supabase, user } = await requireAuth()

  const { data: proof, error: readError } = await supabase
    .from("foodos_order_payments")
    .select("id, status, order_id")
    .eq("id", proofId)
    .maybeSingle()

  if (readError) throw new Error(readError.message)
  if (!proof) throw new Error("Comprobante no encontrado")
  if (proof.status !== "pending") throw new Error("Este comprobante ya fue revisado")

  const reason = notes.trim().slice(0, 500)

  const { error } = await supabase
    .from("foodos_order_payments")
    .update({
      status: "rejected",
      notes: reason || null,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", proofId)

  if (error) throw new Error(error.message)

  revalidatePath("/panel/foodos/pedidos")

  after(() => {
    void notifyFoodosCustomer(proof.order_id, "payment:proof_rejected", {
      reason: reason || null,
    })
  })
}
