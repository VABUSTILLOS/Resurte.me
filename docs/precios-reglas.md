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

## Refresco de la lista de AB Foods (`00226`, vigencia 10-nov-2026)

La lista mayoreo de AB Foods se renueva por vigencia: la del 13-oct-2026 quedó
sustituida por la del **10-nov-2026**. `00226` actualiza los costos y recalcula
los precios con la misma regla de arriba (margen 1.18, tope de la competencia).

| | |
| --- | --- |
| Artículos en la lista | **49** (47 que ya existían + 2 altas) |
| Costos que se movieron | **19** de los 47 (18 suben, 1 baja) |
| Altas (artículos nuevos en la lista) | **2**, en `is_visible = false` |
| Artículos que la lista ya no trae | **7** (conservan su costo del 13-oct; solo cambia su nota) |

Las 2 altas son pechugas: **10144** (Pilgrims Nac. caja 12 kg, $99.90) y
**26061** (C.H AM caja 10 kg, $69.90). Aunque la descripción coincide con
artículos que ya existían (41451 y 8151), Victor confirmó que son artículos
**distintos**, no un cambio de código: entran ocultos, sin foto propia, y los
anteriores conservan su costo y su precio. La pechuga BR Soles (8160) tampoco
viene ya en la lista, igual que las 4 papas McCain que entraron en `00225`.

Los conteos de precios recalculados y de ocultos por tope los imprime la
propia migración al correrla (`RAISE NOTICE`), y las guardas verifican las
dos reglas sobre lo visible antes de confirmar.

### Costos ajustados (19)

| Artículo | Antes | Ahora |
| --- | --- | --- |
| PAPA FRANCESA 3/8 PAYETTE C/13.61 KG | $549.90 | **$579.90** |
| PAPA FRANCESA 1/4 PAYETTE C/12.24 KG | $499.90 | **$524.90** |
| PAPA ONDULADA 3/8 PAYETTE C/13.61 KG | $549.90 | **$579.90** |
| PAPA HASH BROWN PATTY C/9.52 KG | $569.90 | **$579.90** |
| PAPA RALLADA HASH BROWN C/8.16 KG | $649.90 | **$679.90** |
| PAPA SELECT 5/16 S/C C/13.61 KG | $579.90 | **$599.90** |
| PAPA SELECT 3/8 S/C C/13.61 KG | $579.90 | **$599.90** |
| PAPA DULCE RECTA 3/8 C/6.80 KG | $769.90 | **$799.90** |
| PAPA CONQST DELIVERY 3/8 S/C C/13.61 KG | $839.90 | **$869.90** |
| PAPA SELECT 3/8 CASCARA C/13.61 KG | $779.90 | **$824.90** |
| PAPA CONQUEST DELIVERY TEJA 6/5 C/13.61 KG | $849.90 | **$889.90** |
| PAPA THUNDER 3/8 SC C/13.61KG | $749.90 | **$799.90** |
| PAPA GAJO 10 CUT 6/5 C/13.61 KG | $749.90 | **$799.90** |
| PAPA MEGACRUNCH 1/4 C/12.24KG | $776.90 | **$799.90** |
| PAPA REJILLA SAVORY C/12.24 KG | $769.90 | **$799.90** |
| PECHUGA SIN HUESO BR | $64.90 | **$76.90** |
| CAMARON COCIDO 41/50 | $126.90 | **$132.90** |
| CAMARON 41/50 | $169.90 | **$159.90** |
| CAMARON COCIDO 100/200 | $117.90 | **$119.90** |

### Cómo se leyó la lista

El PDF de AB Foods es un escaneo **sin capa de texto**, así que los 49
renglones se leyeron de la imagen. Las secciones con cambios (papas y
pechugas) se verificaron en un render a 300 dpi, y los 28 artículos cuyo
costo no cambió coinciden al centavo con la lista del 13-oct-2026, lo que
valida la lectura de los que sí cambiaron.

## Refresco de la lista de FRUGASA (`00227`, vigencia 13-nov-2026)

La lista de FRUGASA se renueva por vigencia: la "Precios 1853" del
18-sep-2026 (la de `00196`/`00200`) quedó sustituida por la **"Precios
1897" del 13-nov-2026**. `00227` actualiza los costos y recalcula los
precios con la regla vigente (margen 1.20, tope de la competencia,
ocultar si el tope queda bajo el costo).

| | |
| --- | --- |
| Productos vinculados a FRUGASA | **135** |
| Artículos en la lista nueva | **129** |
| Costos que se movieron | **80** (41 suben, 39 bajan) |
| Costos sin cambio | **49** |
| Artículos que la lista ya no trae | **6** (conservan su costo del 18-sep; solo cambia su nota) |
| Altas | **0** — los renglones sin vincular son variantes de artículos ya vinculados o artículos que `00200` dejó fuera a propósito (huevo, varios, carbonato, chiles que ya se venden) |

Los conteos de precios recalculados y de ocultos por tope los imprime
la propia migración al correrla (`RAISE NOTICE`), igual que en
`00226`. La migración también avisa qué productos hoy ocultos ya
admiten un precio válido con el costo nuevo (entre ellos
`camote-amarillo`, `apio`, `cebolla-blanca` y `mandarina`), para
reactivarlos desde `/admin/productos` si se decide.

Al primer intento de correrla, la guarda final detuvo la migración
por un precio que ya rompía la regla B desde antes del refresco:
`achiote` tenía precio $6.32 contra un tope de $6.318 por unidad de
50 g (su costo no cambió: $114.75 en las dos listas). La migración
incluye por eso un paso de saneamiento (5c) que aplica la fórmula a
todo primario visible de FRUGASA cuyo precio rompa las reglas aunque
su costo no haya cambiado; en este refresco solo alcanza a achiote
($6.32 → $6.318).

Los 6 que salieron de la lista: `mango-ataulfo` (R0035),
`germinado-de-soya` (R0089), `tuna-fruta` (R0057), `uva-negra`
(R0161), `te-de-limon` (R0212) y `chile-cascabel` (R0108, la variante
"T Cascabel."; las demás variantes de R0108 sí vienen).

### Costos que suben (41)

| Producto | Antes | Ahora |
| --- | ---: | ---: |
| anis | $137.70 | **$270.00** |
| jitomate-saladet | $33.50 | **$66.90** |
| fresa | $59.00 | **$92.00** |
| chile-poblano | $40.50 | **$71.75** |
| kiwi | $97.50 | **$128.00** |
| chile-caribe | $37.80 | **$63.45** |
| jitomate-bola | $47.00 | **$69.15** |
| arandano-fresco | $121.50 | **$141.75** |
| tomate-verde | $27.05 | **$45.70** |
| pimiento-morron | $50.00 | **$67.50** |
| chile-chilaca | $61.25 | **$78.50** |
| chile-habanero | $160.40 | **$176.10** |
| chile-pasado | $232.90 | **$248.40** |
| canela-en-polvo | $168.75 | **$182.25** |
| granola | $68.90 | **$81.00** |
| chile-jalapeno | $27.00 | **$37.80** |
| piloncillo | $33.75 | **$44.55** |
| jamaica | $108.00 | **$117.45** |
| papaya-maradol | $33.15 | **$42.20** |
| sandia | $13.50 | **$21.60** |
| chile-serrano | $46.70 | **$54.00** |
| ejote | $47.25 | **$54.00** |
| melon-chino | $18.90 | **$25.50** |
| pepino | $17.00 | **$22.50** |
| manzana-golden | $44.00 | **$49.00** |
| calabaza | $20.00 | **$24.50** |
| jicama | $24.30 | **$28.30** |
| aguacate-hass | $63.00 | **$66.20** |
| col-blanca | $8.75 | **$10.65** |
| sal-de-mar-fina-1kg | $11.65 | **$13.50** |
| cebolla-cambray | $6.55 | **$8.30** |
| poro | $25.00 | **$26.55** |
| naranja-valencia | $39.70 | **$41.10** |
| consome-de-pollo-1kg | $52.65 | **$54.00** |
| melon-honeydew | $26.90 | **$28.25** |
| espinaca | $8.20 | **$9.20** |
| frijol-negro-1kg | $39.15 | **$39.85** |
| acelga | $8.20 | **$8.90** |
| betabel | $13.80 | **$14.20** |
| papa-blanca | $39.95 | **$40.20** |
| perejil | $6.90 | **$7.00** |

### Costos que bajan (39)

| Producto | Antes | Ahora |
| --- | ---: | ---: |
| cocoa-polvo-1kg | $309.70 | **$227.50** |
| camote-amarillo | $67.50 | **$29.70** |
| chile-colorin | $155.25 | **$121.50** |
| ajo | $70.90 | **$39.85** |
| mandarina | $84.40 | **$54.00** |
| cebolla-blanca | $54.00 | **$30.00** |
| lenteja-1kg | $40.50 | **$20.95** |
| cacahuate-japones | $108.00 | **$91.80** |
| quinoa-1kg | $129.60 | **$116.10** |
| pimienta-negra-molida | $247.05 | **$236.25** |
| brocoli | $40.00 | **$30.00** |
| uvas-verdes | $115.00 | **$105.00** |
| pina-miel | $42.95 | **$33.60** |
| apio | $32.00 | **$23.00** |
| pepita-de-calabaza | $157.30 | **$148.50** |
| uvas-rojas | $105.00 | **$96.50** |
| cebolla-morada | $35.10 | **$28.00** |
| limon-agrio | $34.55 | **$27.70** |
| amaranto | $94.50 | **$87.75** |
| chile-de-la-tierra | $209.25 | **$202.50** |
| pera | $61.00 | **$56.75** |
| cacahuate-natural-tostado | $54.00 | **$49.95** |
| coliflor | $40.50 | **$37.00** |
| pasas | $91.80 | **$88.45** |
| tamarindo | $97.20 | **$94.50** |
| avena | $27.00 | **$24.30** |
| cacahuate-enchilado | $59.40 | **$56.70** |
| pepita-de-girasol | $59.40 | **$56.70** |
| platano-macho | $28.70 | **$26.20** |
| arroz-blanco-1kg | $29.45 | **$27.00** |
| cebolla-amarilla | $25.00 | **$23.00** |
| ajonjoli | $122.85 | **$121.50** |
| chile-morita | $148.50 | **$147.15** |
| toronja | $37.80 | **$36.45** |
| guayaba | $48.95 | **$48.60** |
| manzana-roja | $57.55 | **$57.20** |
| chayote | $16.80 | **$16.75** |
| rabano | $14.40 | **$14.35** |
| cilantro | $5.20 | **$5.15** |

### Cómo se leyó la lista

El PDF de FRUGASA es digital (trae capa de texto), así que los 178
renglones se extrajeron tal cual, sin OCR. Cada uno de los 129
artículos vinculados se emparejó por SKU y columna "Opción" contra lo
cargado en `00196`/`00200`; los 49 costos que no se movieron coinciden
al centavo con la base, lo que valida el emparejamiento de los 80 que
sí cambiaron. Dos presentaciones cambiaron de texto en el sistema de
FRUGASA: `cebolla-amarilla` pasa de "T LG, O USA." a "T Jumbo, O USA."
(único renglón R0014) y `ciruelo-rojo` conserva su costo porque el SKU
R0066 sigue en $115.00.
