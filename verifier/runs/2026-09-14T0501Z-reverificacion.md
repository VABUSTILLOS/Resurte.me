# Run 2026-09-14T0501Z — re-verificación de producción post rate limit (fases 3-6 en vivo)

Re-verificación del deploy de producción de fases 3-6 (PR #33, merge commit `cb6eeff` en `main`) tras el reset de 24 h del rate limit de Vercel (primer fallo 2026-09-13T04:36:05Z). Fuentes: curl en vivo contra https://resurte.me y API de status combinado de GitHub (`/repos/VABUSTILLOS/Resurte.me/commits/{sha}/status`).

## Contexto desde el run anterior

- `cb6eeff` (PR #33) falló por rate limit a las 2026-09-13T04:36:05Z; también fallaron `8b6ea94` (12:14:59Z) y `0f13f71` (13:56:54Z), todos con "Deployment rate limited — retry in 24 hours".
- Si la ventana era rolling, el reset efectivo podía correrse hasta ~2026-09-13T13:56Z+24 h; en la práctica la cuota se liberó antes: primer deploy exitoso a las 20:01:28Z del 2026-09-13.

## Resultados

| Criterio | Evidencia | Resultado |
|---|---|---|
| `/blog/guia-operacion-cocina` responde 200 con contenido | HTTP 200, 192,795 bytes; `<title>` "Operación de cocina: guía completa para restaurantes 2026" | ✅ |
| `/blog/formas-surtir-restaurante-mexico` responde 200 con contenido | HTTP 200, 176,678 bytes; `<title>` "Las 5 formas de surtir tu restaurante en México (2026)" | ✅ |
| `/blog/abarrotes-mayoreo-restaurantes` responde 200 con contenido | HTTP 200, 169,944 bytes; `<title>` "Abarrotes al mayoreo para restaurantes: guía 2026" | ✅ |
| `sitemap.xml` incluye las 14 guías nuevas | HTTP 200 (143,674 bytes); 14/14 slugs presentes: guia-operacion-cocina, guia-marketing-restaurantes, guia-legal-finanzas-restaurante, guia-crecer-restaurante, alternativas-sysco-clubes-precio, lista-insumos-abrir-restaurante, como-funciona-compra-mayoreo-en-linea, formas-surtir-restaurante-mexico, proveedores-frutas-verduras-restaurantes, proveedores-carne-mayoreo-restaurantes, proveedores-lacteos-huevo-restaurantes, proveedores-bebidas-mayoreo-restaurantes, abarrotes-mayoreo-restaurantes, desechables-mayoreo-restaurantes | ✅ |
| Deploy que sirve producción identificado | `98c7db6` Vercel SUCCESS 2026-09-13T20:01:28Z (primer deploy tras liberarse la cuota) y `780ca60` SUCCESS 20:09:59Z (último deploy exitoso; descendiente de `cb6eeff`, incluye todo el contenido de fases 3-6) | ✅ |

## Línea de tiempo del rate limit y deploys (2026-09-13, UTC)

- 04:36:05Z `cb6eeff` (PR #33, fases 3-6): rate limited.
- 12:14:59Z `8b6ea94`, 13:56:54Z `0f13f71`: rate limited.
- 20:01:28Z `98c7db6` (Lote 1): **SUCCESS** — cuota liberada; el deploy ya incluye fases 3-6.
- 20:09:59Z `780ca60` (Lote 5): **SUCCESS** — último deploy verde; es el que sirve producción. (`36991d6`, `8cf94c6`, `f063779` fueron cancelados desde el dashboard de Vercel a la misma hora.)
- 20:02-20:20Z `40b50ff`, `e01a60d`, `1a996e4`, `f242843`, `f62fd17`, `9c84a81` (lotes 6-10 y primer fix MDX): "Deployment has failed" por errores de build MDX (`<` literales), corregidos uno a uno en `9c84a81`→`a3dc771`.
- 20:23-20:30Z `ace657d`, `58bf57c`, `a3dc771` (HEAD actual de `main`): rate limited de nuevo; el build verde de los fixes MDX queda sin verificar en Vercel hasta que se libere la cuota.

## Conclusión

**Fases 3-6 en vivo**: producción sirve las 14 guías nuevas y el sitemap actualizado. No se requirió redeploy manual: la cuota se liberó ~2026-09-13T20:01Z y commits posteriores a `cb6eeff` desplegaron verde, llevando el contenido del PR #33 a producción. La verificación de fases 3-6 queda **cerrada**.

Nota fuera de alcance: el HEAD actual `a3dc771` (lotes 6-10 + fixes MDX) aún no despliega por una nueva ventana de rate limit abierta ~2026-09-13T20:23Z; si es rolling de 24 h, el reset efectivo corre ~2026-09-14T20:30Z. Se sugiere re-verificar ese contenido (y que el build MDX quedó verde) después de esa hora.
