import { DashboardPage } from "@/components/comercializacion/dashboard-page"
import {
  getDashboardKpis,
  getPendingFollowUps,
  getClientsToReorder,
  getSellerDisplayName,
} from "@/lib/comercializacion/actions"
import { getWeeklyGoals } from "@/lib/comercializacion/goals"

export default async function ComercializacionDashboardPage() {
  const [kpis, followUps, clientsToReorder, sellerName] = await Promise.all([
    getDashboardKpis(),
    getPendingFollowUps(),
    getClientsToReorder(),
    getSellerDisplayName(),
  ])

  return (
    <DashboardPage
      kpis={kpis}
      followUps={followUps}
      clientsToReorder={clientsToReorder}
      sellerName={sellerName}
      goals={getWeeklyGoals()}
    />
  )
}
