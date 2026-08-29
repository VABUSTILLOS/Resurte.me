import { getProspects } from "@/lib/comercializacion/actions"
import { getCities } from "@/lib/data"
import { ProspectosPage, PAGE_SIZE } from "@/components/comercializacion/prospectos-page"

export default async function ProspectosPageServer() {
  const [prospects, cities] = await Promise.all([
    getProspects({ limit: PAGE_SIZE }),
    getCities(),
  ])
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
