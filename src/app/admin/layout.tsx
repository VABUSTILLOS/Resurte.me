import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { ADMIN_PATH_HEADER, adminLoginPath, resolveAdminAccess } from "@/lib/admin-auth"
import { AdminSubNav } from "./sub-nav"
import { AdminPwa } from "./admin-pwa"

export const dynamic = "force-dynamic"

/**
 * PWA del panel (Ola 7): nombre y comportamiento al agregarlo a
 * la pantalla de inicio en iOS. El manifest y el service worker
 * los monta `AdminPwa` (la liga del manifest raíz es la de la
 * tienda y hay que sustituirla solo aquí dentro).
 */
export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    title: "Panel Resurte",
    statusBarStyle: "default",
  },
}

/**
 * Shell del área /admin: guard server-side + subnavegación persistente.
 *
 * Solo los administradores pueden ver estas páginas. Sin sesión → login; con
 * sesión pero sin rol → home. Antes el layout era cliente y no había guard: las
 * server actions rechazaban la escritura pero las páginas podían renderizar.
 *
 * Usa `resolveAdminAccess()` directamente en vez de `getUserRole()` por dos
 * razones: (1) además de espejar hacia profiles.role cualquier permiso
 * concedido solo por ADMIN_EMAILS o `admin_users` —para que la app y RLS
 * converjan en lugar de discrepar—, devuelve el **ámbito** de /admin, que el
 * sub-nav necesita para no ofrecer pestañas que responderán 403; y (2) hace una
 * sola lectura de `profiles` donde `getUserRole()` hacía dos.
 *
 * Este guard decide **qué se ve**. Qué se puede *abrir* lo decide
 * `requireAdminPage({ permission })` en cada sección: el layout no conoce la
 * ruta, así que no puede ser el punto donde se aplica el permiso.
 *
 * Es también el guard que corta a los visitantes **anónimos**, y por eso el
 * `next=` del login se construye con la ruta real que trae el proxy en
 * `x-pathname`: con un `/admin` fijo, quien abría un enlace profundo iniciaba
 * sesión y aterrizaba en el dashboard con la sección perdida.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(adminLoginPath((await headers()).get(ADMIN_PATH_HEADER)))
  }

  const access = await resolveAdminAccess(user)
  if (!access.isAdmin) {
    redirect("/")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminPwa />
      <AdminSubNav permissions={access.permissions} />
      {children}
    </div>
  )
}
