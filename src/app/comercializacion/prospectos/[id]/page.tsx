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

  const clientOrders = detail.prospect.user_id
    ? await getProspectClientOrders(prospectId)
    : null
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
