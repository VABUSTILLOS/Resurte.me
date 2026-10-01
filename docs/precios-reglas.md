# Precios: sin pérdida y por debajo de la competencia

> Reglas vigentes desde el **1-oct-2026** (migración `00202`). Sustituye la
> regla de `00198`, que dejaba vender por debajo del costo cuando el tope de la
> competencia quedaba más abajo.

## Las dos reglas

```
A) precio >= costo            (no vender a pérdida)
B) precio <= competencia      (no ser más caros)

precio = LEAST( CEIL(costo_kg * kg * margen), cap_kg * kg )
si cap_kg < costo_kg  ->  OCULTAR  (no existe precio que cumpla A y B)
```

El **margen** es 1.20 para FRUGASA (`00198`) y 1.18 para AB Foods (`00191`).

Cuando las dos reglas chocan —la competencia lo vende más barato de lo que nos
cuesta— no hay precio válido: subir rompe B, bajar rompe A. Esos productos se
**ocultan** y se reactivan desde `/admin/productos` cuando cambie el costo o el
precio del rival.

## Resumen

| | |
| --- | --- |
| Productos revisados | **186** (135 FRUGASA + 51 AB Foods) |
| Sin cambio | 154 |
| Precio ajustado | **10** |
| Ocultos (no hay precio sin pérdida) | **22** |
| Visibles en la tienda tras el cambio | **164** |

Verificado en la base: **0 productos visibles por debajo del costo** y
**0 productos visibles más caros que la competencia**. Re-ejecutar `00202` no
cambia ninguna fila.

## Precios ajustados (10)

| Producto | Proveedor | Antes | Ahora | Costo | Tope |
| --- | --- | --- | --- | --- | --- |
| costilla-back-rib | ab-foods | $171.00 | **$149.90** | $144.90 | $149.90 |
| hamburguesa-bm-arrachera-caja-30pzs | ab-foods | $632.00 | **$618.39** | $534.91 | $618.39 |
| hamburguesa-bm-mezquite-caja-30pzs | ab-foods | $632.00 | **$618.39** | $534.91 | $618.39 |
| hamburguesa-bm-sirloin-caja-30pzs | ab-foods | $667.00 | **$618.39** | $564.88 | $618.39 |
| pechuga-picante-emp-pilgrims | ab-foods | $183.00 | **$182.90** | $154.90 | $182.90 |
| aguacate-hass | frugasa | $69.90 | **$64.90** | $63.00 | $64.90 |
| chile-chilaca | frugasa | $59.90 | **$64.90** | $61.25 | $64.90 |
| haba | frugasa | $157.00 | **$139.80** | $130.15 | $139.80 |
| limon-agrio | frugasa | $42.00 | **$34.90** | $34.55 | $34.90 |
| pepino | frugasa | $19.90 | **$21.00** | $17.00 | $22.90 |

> **Ojo con dos de ellos:** `pepino` ($19.90 → $21.00) y `chile-chilaca`
> ($59.90 → $64.90) **suben**. No es un error: el rival subió su precio, así que
> el margen del 20 % que antes no cabía ahora sí, y siguen por debajo del tope.

## Ocultos: no existe precio que cumpla las dos reglas (22)

La competencia los vende **más barato de lo que nos cuesta**. Se ocultaron en
vez de venderlos a pérdida.

| Producto | Costo | Precio del rival | Pérdida que se evitó |
| --- | --- | --- | --- |
| chile-chiltepin | $2,632.50 | $1,916.00 | $-716.50 |
| ciruelo-rojo | $115.00 | $39.90 | $-75.10 |
| ciruelo-negro | $115.00 | $39.90 | $-75.10 |
| durazno | $166.20 | $99.90 | $-66.30 |
| nuez-de-castilla | $97.20 | $89.90 | $-7.30 |
| chile-cascabel | $472.50 | $439.00 | $-33.50 |
| jitomate-bola | $47.00 | $26.90 | $-20.10 |
| camote-amarillo | $67.50 | $49.90 | $-17.60 |
| uvas-rojas | $105.00 | $89.90 | $-15.10 |
| uvas-verdes | $115.00 | $99.90 | $-15.10 |
| mandarina | $84.40 | $69.90 | $-14.50 |
| pina-miel | $42.95 | $29.90 | $-13.05 |
| pera | $61.00 | $49.90 | $-11.10 |
| chile-serrano | $46.70 | $36.90 | $-9.80 |
| guayaba | $48.95 | $39.90 | $-9.05 |
| manzana-roja | $57.55 | $49.90 | $-7.65 |
| apio | $32.00 | $24.90 | $-7.10 |
| jitomate-saladet | $33.50 | $26.90 | $-6.60 |
| cebolla-blanca | $54.00 | $49.90 | $-4.10 |
| nopal | $47.25 | $44.90 | $-2.35 |
| germinado-de-soya | $51.30 | $49.90 | $-1.40 |
| pimiento-morron | $50.00 | $49.90 | $-0.10 |

### Para recuperarlos

Hay que **bajar el costo** (negociar con FRUGASA) o **dejarlos fuera del
catálogo**. Subir el precio no es opción: rompería la regla B.

## Sin comparable válido en la competencia

No se les puso tope porque el rival no vende el mismo producto en una base
comparable. Se prefirió no inventar un tope antes que topar contra otra cosa:

| Producto | Por qué no hay tope |
| --- | --- |
| `aguacate-chunky-caja-7264kg` | El rival solo vende aguacate **fresco** (con
  cáscara y hueso); la nuestra es pulpa congelada, otro producto. Toparla
  contra el fresco la mandaría por debajo del costo y borraría un artículo
  legítimo. |
| `papa-hash-brown-patty-caja-952kg` y `papa-rallada-hash-brown-caja-816kg` |
  No hay hash brown en el catálogo del rival. |
| 22 artículos de FRUGASA que el rival vende por **pieza o manojo** | Comparar
  nuestro kilo contra su pieza es lo que prohíbe `src/lib/unit-price.ts`. |

## Nota sobre el snapshot

El snapshot anterior era del 22-sep-2026 y ya había derivado: 8 de los 74
artículos de FRUGASA daban otro número, y el rival renombró un artículo
(`Manzana red delicious por kg` → `Manzana Red Chihuahua  Kg`). Este documento
y `00202` usan el snapshot del **1-oct-2026**.

Para refrescar: `node scripts/alsuper-prices-sync.mjs` y volver a empujar
`00202`.
