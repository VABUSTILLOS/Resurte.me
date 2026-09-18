import { requireAdminPage } from "@/lib/admin-auth"

/**
 * Guard de la sección: exige el dominio `pedidos` de /admin.
 *
 * Vive en el layout y no en la página porque la mayoría de las páginas de
 * /admin son componentes cliente y no pueden leer la sesión. El mapa ruta →
 * dominio está en src/lib/admin-permissions.ts.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAdminPage({ permission: "pedidos" })
  return children
}
