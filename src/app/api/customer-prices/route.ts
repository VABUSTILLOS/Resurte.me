import { NextResponse } from "next/server"
import { fetchCustomerPrices } from "@/lib/customer-prices"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

// ============================================================
// GET /api/customer-prices — precios especiales del cliente con
// sesión (Ola 5, 00234). El cliente de la web los usa para
// pintar «Tu precio» y fijarlo en el carrito; el checkout los
// recalcula en el servidor desde la misma tabla, así que esta
// respuesta nunca es la fuente de un cobro.
//
// Sin sesión responde 200 con la lista vacía (no 401): el store
// del cliente la pide también para invitados y un error en
// consola por cada visita anónima sería ruido. Sin la
// migración, `available: false` y la lista vacía.
// ============================================================

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ prices: [], available: true })
  }

  const service = await createServiceClient()
  const prices = await fetchCustomerPrices(service, user.id)
  return NextResponse.json({
    prices: [...prices.entries()].map(([product_id, price]) => ({ product_id, price })),
    // Sin filas no se distingue «sin especiales» de «sin
    // tabla»; el front no necesita distinguirlo (pinta público).
    available: true,
  })
}
