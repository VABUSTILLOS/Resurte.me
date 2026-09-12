import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Marca el área /admin como noindex/nofollow vía header X-Robots-Tag.
 *
 * El layout de /admin es un client component y no puede exportar metadata;
 * el header es una vía soportada por Google y cubre todas las subrutas de
 * /admin, presentes y futuras, sin tocar el código de la interfaz.
 * (Next.js 16: convención `proxy`, reemplazo de `middleware`.)
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  if (request.nextUrl.pathname.startsWith("/admin")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow")
  }
  return response
}

export const config = {
  matcher: "/admin/:path*",
}
