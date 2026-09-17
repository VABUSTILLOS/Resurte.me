import { redirect } from "next/navigation"
import { getUserRole } from "@/lib/roles"
import { AdminSubNav } from "./sub-nav"

export const dynamic = "force-dynamic"

/**
 * Shell del área /admin: guard server-side + subnavegación persistente.
 *
 * Solo los administradores pueden ver estas páginas. Sin sesión → login; con
 * sesión pero sin rol → home. Antes el layout era cliente y no había guard: las
 * server actions rechazaban la escritura pero las páginas podían renderizar.
 *
 * `getUserRole()` delega en `resolveAdminAccess()`, que además espeja hacia
 * profiles.role cualquier permiso concedido solo por ADMIN_EMAILS o
 * `admin_users`. Es decir: este guard es también el punto donde la app y RLS
 * convergen, para que un admin no acabe viendo tablas vacías en silencio.
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
