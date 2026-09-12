import { DashboardPage } from "@/components/comercializacion/dashboard-page"
import {
  getDashboardKpis,
  getPendingFollowUps,
  getClientsToReorder,
  getSellerDisplayName,
  getWeeklyTrends,
} from "@/lib/comercializacion/actions"
import { getWeeklyGoals, getMonthlyRevenueGoal } from "@/lib/comercializacion/goals"

export default async function ComercializacionDashboardPage() {
  const [kpis, followUps, clientsToReorder, sellerName, trends] = await Promise.all([
    getDashboardKpis(),
    getPendingFollowUps(),
    getClientsToReorder(),
    getSellerDisplayName(),
    getWeeklyTrends(),
  ])

  return (
    <DashboardPage
      kpis={kpis}
      followUps={followUps}
      clientsToReorder={clientsToReorder}
      sellerName={sellerName}
      goals={getWeeklyGoals()}
      monthlyRevenueGoal={getMonthlyRevenueGoal()}
      trends={trends}
    />
  )
}
