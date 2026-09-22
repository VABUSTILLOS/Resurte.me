import { notFound } from "next/navigation"
import { requireFoodosAuth } from "@/lib/foodos-operating"
import { buildTicket, type TicketKind, type TicketPayment } from "@/lib/foodos-printing"
import { PUBLIC_FOODOS_ORDERS_SELECT } from "@/lib/sensitive-columns"
import type { FoodosBranch, FoodosOrder, FoodosRestaurant } from "@/types/foodos"
import { TicketView } from "./ticket-view"

export const dynamic = "force-dynamic"

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurte.me").replace(/\/$/, "")

function resolveKind(raw: string | string[] | undefined): TicketKind {
  return raw === "kitchen" ? "kitchen" : "customer"
}

/**
 * /panel/foodos/pedidos/[id]/print — ticket imprimible del pedido FoodOS.
 *
 * `?kind=kitchen` imprime la comanda de cocina (sin precios); por defecto el
 * ticket del cliente. `?auto=1` abre el diálogo de impresión al cargar.
 *
 * Lee con el seam de operación (cliente de sesión normalmente, service role
 * mientras un admin opera como el restaurante) y no recalcula totales:
 * `buildTicket` sólo presenta lo que ya calculó `createFoodosOrder`.
 */
export default async function FoodosPrintOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { ctx } = await requireFoodosAuth()
  const { id } = await params
  const query = await searchParams

  const kind = resolveKind(query.kind)
  const auto = query.auto === "1"

  // Mientras un admin opera como el restaurante el cliente es service role y
  // RLS no filtra: se acota el pedido al restaurante operado para que un id
  // ajeno no sea imprimible. Sin impersonación RLS sigue siendo la barrera.
  const db = ctx.client
  // Columnas explícitas (00195): los `stripe_*` de `foodos_orders` ya no están
  // concedidos a `authenticated`. El ticket no los usa; con `select("*")` la
  // consulta entera fallaría con `42501`.
  const base = db.from("foodos_orders").select(PUBLIC_FOODOS_ORDERS_SELECT).eq("id", id)
  const { data: order } = await (ctx.impersonating && ctx.restaurantId
    ? base.eq("restaurant_id", ctx.restaurantId)
    : base
  ).maybeSingle()
  if (!order) notFound()

  const o = order as FoodosOrder

  const [restaurantRes, branchRes, cashierRes] = await Promise.all([
    db.from("foodos_restaurants").select("name, slug").eq("id", o.restaurant_id).maybeSingle(),
    o.branch_id
      ? db.from("foodos_branches").select("name").eq("id", o.branch_id).maybeSingle()
      : Promise.resolve({ data: null }),
    o.cashier_user_id
      ? db.from("profiles").select("full_name").eq("id", o.cashier_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const restaurant = restaurantRes.data as Pick<FoodosRestaurant, "name" | "slug"> | null
  const branchName = (branchRes.data as Pick<FoodosBranch, "name"> | null)?.name ?? null
  const servedBy = (cashierRes.data as { full_name: string | null } | null)?.full_name ?? null

  const trackingUrl = restaurant?.slug ? `${SITE_URL}/r/${restaurant.slug}/pedido/${o.id}` : null

  const doc = buildTicket(kind, o, {
    restaurantName: restaurant?.name ?? "Restaurante",
    branchName,
    servedBy,
    trackingUrl,
    payment: (o.payment_breakdown as TicketPayment | null) ?? null,
  })

  // El QR sólo tiene sentido en el ticket del cliente y sólo si el pedido se
  // puede seguir en línea; la comanda de cocina va limpia.
  const qrDataUrl = kind === "customer" && doc.trackingUrl ? await makeQr(doc.trackingUrl) : null

  return <TicketView doc={doc} auto={auto} qrDataUrl={qrDataUrl} />
}

async function makeQr(url: string): Promise<string | null> {
  try {
    const QRCode = await import("qrcode")
    return await QRCode.toDataURL(url, { width: 256, margin: 1 })
  } catch {
    // Un QR que no se pudo dibujar no debe impedir imprimir el ticket.
    return null
  }
}
