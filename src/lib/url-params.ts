/**
 * Utilidades mínimas para reescribir la query string de la barra de direcciones.
 *
 * Viven aquí porque el patrón se repite: hay parámetros que **solo tienen
 * sentido una vez** (un reorden, la vuelta de un redirect de Stripe). Si
 * sobreviven en la URL, el siguiente `reload` —o el botón "Volver al menú" de la
 * pantalla de éxito, que es un `location.reload()`— los vuelve a aplicar y el
 * carrito revive el pedido que el comensal acaba de cerrar.
 *
 * Se manipula el texto y no `URLSearchParams` a propósito: `toString()`
 * re-codifica y reordena el resto de la query (los espacios pasan a `+`), así que
 * quitar un parámetro podía cambiar los demás.
 */

/** Clave de un segmento `clave=valor` de la query, decodificada. */
function segmentKey(segment: string): string {
  const raw = segment.split("=")[0] ?? ""
  try {
    return decodeURIComponent(raw)
  } catch {
    // Secuencia de escape rota: se compara con el texto crudo.
    return raw
  }
}

/**
 * Devuelve `href` sin los parámetros `keys`. Conserva el resto de la query, el
 * hash y la forma original (absoluta o relativa); si ninguno estaba, devuelve
 * el mismo string.
 */
export function withoutQueryParams(href: string, keys: readonly string[]): string {
  if (keys.length === 0) return href

  const hashIndex = href.indexOf("#")
  const hash = hashIndex === -1 ? "" : href.slice(hashIndex)
  const beforeHash = hashIndex === -1 ? href : href.slice(0, hashIndex)

  const queryIndex = beforeHash.indexOf("?")
  if (queryIndex === -1) return href

  const base = beforeHash.slice(0, queryIndex)
  const segments = beforeHash.slice(queryIndex + 1).split("&")
  const kept = segments.filter((segment) => !keys.includes(segmentKey(segment)))
  if (kept.length === segments.length) return href

  const query = kept.length > 0 ? `?${kept.join("&")}` : ""
  return `${base}${query}${hash}`
}
