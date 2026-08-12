import { getProspects } from "@/lib/comercializacion/actions"
import { getCities } from "@/lib/data"
import { ProspectosPage } from "@/components/comercializacion/prospectos-page"

export default async function ProspectosPageServer() {
  const [prospects, cities] = await Promise.all([getProspects(), getCities()])
  return (
    <ProspectosPage
      initialProspects={prospects}
      cities={(cities ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        state: c.state,
      }))}
    />
  )
}
