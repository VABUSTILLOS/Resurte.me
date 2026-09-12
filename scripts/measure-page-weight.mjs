#!/usr/bin/env node
/**
 * Mide el peso SSR de rutas clave: bytes del HTML total y del payload
 * RSC flight embebido (scripts `self.__next_f`).
 *
 * Uso:
 *   node scripts/measure-page-weight.mjs [baseUrl]
 *
 * Por defecto mide contra http://localhost:3000 (levantar con `npm run start`
 * después de `npm run build`). Pasar una URL de producción/preview para
 * medir deploys.
 */

const baseUrl = process.argv[2] ?? "http://localhost:3000"

const routes = [
  "/",
  "/cdmx",
  "/catalogo/cdmx",
  "/cdmx/categoria/abarrotes",
  "/cdmx/buscar",
]

const decoder = new TextDecoder()

function flightBytes(html) {
  // El payload flight vive en <script>self.__next_f.push(...)</script>
  let total = 0
  const re = /<script>self\.__next_f\.push\((.*?)\)<\/script>/gs
  let m
  while ((m = re.exec(html)) !== null) total += m[1].length
  return total
}

const rows = []
for (const route of routes) {
  const url = baseUrl.replace(/\/$/, "") + route
  try {
    const res = await fetch(url, { headers: { "accept-encoding": "identity" } })
    const buf = await res.arrayBuffer()
    const html = decoder.decode(buf)
    rows.push({
      route,
      status: res.status,
      htmlKB: (buf.byteLength / 1024).toFixed(1),
      flightKB: (flightBytes(html) / 1024).toFixed(1),
    })
  } catch (err) {
    rows.push({ route, status: "ERR", htmlKB: "-", flightKB: "-", error: String(err) })
  }
}

console.log(`\nBase: ${baseUrl}\n`)
console.log("Route".padEnd(32), "Status".padEnd(8), "HTML KB".padEnd(10), "Flight KB")
for (const r of rows) {
  console.log(r.route.padEnd(32), String(r.status).padEnd(8), String(r.htmlKB).padEnd(10), r.flightKB)
}
