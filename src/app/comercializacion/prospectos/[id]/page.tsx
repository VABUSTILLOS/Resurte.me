import { notFound } from "next/navigation"
import { getProspectDetail, getProspectClientOrders } from "@/lib/comercializacion/actions"
import { getCities } from "@/lib/data"
import { requireSellerOrAdmin } from "@/lib/roles"
import { scopeForRole } from "@/lib/crm-core"
import { SellerProspectDetail } from "@/components/comercializacion/seller-prospect-detail"

export default async function ProspectoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const prospectId = Number(id)
  if (!Number.isInteger(prospectId) || prospectId <= 0) notFound()

  const { userId, role } = await requireSellerOrAdmin()

  let detail
  try {
    detail = await getProspectDetail(prospectId)
  } catch {
    notFound()
  }

  // Un fallo al medir las ventas no debe tumbar la ficha entera: la lista de
  // pedidos y el dinero son un extra de la ficha, no su contenido. El panel
  // recibe `null` y lo dice; nunca lo pinta como cero.
  let clientOrders = null
  if (detail.prospect.user_id) {
    try {
      clientOrders = await getProspectClientOrders(prospectId)
    } catch {
      clientOrders = null
    }
  }
  const cities = await getCities()

  return (
    <SellerProspectDetail
      detail={detail}
      clientOrders={clientOrders}
      cities={(cities ?? []).map((c) => ({ id: c.id, name: c.name, state: c.state }))}
      scope={scopeForRole(role, userId)}
    />
  )
}
