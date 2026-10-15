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

**Ocultar también borra la publicación programada** (`publish_at` /
`unpublish_at`), y eso no es cosmético: el job `scheduled-publishing` del cron
diario hace `is_visible = true` en todo lo que tenga `publish_at` vencido, así
que un producto oculto con fecha pendiente **volvería al aire solo**, a un
precio por debajo del costo. El panel no tiene ese problema porque
`validateProductPatch` limpia la programación al togglear visibilidad; el SQL de
una migración no pasa por esa validación. Lo cierra `00203`.

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

## Refresco de la lista de AB Foods (`00225`, vigencia 13-oct-2026)

La lista mayoreo de AB Foods se renueva por vigencia: la del `10-sep-2026` quedó
sustituida por la del **13-oct-2026**. `00225` actualiza los costos y recalcula
los precios con la misma regla de arriba (margen 1.18, tope de la competencia).

| | |
| --- | --- |
| Artículos con costo actualizado | **54** (50 que ya existían + 4 altas) |
| Costos que se movieron | **35** de los 50 que ya existían |
| Altas (artículos nuevos en la lista) | **4**, en `is_visible = false` |
| Precios de venta recalculados | **19** |
| Ocultos por tope | **0** |

Dos acotaciones que hacen que el número de precios movidos (19) sea menor que el
de costos movidos (35), y que no son un olvido:

1. **Solo se recalcula donde AB Foods es `is_primary`.** En los otros 21
   artículos que ya existían, la tienda compra a Weber/Distmar y el precio se
   rige por el costo de ese proveedor; lo que cambia es solo el costo de
   referencia de AB Foods.
2. **Solo se recalcula si el costo cambió.** `00225` no re-normaliza el margen de
   un artículo cuyo costo es idéntico en las dos listas: `papa-select-516-sc-caja-1361kg`
   es el único artículo de AB Foods que quedó en el régimen de `00214` (1.20, sin
   tope, $696) y se queda así. Es deuda anotada, no un cambio de precio
   silencioso. Por lo mismo, `hamburguesa-bm-sirloin-caja-30pzs` subió de costo
   ($564.90 → $574.90) pero **no** de precio: el tope del rival ($618.39) sigue
   mandando.

### Precios ajustados (19)

| Producto | Antes | Ahora | Costo nuevo |
| --- | --- | --- | --- |
| arrachera-premium-sukarne | $343.00 | **$354.00** | $299.90 |
| boneless-buffalo-freskecito | $160.00 | **$162.90** | $138.90 |
| camaron-cocido-100200 | $134.00 | **$140.00** | $117.90 |
| camaron-cocido-4150 | $146.00 | **$150.00** | $126.90 |
| cordon-bleu-mini | $157.00 | **$163.00** | $137.90 |
| hamburguesa-empanizada-pilgrims | $110.00 | **$112.00** | $94.90 |
| papa-conquest-delivery-teja-65-caja-1361kg | $968.00 | **$1,003.00** | $849.90 |
| papa-curly-savory-caja-1361kg | $1,039.00 | **$1,062.00** | $899.90 |
| papa-hash-brown-patty-caja-952kg | $649.00 | **$673.00** | $569.90 |
| papa-megacrunch-14-caja-1224kg | $850.00 | **$917.00** | $776.90 |
| papa-select-38-cascara-caja-1361kg | $885.00 | **$921.00** | $779.90 |
| papa-thunder-38-sc-caja-1361kg | $838.00 | **$885.00** | $749.90 |
| pechuga-grill-fc-pilgrims | $201.00 | **$207.00** | $174.90 |
| pechuga-sh-am-soles-caja-10kg | $70.00 | **$74.00** | $61.90 |
| pechuga-sh-br-soles-caja-10kg | $74.00 | **$77.00** | $64.90 |
| pechuga-sh-pilgrims-caja-12kg | $97.00 | **$102.00** | $85.90 |
| pechuga-sin-hueso-br | $74.00 | **$77.00** | $64.90 |
| pollo-entero-congelado-pilgrims-caja-145kg | $71.00 | **$74.00** | $62.50 |
| queso-crema-krol-barra-136kg | $142.00 | **$148.00** | $124.90 |

Todos siguen por debajo del tope del rival y por encima del costo: las dos reglas
se verifican dentro de la migración (guardas en positivo) y no hubo ningún
artículo que se tuviera que ocultar.

### Las 4 altas nacen ocultas

La lista trae 4 artículos que el catálogo no tenía: papa francesa 1/4 McCain
(12.24 kg), papa ondulada McCain (16.33 kg), papa gajo McCain (13.61 kg) y papa
Conquest Delivery 3/8 **con** cáscara (13.61 kg). Entran con `is_visible = false`.

Los tres primeros son el mismo corte y la misma presentación que un artículo que
ya está a la venta, **a costo por kilo idéntico** (McCain 1/4 y Payette 1/4 a
$40.84/kg; gajo McCain y gajo 10 cut a $55.10/kg; ondulada McCain y ondulada
Payette a ~$40.4/kg): publicarlos dejaría dos fichas indistinguibles al mismo
precio. El cuarto sí es una especificación nueva —la tienda vende la versión
**sin** cáscara— y ya vende el par S/C-C/C de Select 3/8, así que es el candidato
natural a publicar primero.

Ocultos no se pierde nada: el SKU y su costo entran al ledger y la siguiente
lista los sigue actualizando. Publicarlos es un toggle en `/admin/productos`; la
razón de cada uno está en `products.admin_note`. Es el mismo camino que
recorrieron los 51 originales (`seed_ab_foods.sql` los dio de alta ocultos y
`00191` los publicó después).

### El artículo que la lista nueva ya no trae

`boneless-natural-freskecito` (SKU `8567`) **no aparece** en la lista del
13-oct-2026. No se borra ni se oculta: la tienda lo compra a `carnes-weber`
($118.90), así que su precio no depende de AB Foods. Se le cambia solo la nota y
conserva `list_date = 2026-09-10`, que es de dónde salió el costo que tiene. Si
AB Foods dejó de surtirlo, el artículo sigue vendiéndose con el costo de Weber.

### Cómo se leyó la lista

El PDF de AB Foods es un escaneo **sin capa de texto** (cada celda es una imagen),
así que los 54 renglones se extrajeron con OCR. Como un dígito mal leído se
convierte en un costo equivocado, cada una de las **43 celdas de precio distintas**
se verificó a 12 combinaciones de escala (2×–12×) y nivel de reconocimiento antes
de escribir un número: todas dieron una única lectura consistente. Los artículos
y las presentaciones se validaron además contra el catálogo y contra la lista
anterior (mismo SKU, mismo corte, mismos kg).
