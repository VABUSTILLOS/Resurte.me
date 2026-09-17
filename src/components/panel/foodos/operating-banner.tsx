"use client"

/**
 * Franja de sesión de soporte (P14).
 *
 * Mientras un admin de plataforma opera como otro restaurante, el panel deja de
 * ser suyo: cada guardado cae en el restaurante visitado y cada acción queda en
 * la bitácora. La franja existe para que eso nunca sea invisible — un admin que
 * olvide que está impersonando es exactamente el riesgo que P14 tenía que
 * acotar. Por eso no se puede descartar: la única salida es "Salir".
 *
 * El gate real no vive aquí: el servidor revalida el rol en cada llamada
 * (`requireFoodosAuth`). Esto solo pinta el estado y ofrece la salida.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Headset } from "lucide-react"
import { t } from "@/lib/i18n/es"
import { stopOperatingAs } from "@/app/panel/foodos/operating-actions"

export function OperatingBanner({ name }: { name: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  function exit() {
    setFailed(false)
    startTransition(async () => {
      const result = await stopOperatingAs()
      if (!result.ok) {
        setFailed(true)
        return
      }
      // La acción ya revalida la ruta; el refresh cubre la vista que quedó
      // montada en cliente para que el nivel y el banner se recalculen.
      router.refresh()
    })
  }

  return (
    // `print:hidden`: los tickets y comandas que se imprimen desde el panel son
    // documentos del restaurante, no de la sesión de soporte.
    <div
      role="status"
      className="print:hidden mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-900">
          <Headset className="w-4 h-4 shrink-0" aria-hidden="true" />
          {t("foodos.operating.banner", { name })}
        </span>
        <p className="text-sm text-amber-800 min-w-0 flex-1">
          {t("foodos.operating.bannerHint")}
        </p>
        <button
          type="button"
          onClick={exit}
          disabled={pending}
          className="shrink-0 px-3 py-1.5 rounded-xl border border-amber-400 bg-white text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60 transition-colors motion-reduce:transition-none touch-target"
        >
          {pending ? t("foodos.operating.bannerExiting") : t("foodos.operating.bannerExit")}
        </button>
      </div>
      {failed && (
        <p className="mt-2 text-sm font-medium text-red-700" role="alert">
          {t("foodos.operating.bannerExitError")}
        </p>
      )}
    </div>
  )
}
