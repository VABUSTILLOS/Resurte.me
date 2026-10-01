-- ============================================================
-- 00202 — Dos reglas de precio para los dos proveedores cargados
--
--   A) NINGUN producto por debajo del costo (no vender a perdida).
--   B) NINGUN producto mas caro que en la competencia.
--
-- QUE CAMBIA RESPECTO A LO DESPLEGADO
-- -----------------------------------
--  · `00191` publico AB Foods con `CEIL(costo x 1.18)` y **sin tope**: la
--    regla del tope llego despues, con `00198`, y solo para FRUGASA. Aqui se
--    cierra ese hueco (5 articulos bajan de precio).
--  · `00198` puso el tope de FRUGASA **por encima** del costo aunque quedara
--    por debajo, por decision del dueno ("precio de entrada"). Esa decision
--    se revierte: un producto que no se puede vender sin perder dinero y sin
--    ser mas caro que el rival **se oculta** (22 articulos).
--  · El snapshot de la competencia se REFRESCA (1-oct-2026). El de `00197`
--    era del 22-sep y sus precios ya se movieron: 8 de los 74 articulos de
--    FRUGASA daban otro numero hoy, y un articulo del rival cambio de nombre
--    (`Manzana red delicious por kg` -> `Manzana Red Chihuahua  Kg`).
--
-- POR QUE OCULTAR Y NO SUBIR EL PRECIO
-- ------------------------------------
-- Cuando el rival lo vende mas barato de lo que nos cuesta no existe precio
-- que cumpla A y B: subir rompe B, bajar rompe A. Ocultar es la unica salida
-- coherente, y es reversible desde el panel (`/admin/productos`).
--
-- LA TRAMPA DE `product_suppliers.cost`
-- -------------------------------------
-- Los dos proveedores guardan el costo en BASES DISTINTAS, porque los
-- escribieron dos migraciones distintas:
--
--   · `frugasa`  -> POR KILO   (`00196`, la lista del proveedor es por kilo)
--   · `ab-foods` -> POR UNIDAD DE VENTA (`00191`, la lista es por caja/bolsa)
--
-- Por eso el costo por kilo se calcula distinto para cada uno. NO se unifica
-- aqui: cambiar la base de AB Foods romperia el `CEIL(costo x 1.18)` que
-- `00191` dejo escrito. Queda como deuda tecnica conocida.
--
-- El factor (`kg` de una unidad de venta) no es una columna: vive en el
-- nombre del producto ("caja 13.61 kg") y por eso se escribe aqui, como ya
-- hace `00198` para FRUGASA. Solo se listan los que NO son 1.
--
-- Idempotente: re-ejecutarla recalcula lo mismo desde el costo y el tope.
-- ============================================================

DO $$
DECLARE
  v_precio int;
  v_ocultos int;
  v_bajo_costo int;
  v_mas_caros int;
BEGIN
  -- Peso de una unidad de venta, en kg. Solo los distintos de 1.
  CREATE TEMP TABLE _unidad_kg (
    slug text PRIMARY KEY,
    kg   numeric(12,4) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _unidad_kg (slug, kg) VALUES
    ('achiote', 0.0500),
    ('aguacate-chunky-caja-7264kg', 7.2640),
    ('almendras-500g', 0.5000),
    ('aros-cebolla-bolsa-907g', 0.9070),
    ('azucar-refinada-5kg', 5.0000),
    ('canela-en-polvo', 0.1000),
    ('chile-habanero', 0.1000),
    ('comino-molido', 0.5000),
    ('dedos-queso-bolsa-181kg', 1.8100),
    ('hamburguesa-bm-arrachera-caja-30pzs', 4.5000),
    ('hamburguesa-bm-mezquite-caja-30pzs', 4.5000),
    ('hamburguesa-bm-sirloin-caja-30pzs', 4.5000),
    ('hoja-de-laurel', 0.0200),
    ('jengibre-fresco', 0.1000),
    ('nuez-de-castilla', 0.2000),
    ('oregano-molido-100g', 0.1000),
    ('papa-conquest-14-caja-1633kg', 16.3300),
    ('papa-conquest-delivery-38-sc-caja-1361kg', 13.6100),
    ('papa-conquest-delivery-teja-65-caja-1361kg', 13.6100),
    ('papa-curly-savory-caja-1361kg', 13.6100),
    ('papa-dulce-recta-38-caja-680kg', 6.8000),
    ('papa-francesa-14-payette-caja-1224kg', 12.2400),
    ('papa-francesa-38-payette-caja-1361kg', 13.6100),
    ('papa-gajo-10-cut-65-caja-1361kg', 13.6100),
    ('papa-hash-brown-patty-caja-952kg', 9.5200),
    ('papa-megacrunch-14-caja-1224kg', 12.2400),
    ('papa-ondulada-38-payette-caja-1361kg', 13.6100),
    ('papa-rallada-hash-brown-caja-816kg', 8.1600),
    ('papa-rejilla-savory-caja-1224kg', 12.2400),
    ('papa-select-38-cascara-caja-1361kg', 13.6100),
    ('papa-select-38-sc-caja-1361kg', 13.6100),
    ('papa-select-516-sc-caja-1361kg', 13.6100),
    ('papa-thunder-38-sc-caja-1361kg', 13.6100),
    ('pasas', 0.2000),
    ('pimenton', 0.1000),
    ('pimienta-negra-molida', 0.5000),
    ('queso-crema-krol-barra-136kg', 1.3600),
    ('queso-crema-reny-picot-136kg', 1.3600),
    ('queso-crema-reny-picot-caja-8kg', 8.0000);

  -- Snapshot de la competencia (sucursal 6, Chihuahua Capital), 1-oct-2026.
  -- `cap_kg` es el precio del rival normalizado a kilo; NULL cuando la
  -- presentacion no es un peso, y entonces no hay tope.
  CREATE TEMP TABLE _tope (
    slug        text PRIMARY KEY,
    al_id       text NOT NULL,
    al_name     text NOT NULL,
    al_format   text,
    al_price    numeric(12,2) NOT NULL,
    al_regular  numeric(12,2),
    cap_kg      numeric(12,2)
  ) ON COMMIT DROP;

  INSERT INTO _tope (slug, al_id, al_name, al_format, al_price, al_regular, cap_kg) VALUES
    ('aguacate-hass', '4', 'Aguacate Hass  Kg', '1 KG', 64.90, 89.90, 64.90),
    ('betabel', '68', 'Betabel  Kg', 'KG', 29.90, 42.90, 29.90),
    ('cebolla-blanca', '924', 'Cebolla Blanca Premium Alsuper Por Kg', 'KG', 49.90, 99.90, 49.90),
    ('cebolla-morada', '151', 'Cebolla Morada  Kg', 'KG', 59.90, 79.90, 59.90),
    ('champinon', '1209', 'Champiñón Blanco Monte Blanco 450 g', '450 GR', 69.90, 69.90, 155.33),
    ('guayaba', '58', 'Guayaba  Kg', 'KG', 39.90, 64.90, 39.90),
    ('chile-jalapeno', '24', 'Chile Jalapeño  Kg', 'KG', 39.90, 64.90, 39.90),
    ('mandarina', '48', 'Mandarina  Por Kg', '1 KG', 69.90, 99.90, 69.90),
    ('manzana-roja', '37', 'Manzana Red Chihuahua  Kg', '1 KG', 49.90, 69.90, 49.90),
    ('pimiento-morron', '62', 'Pimiento Morrón Verde  Kg', '1 KG', 49.90, 79.90, 49.90),
    ('naranja-valencia', '7', 'Naranja Valencia  Kg', '1 KG', 39.90, 69.90, 39.90),
    ('nopal', '239', 'Nopal en Penca Limpio  Kg', '1 KG', 44.90, 74.90, 44.90),
    ('papa-blanca', '922', 'Papa Blanca Primera Alsuper Kg', 'KG', 49.90, 99.90, 49.90),
    ('pepino', '12', 'Pepino   Kg', '1 KG', 22.90, 39.90, 22.90),
    ('pera', '40', 'Pera de Anjou  Kg', '1 KG', 49.90, 89.90, 49.90),
    ('platano-macho', '136', 'Plátano macho  Kg', 'KG', 39.90, 59.90, 39.90),
    ('sandia', '21', 'Sandía  Kg', 'KG', 19.90, 38.90, 19.90),
    ('jitomate-bola', '2', 'Tomate bola  Kg', '1 KG', 26.90, 64.90, 26.90),
    ('jitomate-saladet', '98', 'Tomate Saladet  Kg', '1 KG', 26.90, 64.90, 26.90),
    ('tomate-verde', '65', 'Tomatillo  Kg', 'KG', 39.90, 49.90, 39.90),
    ('toronja', '52', 'Toronja  Kg', '1 KG', 39.90, 59.90, 39.90),
    ('uvas-rojas', '35', 'Uva Roja  Kg', '1 KG', 89.90, 139.90, 89.90),
    ('uvas-verdes', '34', 'Uva blanca sin semilla  kg', '1 KG', 99.90, 149.90, 99.90),
    ('zanahoria', '11', 'Zanahoria  Kg', '1 KG', 16.90, 29.90, 16.90),
    ('chile-poblano', '91', 'Chile Poblano  Kg', 'KG', 49.90, 74.90, 49.90),
    ('chile-serrano', '92', 'Chile Serrano  Kg', 'KG', 36.90, 99.90, 36.90),
    ('jengibre-fresco', '189', 'Jengibre  Kg', 'KG', 169.90, 169.90, 169.90),
    ('limon-agrio', '3', 'Limón Agrio    Kg', '1 KG', 34.90, 69.90, 34.90),
    ('frijol-negro-1kg', '313823', 'Frijol Negro Verde Valle 1 kg', '1 KG', 54.90, 61.90, 54.90),
    ('arroz-blanco-1kg', '374296', 'Arroz Super Extra Verde Valle 2 kg', '2 KG', 74.90, 79.90, 37.45),
    ('lenteja-1kg', '7126666', 'Lenteja  Verde Valle 500 g', '500 GR', 27.90, 32.90, 55.80),
    ('quinoa-1kg', '397245', 'Quinoa  Pick-One 500 g', '500 GR', 99.90, 109.90, 199.80),
    ('semilla-chia-1kg', '402199', 'Chia  Semilla Okko 300 g', '300 GR', 58.90, 64.90, 196.33),
    ('consome-de-pollo-1kg', '465253', 'Consome de pollo en Caldo  Knorr 750 g', '750 GR', 119.90, 144.90, 159.87),
    ('sal-de-mar-fina-1kg', '422481', 'Sal Natural De Mar en grano La Fina 1 kg', '1 KG', 22.90, 22.90, 22.90),
    ('azucar-refinada-5kg', '404071', 'Azucar Refinada Zulka 1 kg', '1 KG', 39.90, 39.90, 39.90),
    ('cocoa-polvo-1kg', '446931', 'Cocoa Natural   Molina 125 g', '125 GR', 55.90, 55.90, 447.20),
    ('pimenton', '413529', 'Pimenton Dulce Frasco Paprika Terana 58 Gr', '58 GR', 46.90, 46.90, 808.62),
    ('hoja-de-laurel', '362880', 'Hoja De Laurel Mimarca 20 Gr', '20 GR', 10.90, 10.90, 545.00),
    ('comino-molido', '313721', 'Comino Molido Mimarca 70 Gr', '70 GR', 21.90, 21.90, 312.86),
    ('oregano-molido-100g', '362884', 'Oregano Mimarca 40 Gr', '40 GR', 11.90, 11.90, 297.50),
    ('canela-en-polvo', '509160', 'CANELA EN POLVO  BADIA  454 GRAMOS', '454 GR', 259.90, 259.90, 572.47),
    ('pimienta-negra-molida', '365814', 'Pimienta Negra Molida Mccormick 64 g', '64 GR', 67.90, 77.90, 1060.94),
    ('pasas', '362888', 'Uva Pasa Mimarca 250 Gr', '250 GR', 38.90, 38.90, 155.60),
    ('almendras-500g', '504236', 'ALMENDRA ENTERA  800 GRAMOS', '800 GR', 319.90, 319.90, 399.87),
    ('nuez-de-castilla', '437439', 'Nuez En Mitades Promanuez 200 Gr', '200 GR', 89.90, 89.90, 449.50),
    ('achiote', '7810114', 'Achiote  La Anita 110 g', '110 GR', 13.90, 15.90, 126.36),
    ('apio', '67', 'Apio  Kg', '1 KG', 24.90, 39.90, 24.90),
    ('brocoli', '71', 'Brócoli  Kg', 'KG', 59.90, 71.90, 59.90),
    ('chayote', '79', 'Chayote  Kg', 'KG', 29.90, 59.90, 29.90),
    ('col-blanca', '61', 'Repollo  Kg', '1 KG', 23.90, 34.90, 23.90),
    ('melon-chino', '20', 'Melón Chino  Kg', 'KG', 29.90, 39.90, 29.90),
    ('papaya-maradol', '444', 'Papaya maradol  Kg', 'KG', 39.90, 69.90, 39.90),
    ('pina-miel', '881', 'Piña miel  Kg', 'KG', 29.90, 59.90, 29.90),
    ('germinado-de-soya', '77', 'Germinado Soya  Kg', '1 KG', 49.90, 49.90, 49.90),
    ('camote-amarillo', '120', 'Camote  Kg', 'KG', 49.90, 79.90, 49.90),
    ('calabaza', '417865', 'Calabaza Butternut  por kg', 'KG', 79.90, 79.90, 79.90),
    ('chile-chilaca', '25', 'Chile Chilaca  Kg', 'KG', 64.90, 99.90, 64.90),
    ('durazno', '38', 'Durazno  Kg', '1 KG', 99.90, 169.90, 99.90),
    ('kiwi', '130', 'Kiwi  Kg', '1 KG', 129.90, 179.90, 129.90),
    ('manzana-golden', '15', 'Manzana Golden  Kg', '1 KG', 49.90, 79.90, 49.90),
    ('ciruelo-rojo', '14', 'Ciruela de temporada  Kg', '1 KG', 39.90, 69.90, 39.90),
    ('ciruelo-negro', '14', 'Ciruela de temporada  Kg', '1 KG', 39.90, 69.90, 39.90),
    ('ejote', '5130495', 'Ejote Cortado  La Huerta 500 g', '500 GR', 54.90, 54.90, 109.80),
    ('arandano-fresco', '741', 'Arandano Alsuper 170 Gr', '170 GR', 49.90, 89.90, 293.53),
    ('blue-berry', '741', 'Arandano Alsuper 170 Gr', '170 GR', 49.90, 89.90, 293.53),
    ('ajonjoli', '313713', 'Ajonjoli Mimarca 90 Gr', '90 GR', 15.90, 15.90, 176.67),
    ('albahaca', '468590', 'Albahaca Deshidratada  Campo Vivo  20 g', '20 GR', 35.90, 39.90, 1795.00),
    ('amaranto', '401888', 'Amaranto Natural Semilla Dul-Cerel 250 Gr', '250 GR', 34.90, 34.90, 139.60),
    ('cacahuate-japones', '510890', 'CACAHUATES JAPONESES KARATE 180 GRAMOS', '180 GR', 25.90, 27.90, 143.89),
    ('clavo', '313717', 'Clavo Entero Mimarca 40 Gr', '40 GR', 27.90, 27.90, 697.50),
    ('coco-rayado', '436437', 'Coco Rayado  Verde Valle  75 g', '75 GR', 19.90, 23.90, 265.33),
    ('granola', '5133288', 'Granola   La Fuente 500 g', '500 GR', 46.90, 46.90, 93.80),
    ('haba', '7130000', 'Haba  Verde Valle 500 g', '500 GR', 69.90, 79.90, 139.80),
    ('jamaica', '375431', 'Jamaica Verde Valle 200 Gr', '200 GR', 72.90, 72.90, 364.50),
    ('chile-chiltepin', '502117', 'CHILE CHILTEPIN MIMARCA  25 GRAMOS', '25 GR', 47.90, 47.90, 1916.00),
    ('chile-mirasol', '341530', 'Chile Seco Mirasol Secos Chih. 100 Gr', '100 GR', 36.90, 36.90, 369.00),
    ('chile-pasado', '844', 'Chile Seco Pasado Alsuper 300 g', '300 GR', 99.90, 129.90, 333.00),
    ('chile-cascabel', '512270', 'CHILE SECO CASCABEL MOBEE 100 GRAMOS', '100 GR', 43.90, 43.90, 439.00),
    ('chile-colorin', '341529', 'Chile Seco Colorin/Cascabel Secos Chih. 100 Gr', '100 GR', 26.90, 26.90, 269.00),
    ('chile-morita', '400544', 'Chile Seco Morita  Secos Chih. 100 Gr', '100 GR', 24.90, 24.90, 249.00),
    ('pepita-de-girasol', '502825', 'PEPITA DE GIRASOL DOMO   250 GRAMOS', '250 GR', 46.90, 46.90, 187.60),
    ('pepita-de-calabaza', '502824', 'PEPITA DE CALABAZA DOMO  250 GRAMOS', '250 GR', 92.90, 92.90, 371.60),
    ('piloncillo', '426695', 'Piloncillo Genuino Granulado Metco 500 Gr', '500 GR', 55.90, 55.90, 111.80),
    ('tamarindo', '501425', 'TAMARINDO MA CRUZITA 400 GRAMOS', '400 GR', 49.90, 52.90, 124.75),
    ('ciruela-pasa', '512879', 'CIRUELA PASA SIN HUESO DOMO  350 GRAMOS', '350 GR', 109.90, 109.90, 314.00),
    ('avena', '439301', 'Avena  No. 1 1 Kg', '1 KG', 35.90, 35.90, 35.90),
    ('curcuma', '452484', 'Curcuma  Okko 200 g', '200 GR', 53.90, 58.90, 269.50),
    ('linaza', '409348', 'Linaza Entera Semillas Okko 300 g', '300 GR', 33.90, 37.90, 113.00),
    ('tapioca', '508411', 'TAPIOCA GOURMETTY 255 GRAMOS', '255 GR', 39.90, 42.90, 156.47),
    ('anis', '445676', 'Anis Estrella Frasco Terana 28 Gr', '28 GR', 54.90, 54.90, 1960.71),
    ('dedos-queso-bolsa-181kg', '508365', 'DEDOS DE QUESO TASTIEZ 311 GRAMOS', '311 GR', 124.90, 124.90, 401.61),
    ('aros-cebolla-bolsa-907g', '508344', 'AROS DE CEBOLLA EMPANIZADOS  TASTIEZ 396 GRAMOS', '396 GR', 129.90, 129.90, 328.03),
    ('ala-iqf-pilgrims-caja-12kg', '458060', 'Alitas Buffalo  Pilgrims 600 g', '600 GR', 188.90, 209.90, 314.83),
    ('ala-adobada-bolsa-5kg', '458060', 'Alitas Buffalo  Pilgrims 600 g', '600 GR', 188.90, 209.90, 314.83),
    ('ala-habanero-bolsa-5kg', '458060', 'Alitas Buffalo  Pilgrims 600 g', '600 GR', 188.90, 209.90, 314.83),
    ('ala-botanera-bolsa-5kg', '458060', 'Alitas Buffalo  Pilgrims 600 g', '600 GR', 188.90, 209.90, 314.83),
    ('hamburguesa-bm-arrachera-caja-30pzs', '452552', 'Hamburguesa De Res Arrachera  Northstar Beef 1.2 Kg', '1.2 KG', 164.90, 199.90, 137.42),
    ('hamburguesa-bm-sirloin-caja-30pzs', '452551', 'Hamburguesa De Res Sirloin   Northstar Beef 1.2 Kg', '1.2 KG', 164.90, 199.90, 137.42),
    ('hamburguesa-bm-mezquite-caja-30pzs', '452551', 'Hamburguesa De Res Sirloin   Northstar Beef 1.2 Kg', '1.2 KG', 164.90, 199.90, 137.42),
    ('papa-francesa-38-payette-caja-1361kg', '452701', 'Papas Congeladas Corte Recto  Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('papa-francesa-14-payette-caja-1224kg', '452701', 'Papas Congeladas Corte Recto  Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('papa-ondulada-38-payette-caja-1361kg', '452700', 'Papas Congeladas Corte Ondulado   Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('papa-select-516-sc-caja-1361kg', '452701', 'Papas Congeladas Corte Recto  Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('papa-select-38-sc-caja-1361kg', '452701', 'Papas Congeladas Corte Recto  Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('papa-dulce-recta-38-caja-680kg', '470188', 'Camotes Campiranas Horneables  Mccain 500 g', '500 GR', 79.90, 79.90, 159.80),
    ('papa-conquest-14-caja-1633kg', '452701', 'Papas Congeladas Corte Recto  Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('papa-conquest-delivery-38-sc-caja-1361kg', '452701', 'Papas Congeladas Corte Recto  Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('papa-select-38-cascara-caja-1361kg', '452701', 'Papas Congeladas Corte Recto  Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('papa-conquest-delivery-teja-65-caja-1361kg', '452700', 'Papas Congeladas Corte Ondulado   Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('papa-thunder-38-sc-caja-1361kg', '452701', 'Papas Congeladas Corte Recto  Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('papa-gajo-10-cut-65-caja-1361kg', '516264', 'PAPA CORTE GAJO SAZONADO   1 KILOGRAM', 'KG', 79.90, 94.90, 79.90),
    ('papa-curly-savory-caja-1361kg', '452701', 'Papas Congeladas Corte Recto  Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('papa-megacrunch-14-caja-1224kg', '452701', 'Papas Congeladas Corte Recto  Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('papa-rejilla-savory-caja-1224kg', '452700', 'Papas Congeladas Corte Ondulado   Mybrand 500 g', '500 GR', 42.90, 52.90, 85.80),
    ('pechuga-sin-hueso-br', '369833', 'Pechuga De Pollo Sin Hueso Premium   Kg', 'KG', 99.90, 119.90, 99.90),
    ('pechuga-sh-pilgrims-caja-12kg', '348005', 'Pechuga De Pollo Sin Hueso Pilgrims Kg', 'KG', 169.90, 199.90, 169.90),
    ('pechuga-sh-am-soles-caja-10kg', '369833', 'Pechuga De Pollo Sin Hueso Premium   Kg', 'KG', 99.90, 119.90, 99.90),
    ('pechuga-sh-br-soles-caja-10kg', '369833', 'Pechuga De Pollo Sin Hueso Premium   Kg', 'KG', 99.90, 119.90, 99.90),
    ('camaron-cocido-4150', '385621', 'Camaron Cocido Laguna   Kg', 'KG', 239.90, 239.90, 239.90),
    ('camaron-4150', '9167', 'Camarón Crudo Mediano   Por Kg', 'KG', 209.90, 259.90, 209.90),
    ('camaron-cocido-100200', '38862', 'Camarón Cocido Chico   Por Kg', 'KG', 339.90, 339.90, 339.90),
    ('filete-tilapia-35', '413123', 'Filete De Tilapia Fresco   Kg', 'KG', 269.90, 269.90, 269.90),
    ('boneless-buffalo-freskecito', '408859', 'Boneless De Pollo Bufalo   Kg', 'KG', 162.90, 175.90, 162.90),
    ('boneless-pechuga-pilgrims', '408858', 'Boneless De Pollo Naturales   Kg', 'KG', 162.90, 175.90, 162.90),
    ('boneless-natural-freskecito', '408858', 'Boneless De Pollo Naturales   Kg', 'KG', 162.90, 175.90, 162.90),
    ('nugget-pechuga-pilgrims', '441560', 'Nuggets De Pechuga De Pollo Bachoco Kg', 'KG', 119.90, 127.90, 119.90),
    ('pechuga-picante-emp-pilgrims', '500555', 'PECHUGA EMPANIZADA  PICANTE  1 KILOGRAM', 'KG', 182.90, 196.90, 182.90),
    ('hamburguesa-empanizada-pilgrims', '360170', 'Hamburguesa Empanizada  Del Dia 500 g', '500 GR', 59.90, 66.90, 119.80),
    ('tender-empanizado-pilgrims', '457729', 'Tender Empanizado  Bachoco 700 g', '700 GR', 189.90, 189.90, 271.29),
    ('cordon-bleu-mini', '413492', 'Pechuga Rellena Cordon Bleu  Pilgrims 700 g', '700 GR', 201.90, 224.90, 288.43),
    ('pechuga-grill-fc-pilgrims', '413491', 'Pechuga Grill  Pilgrims 700 g', '700 GR', 215.90, 239.90, 308.43),
    ('pollo-entero-congelado-pilgrims-caja-145kg', '138300', 'Pollo Entero Bachoco Kg', 'KG', 74.90, 74.90, 74.90),
    ('costilla-back-rib', '456134', 'Costilla Parrillera    Kg', 'KG', 149.90, 179.90, 149.90),
    ('carne-al-pastor-100', '495679', 'Cerdo Al Pastor Alsuper Kg', 'KG', 139.90, 159.90, 139.90),
    ('queso-crema-krol-barra-136kg', '403761', 'Queso Crema  Mybrand 190 g', '190 GR', 32.90, 32.90, 173.16),
    ('queso-crema-reny-picot-caja-8kg', '403761', 'Queso Crema  Mybrand 190 g', '190 GR', 32.90, 32.90, 173.16),
    ('queso-crema-reny-picot-136kg', '403761', 'Queso Crema  Mybrand 190 g', '190 GR', 32.90, 32.90, 173.16),
    ('arrachera-premium-sukarne', '355437', 'Arrachera Natural  Grill Choice Kg', 'KG', 439.90, 439.90, 439.90);

  INSERT INTO public.competitor_prices
    (product_id, supplier_slug, branch_id, external_id, external_name,
     format, price, regular_price, unit_price, captured_at)
  SELECT p.id, 'alsuper', 6, t.al_id, t.al_name, t.al_format,
         t.al_price, t.al_regular, t.cap_kg, TIMESTAMPTZ '2026-10-01'
  FROM _tope t
  JOIN public.products p ON p.slug = t.slug
  ON CONFLICT (product_id, supplier_slug, branch_id, external_id) DO UPDATE
    SET external_name = EXCLUDED.external_name,
        format = EXCLUDED.format,
        price = EXCLUDED.price,
        regular_price = EXCLUDED.regular_price,
        unit_price = EXCLUDED.unit_price,
        captured_at = EXCLUDED.captured_at;

  -- Costo por kilo, tope por kilo y factor, en una sola tabla para poder
  -- auditar las tres reglas sin repetir la aritmetica.
  CREATE TEMP TABLE _calc ON COMMIT DROP AS
  SELECT p.id,
         p.slug,
         s.slug AS proveedor,
         ps.cost AS costo_lista,
         COALESCE(u.kg, 1) AS kg,
         CASE WHEN s.slug = 'frugasa' THEN ps.cost          -- ya es por kilo
              ELSE ps.cost / COALESCE(u.kg, 1)              -- es por unidad
         END AS costo_kg,
         t.cap_kg
  FROM public.products p
  JOIN public.product_suppliers ps ON ps.product_id = p.id AND ps.cost IS NOT NULL
  JOIN public.suppliers s ON s.id = ps.supplier_id
  LEFT JOIN _unidad_kg u ON u.slug = p.slug
  LEFT JOIN _tope t ON t.slug = p.slug
  WHERE s.slug IN ('frugasa', 'ab-foods');

  -- REGLA A vs B: el rival lo vende mas barato de lo que nos cuesta.
  UPDATE public.products p
  SET is_visible = false,
      updated_at = now()
  FROM _calc c
  WHERE p.id = c.id
    AND c.cap_kg IS NOT NULL
    AND c.cap_kg < c.costo_kg
    AND p.is_visible = true;
  GET DIAGNOSTICS v_ocultos = ROW_COUNT;

  -- Precio: margen sobre costo, topado por la competencia. El `COALESCE` en
  -- el tope es porque `LEAST(x, NULL)` es NULL en Postgres.
  UPDATE public.products p
  SET price = LEAST(
        CEIL(c.costo_kg * c.kg * CASE WHEN c.proveedor = 'ab-foods' THEN 1.18 ELSE 1.20 END),
        COALESCE(c.cap_kg * c.kg,
                 CEIL(c.costo_kg * c.kg * CASE WHEN c.proveedor = 'ab-foods' THEN 1.18 ELSE 1.20 END))
      ),
      sale_price = NULL,
      updated_at = now()
  FROM _calc c
  WHERE p.id = c.id
    AND NOT (c.cap_kg IS NOT NULL AND c.cap_kg < c.costo_kg);
  GET DIAGNOSTICS v_precio = ROW_COUNT;

  -- Guardas en positivo: las dos reglas se comprueban, no se suponen.
  --
  -- Las dos miran solo lo VISIBLE, que es lo que el cliente puede comprar.
  -- Ocultar no reescribe el precio (no hace falta: el producto no se vende),
  -- asi que los ocultos conservan el precio viejo y contarlos seria medir un
  -- invariante que no aplica — el fallo que hizo saltar la primera version.
  SELECT count(*) INTO v_bajo_costo
  FROM public.products p
  JOIN _calc c ON c.id = p.id
  WHERE p.is_visible
    AND p.price < c.costo_kg * c.kg;

  SELECT count(*) INTO v_mas_caros
  FROM public.products p
  JOIN _calc c ON c.id = p.id
  WHERE p.is_visible
    AND c.cap_kg IS NOT NULL
    AND p.price > c.cap_kg * c.kg + 0.01;

  IF v_bajo_costo > 0 THEN
    RAISE EXCEPTION '00202: % productos VISIBLES quedaron por debajo del costo', v_bajo_costo;
  END IF;
  IF v_mas_caros > 0 THEN
    RAISE EXCEPTION '00202: % productos VISIBLES quedaron mas caros que la competencia', v_mas_caros;
  END IF;

  RAISE NOTICE '00202: % precios recalculados, % productos ocultos (no hay precio sin perdida).',
    v_precio, v_ocultos;
END $$;
