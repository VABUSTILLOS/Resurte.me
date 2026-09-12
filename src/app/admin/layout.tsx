import { redirect } from "next/navigation"
import { getUserRole } from "@/lib/roles"
import { AdminSubNav } from "./sub-nav"

export const dynamic = "force-dynamic"

/**
 * Shell del área /admin: guard server-side + subnavegación persistente.
 *
 * Solo usuarios con rol admin (ADMIN_EMAILS, profiles.role='admin' o
 * admin_users) pueden ver estas páginas. Sin sesión → login; con sesión
 * pero sin rol → home. Antes el layout era cliente y no había guard: las
 * server actions rechazaban la escritura pero las páginas podían renderizar.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const role = await getUserRole()

  if (role === null) {
    redirect("/auth/login?next=/admin")
  }
  if (role !== "admin") {
    redirect("/")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSubNav />
      {children}
    </div>
  )
}
