# Comparativa FRUGASA vs. tienda vs. competencia

> Generado el **22-sep-2026** a partir de la lista de precios de FRUGASA
> (`Precios 1853`, RESTAURANT 2, vigente al 18-sep-2026) y del catalogo de la
> tienda al momento de aplicar las migraciones `00196`-`00200`.

## La regla que se aplico

```
precio = LEAST( CEIL(costo_frugasa_por_kilo * factor * 1.20),
                tope_competencia_por_kilo * factor )
```

* `factor` es el peso de **una unidad de venta** de la tienda (`500 g` -> 0.5,
  `5 kg` -> 5, `por kilo` -> 1).
* El **tope** es el precio de la competencia normalizado a kilo, sucursal 6
  (Chihuahua Capital), con la **oferta vigente** — el precio que ve su cliente.

Decisiones del dueno que estan codificadas en `00198`:

1. El 20 % es un **margen sobre costo**, no "20 % del precio".
2. El **tope manda aunque quede por debajo del costo** (precio de entrada).
3. Los productos que se vendian por pieza, manojo o charola **pasan a venderse
   por kilo**: es la unica forma de comparar contra una lista que es por kilo
   sin inventar el peso de una pieza (`src/lib/unit-price.ts` lo prohibe).
4. Se limpia `sale_price` en todo producto cuyo precio cambio.

## Resumen

| | |
| --- | --- |
| Articulos de FRUGASA en la lista | 175 renglones / 130 SKU |
| Productos de la tienda con precio actualizado | **74** |
| Productos nuevos dados de alta | **61** |
| Subieron de precio | 49 |
| Bajaron de precio | 24 |
| Quedaron topados por la competencia | 30 |
| **Quedaron por debajo del costo de FRUGASA** | **22** |
| Sin tope (la competencia no vende el equivalente por kilo) | 44 |

### Por que la lista se lee por kilo

El PDF no trae columna de unidad. La evidencia de que es **por kilo**:

* Comparando contra el precio **regular** de la competencia, el costo de FRUGASA
  cae entre el **25 % y el 84 %** del retail (mediana ~55 %) en 35 articulos: el
  diferencial exacto de un mayorista.
* Los chiles secos y las especias solo tienen sentido por kilo (chiltepin
  $2,632.50; canela entera $430; clavo $295).
* Cuando la columna **Opcion** no es kilo, lo dice: `O Manojo` (alfalfa),
  `P MJO GDE` (epazote), `P 30 Pzas` (rabano), `P Kilo` (papaya).

## Productos actualizados (74)

| Producto | Unidad nueva | Hoy | Costo FRUGASA | x1.20 | Tope | **Nuevo** | Efecto |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Achiote | bolsa 50 g | $26.00 | $5.74 | $7.00 | $6.32 | **$6.32** | ▼ -19.68 |
| Aguacate Hass | por kilo | $60.00 | $63.00 | $76.00 | $69.90 | **$69.90** | ▲ +9.90 |
| Almendras 500g | 500g | $175.00 | $123.53 | $149.00 | $199.94 | **$149.00** | ▼ -26.00 |
| Arroz Blanco 1kg | 1 kg | $26.00 | $29.45 | $36.00 | $37.45 | **$36.00** | ▲ +10.00 |
| Azúcar Refinada 5kg | 5kg | $85.00 | $136.50 | $164.00 | $199.50 | **$164.00** | ▲ +79.00 |
| Betabel | por kilo | $22.00 | $13.80 | $17.00 | $29.90 | **$17.00** | ▼ -5.00 |
| Canela en Polvo | frasco 100 g | $32.00 | $16.88 | $21.00 | $57.25 | **$21.00** | ▼ -11.00 |
| Cebolla Blanca ⚠️ | por kilo | $20.00 | $54.00 | $65.00 | $49.90 | **$49.90** | ▲ +29.90 |
| Cebolla Morada | por kilo | $25.00 | $35.10 | $43.00 | $59.90 | **$43.00** | ▲ +18.00 |
| Champiñón | por kilo | $58.00 | $27.00 | $33.00 | $155.33 | **$33.00** | ▼ -25.00 |
| Chile Habanero | por 100 g | $15.00 | $16.04 | $20.00 | — | **$20.00** | ▲ +5.00 |
| Chile Jalapeño | por kilo | $22.00 | $27.00 | $33.00 | $36.90 | **$33.00** | ▲ +11.00 |
| Chile Poblano | por kilo | $28.00 | $40.50 | $49.00 | $49.90 | **$49.00** | ▲ +21.00 |
| Chile Serrano ⚠️ | por kilo | $25.00 | $46.70 | $57.00 | $36.90 | **$36.90** | ▲ +11.90 |
| Cocoa en Polvo 1kg | 1kg | $155.00 | $309.70 | $372.00 | $447.20 | **$372.00** | ▲ +217.00 |
| Comino Molido 500g | 500g | $88.00 | $51.98 | $63.00 | $156.43 | **$63.00** | ▼ -25.00 |
| Consomé de Pollo 1kg | 1 kg | $45.00 | $52.65 | $64.00 | $159.87 | **$64.00** | ▲ +19.00 |
| Frijol Negro 1kg | 1 kg | $35.00 | $39.15 | $47.00 | $54.90 | **$47.00** | ▲ +12.00 |
| Guayaba ⚠️ | por kilo | $35.00 | $48.95 | $59.00 | $36.90 | **$36.90** | ▲ +1.90 |
| Hoja de Laurel | bolsa 20 g | $25.00 | $2.75 | $4.00 | $10.90 | **$4.00** | ▼ -21.00 |
| Jengibre Fresco | por 100 g | $28.00 | $12.15 | $15.00 | $16.99 | **$15.00** | ▼ -13.00 |
| Jitomate Bola ⚠️ | por kilo | $26.00 | $47.00 | $57.00 | $26.90 | **$26.90** | ▲ +0.90 |
| Jitomate Saladet ⚠️ | por kilo | $24.00 | $33.50 | $41.00 | $29.90 | **$29.90** | ▲ +5.90 |
| Kale Orgánico 1kg | kg | $246.00 | $57.40 | $69.00 | — | **$69.00** | ▼ -177.00 |
| Lenteja 1kg | 1 kg | $28.00 | $40.50 | $49.00 | $55.80 | **$49.00** | ▲ +21.00 |
| Limón Agrio | por kilo | $32.00 | $34.55 | $42.00 | $42.90 | **$42.00** | ▲ +10.00 |
| Mandarina ⚠️ | por kilo | $30.00 | $84.40 | $102.00 | $69.90 | **$69.90** | ▲ +39.90 |
| Manzana Roja ⚠️ | por kilo | $38.00 | $57.55 | $70.00 | $49.90 | **$49.90** | ▲ +11.90 |
| Naranja Valencia | por kilo | $28.00 | $39.70 | $48.00 | $39.90 | **$39.90** | ▲ +11.90 |
| Nopal ⚠️ | por kilo | $32.00 | $47.25 | $57.00 | $44.90 | **$44.90** | ▲ +12.90 |
| Nuez de Castilla ⚠️ | bolsa 200 g | $26.00 | $97.20 | $117.00 | $89.90 | **$89.90** | ▲ +63.90 |
| Orégano Molido 100g | 100 g | $16.00 | $8.78 | $11.00 | $29.75 | **$11.00** | ▼ -5.00 |
| Papa Blanca | por kilo | $22.00 | $39.95 | $48.00 | $56.90 | **$48.00** | ▲ +26.00 |
| Pasas | bolsa 200 g | $35.00 | $18.36 | $23.00 | $31.12 | **$23.00** | ▼ -12.00 |
| Pepino | por kilo | $12.00 | $17.00 | $21.00 | $19.90 | **$19.90** | ▲ +7.90 |
| Pera ⚠️ | por kilo | $35.00 | $61.00 | $74.00 | $49.90 | **$49.90** | ▲ +14.90 |
| Pimentón | frasco 100 g | $22.00 | $17.01 | $21.00 | $80.86 | **$21.00** | ▼ -1.00 |
| Pimienta Negra Molida 500g | 500g | $95.00 | $123.53 | $149.00 | $530.47 | **$149.00** | ▲ +54.00 |
| Pimiento Morrón | por kilo | $30.00 | $50.00 | $60.00 | $54.90 | **$54.90** | ▲ +24.90 |
| Plátano Macho | por kilo | $22.00 | $28.70 | $35.00 | $39.90 | **$35.00** | ▲ +13.00 |
| Quinoa 1kg | 1kg | $120.00 | $129.60 | $156.00 | $199.80 | **$156.00** | ▲ +36.00 |
| Sal de Mar Fina 1kg | 1 kg | $12.00 | $11.65 | $14.00 | $22.90 | **$14.00** | ▲ +2.00 |
| Sandía | por kilo | $14.00 | $13.50 | $17.00 | $19.90 | **$17.00** | ▲ +3.00 |
| Semilla de Chía 1kg | pz | $219.00 | $141.75 | $171.00 | $196.33 | **$171.00** | ▼ -48.00 |
| Tomate Verde | por kilo | $28.00 | $27.05 | $33.00 | $36.90 | **$33.00** | ▲ +5.00 |
| Toronja | por kilo | $28.00 | $37.80 | $46.00 | $39.90 | **$39.90** | ▲ +11.90 |
| Uvas Rojas ⚠️ | por kilo | $65.00 | $105.00 | $126.00 | $79.90 | **$79.90** | ▲ +14.90 |
| Uvas Verdes ⚠️ | por kilo | $58.00 | $115.00 | $138.00 | $99.90 | **$99.90** | ▲ +41.90 |
| Zanahoria | por kilo | $16.00 | $12.00 | $15.00 | $16.90 | **$15.00** | ▼ -1.00 |
| Ajo | por kilo (antes: por cabeza) | $15.00 | $70.90 | $86.00 | — | **$86.00** | ▲ +71.00 |
| Apio ⚠️ | por kilo (antes: por pieza) | $28.00 | $32.00 | $39.00 | $24.90 | **$24.90** | ▼ -3.10 |
| Brócoli | por kilo (antes: por pieza) | $25.00 | $40.00 | $48.00 | $49.90 | **$48.00** | ▲ +23.00 |
| Cebolla Cambray | por kilo (antes: por manojo) | $42.00 | $6.55 | $8.00 | — | **$8.00** | ▼ -34.00 |
| Chayote | por kilo (antes: por pieza) | $22.00 | $16.80 | $21.00 | $29.90 | **$21.00** | ▼ -1.00 |
| Cilantro | por kilo (antes: por manojo) | $8.00 | $5.20 | $7.00 | — | **$7.00** | ▼ -1.00 |
| Col Blanca | por kilo (antes: por pieza) | $45.00 | $8.75 | $11.00 | $23.90 | **$11.00** | ▼ -34.00 |
| Coliflor | por kilo (antes: por pieza) | $28.00 | $40.50 | $49.00 | — | **$49.00** | ▲ +21.00 |
| Elote | por kilo (antes: por pieza) | $8.00 | $9.45 | $12.00 | — | **$12.00** | ▲ +4.00 |
| Epazote | por kilo (antes: por manojo) | $12.00 | $20.15 | $25.00 | — | **$25.00** | ▲ +13.00 |
| Espinaca | por kilo (antes: por manojo) | $18.00 | $8.20 | $10.00 | — | **$10.00** | ▼ -8.00 |
| Fresa | por kilo (antes: charola 500 g) | $48.00 | $59.00 | $71.00 | — | **$71.00** | ▲ +23.00 |
| Germinado de Soya ⚠️ | por kilo (antes: bolsa 200 g) | $25.00 | $51.30 | $62.00 | $49.90 | **$49.90** | ▲ +24.90 |
| Hierbabuena Fresca | por kilo (antes: por manojo) | $30.00 | $14.20 | $18.00 | — | **$18.00** | ▼ -12.00 |
| Jitomate Cherry | por kilo (antes: charola 250 g) | $32.00 | $43.90 | $53.00 | — | **$53.00** | ▲ +21.00 |
| Lechuga Romana | por kilo (antes: por pieza) | $26.00 | $21.00 | $26.00 | — | **$26.00** | igual |
| Mango Ataúlfo | por kilo (antes: por pieza) | $25.00 | $122.40 | $147.00 | — | **$147.00** | ▲ +122.00 |
| Melón Chino | por kilo (antes: por pieza) | $35.00 | $18.90 | $23.00 | $29.90 | **$23.00** | ▼ -12.00 |
| Papaya Maradol | por kilo (antes: por pieza) | $38.00 | $33.15 | $40.00 | $39.90 | **$39.90** | ▲ +1.90 |
| Perejil | por kilo (antes: por manojo) | $10.00 | $6.90 | $9.00 | — | **$9.00** | ▼ -1.00 |
| Piña Miel ⚠️ | por kilo (antes: por pieza) | $32.00 | $42.95 | $52.00 | $39.90 | **$39.90** | ▲ +7.90 |
| Rábano | por kilo (antes: por manojo) | $55.00 | $14.40 | $18.00 | — | **$18.00** | ▼ -37.00 |
| Romero Fresco | por kilo (antes: por manojo) | $42.00 | $40.40 | $49.00 | — | **$49.00** | ▲ +7.00 |
| Tomillo Fresco | por kilo (antes: por manojo) | $28.00 | $162.00 | $195.00 | — | **$195.00** | ▲ +167.00 |
| Zarzamora | por kilo (antes: charola 170 g) | $32.00 | $81.00 | $98.00 | — | **$98.00** | ▲ +66.00 |

> **Ojo con las 25 filas que dicen `por kilo (antes: ...)`.** El cambio de
> unidad hace que la columna *Efecto* no sea comparable: el Ajo pasaba de $15
> por cabeza a $86 por kilo, pero una cabeza pesa ~60 g, asi que por gramo el
> precio **baja** (de ~$250/kg a $86/kg). Lo mismo aplica a manojo y charola.

## Productos nuevos (61)

Todos se venden **por kilo**, en `Frutas y Verduras` (1) o `Abarrotes` (2).

| Producto | Categoria | Costo FRUGASA | x1.20 | Tope | **Precio** | Imagen |
| --- | --- | --- | --- | --- | --- | --- |
| Acelga | Frutas y Verduras | $8.20 | $10.00 | — | **$10.00** | reutilizada |
| Alfalfa Germinado | Frutas y Verduras | $6.00 | $8.00 | — | **$8.00** | reutilizada |
| Apio en Palitos con Aderezo Mr. Lucky | Frutas y Verduras | $35.00 | $42.00 | — | **$42.00** | pendiente |
| Arándano Fresco | Frutas y Verduras | $121.50 | $146.00 | $293.53 | **$146.00** | reutilizada |
| Blue Berry | Frutas y Verduras | $81.00 | $98.00 | $293.53 | **$98.00** | reutilizada |
| Calabaza | Frutas y Verduras | $20.00 | $24.00 | $79.90 | **$24.00** | reutilizada |
| Camote Amarillo | Frutas y Verduras | $67.50 | $81.00 | $49.90 | **$49.90** | reutilizada |
| Cebolla Amarilla | Frutas y Verduras | $25.00 | $30.00 | — | **$30.00** | reutilizada |
| Chacal | Frutas y Verduras | $74.25 | $90.00 | — | **$90.00** | pendiente |
| Chile Caribe | Frutas y Verduras | $37.80 | $46.00 | — | **$46.00** | reutilizada |
| Chile Chilaca | Frutas y Verduras | $61.25 | $74.00 | $59.90 | **$59.90** | reutilizada |
| Chícharo | Frutas y Verduras | $29.70 | $36.00 | — | **$36.00** | reutilizada |
| Ciruelo Negro | Frutas y Verduras | $115.00 | $138.00 | $39.90 | **$39.90** | pendiente |
| Ciruelo Rojo | Frutas y Verduras | $115.00 | $138.00 | $39.90 | **$39.90** | pendiente |
| Durazno | Frutas y Verduras | $166.20 | $200.00 | $99.90 | **$99.90** | pendiente |
| Ejote | Frutas y Verduras | $47.25 | $57.00 | $109.80 | **$57.00** | reutilizada |
| Ensalada César Mr. Lucky | Frutas y Verduras | $64.00 | $77.00 | — | **$77.00** | pendiente |
| Ensalada Primavera Mr. Lucky | Frutas y Verduras | $47.00 | $57.00 | — | **$57.00** | pendiente |
| Espárrago | Frutas y Verduras | $175.50 | $211.00 | — | **$211.00** | pendiente |
| Frambuesa | Frutas y Verduras | $81.00 | $98.00 | — | **$98.00** | reutilizada |
| Jícama | Frutas y Verduras | $24.30 | $30.00 | — | **$30.00** | pendiente |
| Kiwi | Frutas y Verduras | $97.50 | $117.00 | $129.90 | **$117.00** | pendiente |
| Manzana Golden | Frutas y Verduras | $44.00 | $53.00 | $49.90 | **$49.90** | pendiente |
| Maíz Rosero | Frutas y Verduras | $40.50 | $49.00 | — | **$49.00** | reutilizada |
| Mejorana Fresca | Frutas y Verduras | $205.20 | $247.00 | — | **$247.00** | reutilizada |
| Melón Honeydew | Frutas y Verduras | $26.90 | $33.00 | — | **$33.00** | pendiente |
| Menta Fresca | Frutas y Verduras | $15.20 | $19.00 | — | **$19.00** | reutilizada |
| Poro | Frutas y Verduras | $25.00 | $30.00 | — | **$30.00** | pendiente |
| Tuna (fruta) | Frutas y Verduras | $17.05 | $21.00 | — | **$21.00** | pendiente |
| Té de Limón | Frutas y Verduras | $9.15 | $11.00 | — | **$11.00** | pendiente |
| Uva Negra | Frutas y Verduras | $38.00 | $46.00 | — | **$46.00** | pendiente |
| Ajonjolí | Abarrotes | $122.85 | $148.00 | $176.67 | **$148.00** | pendiente |
| Albahaca | Abarrotes | $57.95 | $70.00 | $1,795.00 | **$70.00** | reutilizada |
| Amaranto | Abarrotes | $94.50 | $114.00 | $139.60 | **$114.00** | reutilizada |
| Anís | Abarrotes | $137.70 | $166.00 | $1,960.71 | **$166.00** | reutilizada |
| Avena | Abarrotes | $27.00 | $33.00 | $35.90 | **$33.00** | reutilizada |
| Cacahuate Enchilado | Abarrotes | $59.40 | $72.00 | — | **$72.00** | reutilizada |
| Cacahuate Japonés | Abarrotes | $108.00 | $130.00 | $143.89 | **$130.00** | reutilizada |
| Cacahuate Natural Tostado | Abarrotes | $54.00 | $65.00 | — | **$65.00** | reutilizada |
| Chile Cascabel | Abarrotes | $472.50 | $567.00 | $439.00 | **$439.00** | reutilizada |
| Chile Chiltepín | Abarrotes | $2,632.50 | $3,159.00 | $1,916.00 | **$1,916.00** | reutilizada |
| Chile Colorín | Abarrotes | $155.25 | $187.00 | $269.00 | **$187.00** | reutilizada |
| Chile De la Tierra | Abarrotes | $209.25 | $252.00 | — | **$252.00** | reutilizada |
| Chile Mirasol | Abarrotes | $236.25 | $284.00 | $369.00 | **$284.00** | reutilizada |
| Chile Morita | Abarrotes | $148.50 | $179.00 | $249.00 | **$179.00** | reutilizada |
| Chile Pasado | Abarrotes | $232.90 | $280.00 | $333.00 | **$280.00** | reutilizada |
| Ciruela Pasa | Abarrotes | $141.75 | $171.00 | $314.00 | **$171.00** | reutilizada |
| Clavo | Abarrotes | $295.00 | $354.00 | $697.50 | **$354.00** | pendiente |
| Coco Rayado | Abarrotes | $91.80 | $111.00 | $265.33 | **$111.00** | pendiente |
| Cúrcuma | Abarrotes | $168.75 | $203.00 | $269.50 | **$203.00** | reutilizada |
| Gragea | Abarrotes | $67.50 | $81.00 | — | **$81.00** | pendiente |
| Granola | Abarrotes | $68.90 | $83.00 | $93.80 | **$83.00** | pendiente |
| Haba | Abarrotes | $130.15 | $157.00 | $159.80 | **$157.00** | reutilizada |
| Jamaica | Abarrotes | $108.00 | $130.00 | $364.50 | **$130.00** | reutilizada |
| Linaza | Abarrotes | $39.15 | $47.00 | $113.00 | **$47.00** | reutilizada |
| Pepita de Calabaza | Abarrotes | $157.30 | $189.00 | $371.60 | **$189.00** | reutilizada |
| Pepita de Girasol | Abarrotes | $59.40 | $72.00 | $187.60 | **$72.00** | reutilizada |
| Piloncillo | Abarrotes | $33.75 | $41.00 | $111.80 | **$41.00** | reutilizada |
| Tamarindo | Abarrotes | $97.20 | $117.00 | $124.75 | **$117.00** | reutilizada |
| Tapioca | Abarrotes | $83.70 | $101.00 | $156.47 | **$101.00** | reutilizada |
| Trigo Entero | Abarrotes | $17.55 | $22.00 | — | **$22.00** | reutilizada |

## ⚠️ Revision manual: precio por debajo del costo (22)

Es el **tope de la competencia**, no un error de calculo: son productos donde
la competencia vende mas barato de lo que FRUGASA nos cobra. Quedaron asi por
decision explicita del dueno ("precio de entrada"). Si el margen negativo no se
quiere sostener, hay que **cambiar de proveedor para ese articulo o dejar de
venderlo**, no subir el precio: subirlo rompe la regla de no ser mas caros.

| Producto | Costo (por unidad de venta) | Precio de venta | Margen | Tope que lo fuerza |
| --- | --- | --- | --- | --- |
| Chile Chiltepín | $2,632.50 | $1,916.00 | $-716.50 | CHILE CHILTEPIN MIMARCA  25 GRAMOS |
| Azúcar Refinada 5kg | $682.50 | $164.00 | $-518.50 | Azucar Refinada Zulka 1 kg |
| Ciruelo Rojo | $115.00 | $39.90 | $-75.10 | Ciruela de temporada  Kg |
| Ciruelo Negro | $115.00 | $39.90 | $-75.10 | Ciruela de temporada  Kg |
| Durazno | $166.20 | $99.90 | $-66.30 | Durazno  Kg |
| Chile Cascabel | $472.50 | $439.00 | $-33.50 | CHILE SECO CASCABEL MOBEE 100 GRAMOS |
| Uvas Rojas | $105.00 | $79.90 | $-25.10 | Uva Roja  Kg |
| Jitomate Bola | $47.00 | $26.90 | $-20.10 | Tomate bola  Kg |
| Camote Amarillo | $67.50 | $49.90 | $-17.60 | Camote  Kg |
| Uvas Verdes | $115.00 | $99.90 | $-15.10 | Uva blanca sin semilla  kg |
| Mandarina | $84.40 | $69.90 | $-14.50 | Mandarina  Por Kg |
| Guayaba | $48.95 | $36.90 | $-12.05 | Guayaba  Kg |
| Pera | $61.00 | $49.90 | $-11.10 | Pera de Anjou  Kg |
| Chile Serrano | $46.70 | $36.90 | $-9.80 | Chile Serrano  Kg |
| Manzana Roja | $57.55 | $49.90 | $-7.65 | Manzana red delicious  por kg |
| Apio | $32.00 | $24.90 | $-7.10 | Apio  Kg |
| Cebolla Blanca | $54.00 | $49.90 | $-4.10 | Cebolla Blanca Premium Alsuper Por Kg |
| Jitomate Saladet | $33.50 | $29.90 | $-3.60 | Tomate Saladet  Kg |
| Piña Miel | $42.95 | $39.90 | $-3.05 | Piña miel  Kg |
| Nopal | $47.25 | $44.90 | $-2.35 | Nopal en Penca Limpio  Kg |
| Germinado de Soya | $51.30 | $49.90 | $-1.40 | Germinado Soya  Kg |
| Chile Chilaca | $61.25 | $59.90 | $-1.35 | Chile Chilaca  Kg |

## Sin tope: la competencia no vende el equivalente por kilo (44)

Para estos no existe una comparacion valida: la competencia solo los vende por
pieza o por manojo. Se prefirio **no inventar** un tope antes que inventar un
precio de referencia falso (`src/lib/unit-price.ts`). Quedan con el margen puro
de 20 % y conviene revisarlos a mano:

* **Acelga** — $10.00 (costo $8.20)
* **Ajo** — $86.00 (costo $70.90)
* **Alfalfa Germinado** — $8.00 (costo $6.00)
* **Apio en Palitos con Aderezo Mr. Lucky** — $42.00 (costo $35.00)
* **Cacahuate Enchilado** — $72.00 (costo $59.40)
* **Cacahuate Natural Tostado** — $65.00 (costo $54.00)
* **Cebolla Amarilla** — $30.00 (costo $25.00)
* **Cebolla Cambray** — $8.00 (costo $6.55)
* **Chacal** — $90.00 (costo $74.25)
* **Chile Caribe** — $46.00 (costo $37.80)
* **Chile De la Tierra** — $252.00 (costo $209.25)
* **Chile Habanero** — $20.00 (costo $1.60)
* **Chícharo** — $36.00 (costo $29.70)
* **Cilantro** — $7.00 (costo $5.20)
* **Coliflor** — $49.00 (costo $40.50)
* **Elote** — $12.00 (costo $9.45)
* **Ensalada César Mr. Lucky** — $77.00 (costo $64.00)
* **Ensalada Primavera Mr. Lucky** — $57.00 (costo $47.00)
* **Epazote** — $25.00 (costo $20.15)
* **Espinaca** — $10.00 (costo $8.20)
* **Espárrago** — $211.00 (costo $175.50)
* **Frambuesa** — $98.00 (costo $81.00)
* **Fresa** — $71.00 (costo $59.00)
* **Gragea** — $81.00 (costo $67.50)
* **Hierbabuena Fresca** — $18.00 (costo $14.20)
* **Jitomate Cherry** — $53.00 (costo $43.90)
* **Jícama** — $30.00 (costo $24.30)
* **Kale Orgánico 1kg** — $69.00 (costo $57.40)
* **Lechuga Romana** — $26.00 (costo $21.00)
* **Mango Ataúlfo** — $147.00 (costo $122.40)
* **Maíz Rosero** — $49.00 (costo $40.50)
* **Mejorana Fresca** — $247.00 (costo $205.20)
* **Melón Honeydew** — $33.00 (costo $26.90)
* **Menta Fresca** — $19.00 (costo $15.20)
* **Perejil** — $9.00 (costo $6.90)
* **Poro** — $30.00 (costo $25.00)
* **Romero Fresco** — $49.00 (costo $40.40)
* **Rábano** — $18.00 (costo $14.40)
* **Tomillo Fresco** — $195.00 (costo $162.00)
* **Trigo Entero** — $22.00 (costo $17.55)
* **Tuna (fruta)** — $21.00 (costo $17.05)
* **Té de Limón** — $11.00 (costo $9.15)
* **Uva Negra** — $46.00 (costo $38.00)
* **Zarzamora** — $98.00 (costo $81.00)

## Lo que quedo fuera, a proposito

| Articulo de FRUGASA | Por que |
| --- | --- |
| `HUEVO` (R0097, $39.50/kg) | La tienda vende `Huevo Blanco 18pz` por pieza.
  Convertir exigiria suponer el peso del huevo. **Queda sin actualizar.** |
| `VARIOS T Extras` (R0124) | No es un producto: es un renglon de extras. |
| `CARBONATO` (R0241) | La tienda ya vende `Bicarbonato de Sodio 500g`; el
  nombre es ambiguo y podria ser el mismo articulo. |
| `CHILES SECOS` Guajillo, Pasilla, Chipotle, de Arbol | La tienda ya los vende
  (R0108 se despliega por variedad: se dieron de alta las 7 que faltaban). |
| `Cacahuate Salado` | Ya existe `Cacahuate Salado 200g`. |

## Como refrescar los topes

Los precios de la competencia cambian. El ciclo es:

```bash
node scripts/alsuper-prices-sync.mjs --dry-run   # ver que va a cambiar
node scripts/alsuper-prices-sync.mjs             # refrescar competitor_prices
npx supabase migration repair --status reverted 00198 && npx supabase db push
```

La ultima linea re-aplica `00198` (que solo recalcula desde el costo y el tope).
El script necesita `SUPABASE_SERVICE_ROLE_KEY`; en `.env.local` local esa llave
esta vacia, asi que **desde una maquina sin la llave solo corre el `--dry-run`**.

### Las cinco migraciones se pueden re-ejecutar

Se verifico re-corriendo `00196`-`00200` completas sobre la base ya migrada y
comparando un snapshot de los 536 productos antes y despues: **identico**.

`00197` y `00199` son la excepcion historica que conviene entender: en
produccion `00197` se aplico con una `UNIQUE` sobre el producto del rival
(uno-a-uno) y `00199` la reemplazo por la pareja (nuestro producto, rival),
porque `ciruelo-rojo`/`ciruelo-negro` y `arandano-fresco`/`blue-berry`
comparten comparable. `00197` ya crea la restriccion correcta desde el inicio,
asi que `00199` es una no-op en una base nueva y se conserva porque **en
produccion es la que hizo el cambio**.

El catalogo esta cacheado (`unstable_cache`, TTL 300-3600 s): los precios
nuevos tardan hasta 5 minutos en verse en la tienda.

### Indice publico de precios

`/precios` lee el snapshot de `price_index`, que **hoy esta vacio** (nunca se ha
generado). El job `price-index` de `/api/cron/daily` lo recalcula a diario, asi
que el proximo corte ya sale con estos precios. No requiere accion manual.
