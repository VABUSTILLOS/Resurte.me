/**
 * ¿El usuario actual es administrador de plataforma?
 *
 * Vive en su propio módulo (y no dentro de `foodos-tier.ts`) porque lo
 * necesitan dos superficies que no deben depender una de la otra: los
 * entitlements del restaurante (`foodos-tier.ts`) y el seam de impersonación
 * (`foodos-operating.ts`), que revalida el rol en **cada** llamada. Si el seam
 * importara de `foodos-tier.ts` habría un ciclo, porque los entitlements
 * consumen el seam para resolver el restaurante operado.
 *
 * `getUserRole()` es la fuente única (ADMIN_EMAILS / profiles.role /
 * admin_users) y `cache()` deduplica la verificación dentro de la request.
 */

import { cache } from "react"
import { getUserRole } from "@/lib/roles"
import { logger } from "@/lib/logger"

export const isCurrentUserAdmin = cache(async (): Promise<boolean> => {
  try {
    return (await getUserRole()) === "admin"
  } catch (err) {
    logger.warn("foodos.admin.check", { error: String(err) })
    return false
  }
})
