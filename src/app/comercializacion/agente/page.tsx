import { AgentePage } from "@/components/comercializacion/agente-page"
import {
  getDailyQueue,
  getAgentKpis,
  getAgentMessages,
} from "@/lib/agente/actions"

export const metadata = {
  title: "Agente IA · Comercialización · Resurte.me",
}

export default async function AgenteIAPage() {
  const [queue, kpis, drafts] = await Promise.all([
    getDailyQueue(),
    getAgentKpis(),
    getAgentMessages("borrador"),
  ])

  return <AgentePage queue={queue} kpis={kpis} drafts={drafts} />
}
