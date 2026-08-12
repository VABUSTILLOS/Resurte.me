import { notFound } from "next/navigation"
import { getProspectDetail, getProspectClientOrders } from "@/lib/comercializacion/actions"
import { getCities } from "@/lib/data"
import { ProspectoDetail } from "@/components/comercializacion/prospecto-detail"

export default async function ProspectoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const prospectId = Number(id)
  if (!Number.isInteger(prospectId) || prospectId <= 0) notFound()

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
    <ProspectoDetail
      detail={detail}
      clientOrders={clientOrders}
      cities={(cities ?? []).map((c) => ({ id: c.id, name: c.name, state: c.state }))}
    />
  )
}
