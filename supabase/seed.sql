-- Seed: 20 ciudades de México
INSERT INTO cities (name, slug, state, lat, lng) VALUES
  ('Ciudad de México', 'cdmx', 'CDMX', 19.4326, -99.1332),
  ('Guadalajara', 'guadalajara', 'Jalisco', 20.6597, -103.3496),
  ('Monterrey', 'monterrey', 'Nuevo León', 25.6866, -100.3161),
  ('Puebla', 'puebla', 'Puebla', 19.0414, -98.2063),
  ('Toluca', 'toluca', 'Estado de México', 19.2826, -99.6557),
  ('Querétaro', 'queretaro', 'Querétaro', 20.5888, -100.3899),
  ('León', 'leon', 'Guanajuato', 21.1219, -101.6833),
  ('Tijuana', 'tijuana', 'Baja California', 32.5149, -117.0382),
  ('Mérida', 'merida', 'Yucatán', 20.9674, -89.6238),
  ('San Luis Potosí', 'san-luis-potosi', 'San Luis Potosí', 22.1485, -100.9802),
  ('Aguascalientes', 'aguascalientes', 'Aguascalientes', 21.8853, -102.2916),
  ('Hermosillo', 'hermosillo', 'Sonora', 29.0729, -110.9559),
  ('Saltillo', 'saltillo', 'Coahuila', 25.4253, -101.0014),
  ('Culiacán', 'culiacan', 'Sinaloa', 24.8086, -107.3940),
  ('Morelia', 'morelia', 'Michoacán', 19.7069, -101.1950),
  ('Chihuahua', 'chihuahua', 'Chihuahua', 28.6329, -106.0691),
  ('Veracruz', 'veracruz', 'Veracruz', 19.1903, -96.1534),
  ('Villahermosa', 'villahermosa', 'Tabasco', 17.9892, -92.9281),
  ('Cancún', 'cancun', 'Quintana Roo', 21.1619, -86.8515),
  ('Torreón', 'torreon', 'Coahuila', 25.5428, -103.4064);

-- Seed: Categorías de insumos para restaurante
INSERT INTO categories (name, slug, icon) VALUES
  ('Frutas y Verduras', 'frutas-verduras', '🥬'),
  ('Abarrotes', 'abarrotes', '📦'),
  ('Lácteos y Huevos', 'lacteos-huevos', '🧀'),
  ('Carnes, Aves y Pescados', 'carnes-aves-pescados', '🥩'),
  ('Panadería y Tortillería', 'panaderia-tortilleria', '🍞'),
  ('Bebidas', 'bebidas', '🥤'),
  ('Botanas y Dulces', 'botanas-dulces', '🍪'),
  ('Limpieza para Cocina', 'limpieza-cocina', '🧹'),
  ('Congelados', 'congelados', '❄️');

-- ============================================================
-- TIENDAS
-- ============================================================
INSERT INTO stores (name, slug, description, logo_url, banner_url, min_order, delivery_fee, avg_delivery_time, whatsapp_number, is_active) VALUES
  ('Resurte.me', 'resurte-me',
   'Central de Abastos Digital para restaurantes. Productos frescos al mejor precio de mayoreo. Seleccionados cada madrugada en la Central, directo a tu cocina.',
   '/images/store/logo.webp',
   '/images/store/banner.webp',
   200.00, 29.00, '30-45 min', '+525512345678', true);

-- Asociar tiendas con las 20 ciudades
DO $$
DECLARE
  city_id_var BIGINT;
  store_id_var BIGINT;
BEGIN
  FOR city_id_var IN SELECT id FROM cities LOOP
    FOR store_id_var IN SELECT id FROM stores LOOP
      INSERT INTO store_cities (store_id, city_id, is_available) VALUES (store_id_var, city_id_var, true);
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- PRODUCTOS — Central de Abastos Digital · Enfoque Restaurantero
-- ============================================================

-- ============================================================
-- 1. FRUTAS Y VERDURAS (cat_id 1) — 35 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, images, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Manzana Roja', 'manzana-roja', 'Manzana roja de huerto local, pulpa firme y jugosa. Para repostería, ensaladas y cocina.', 'https://storage.googleapis.com/takeapp/media/cmihp02pp000604l43fzq2ed7.png', '["https://storage.googleapis.com/takeapp/media/cmihp1d5p000904l4ap1f6tf8.png", "https://storage.googleapis.com/takeapp/media/cmihojint000k04if2qg48em7.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Manzana Verde', 'manzana-verde', 'Manzana verde Granny Smith. Ácida y crocante, ideal para pays, ensaladas y guarniciones.', 'https://storage.googleapis.com/takeapp/media/cmihov9fh001304ju8yfi21dq.png', NULL, 'Importado', 1, true, 'por kilo'),
  ('Aguacate Hass', 'aguacate-hass', 'Aguacate Hass de Michoacán, madurez perfecta. Pulpa cremosa para guacamole de servicio.', 'https://storage.googleapis.com/takeapp/media/cmihon5gm000f04jo8q5f7jdf.png', NULL, 'Michoacán', 1, true, 'por kilo'),
  ('Naranja Valencia', 'naranja-valencia', 'Naranja Valencia de Veracruz. Jugosa, dulzor y acidez balanceados. Para jugo de servicio.', 'https://storage.googleapis.com/takeapp/media/cmijnpm2z000904lbg1e59xve.png', '["https://storage.googleapis.com/takeapp/media/cmijnsv7u000704jmaljs2dkr.png"]'::jsonb, 'Veracruz', 1, true, 'por kilo'),
  ('Limón Agrio', 'limon-agrio', 'Limón agrio de Colima con abundante jugo. Imprescindible en toda cocina mexicana.', 'https://storage.googleapis.com/takeapp/media/cmijp7zpj000404l40mtkbyuh.png', '["https://storage.googleapis.com/takeapp/media/cmijp8ofj000j04l7g0sdfvh5.png"]'::jsonb, 'Colima', 1, true, 'por kilo'),
  ('Plátano Tabasco', 'platano-tabasco', 'Plátano Tabasco maduro, dulzor natural y textura cremosa. Para postres y licuados.', 'https://storage.googleapis.com/takeapp/media/cmijo779j000204jz2yrwe753.png', '["https://storage.googleapis.com/takeapp/media/cmijokk4v000f04lb7fan17lv.png"]'::jsonb, 'Tabasco', 1, true, 'por kilo'),
  ('Plátano Macho', 'platano-macho', 'Plátano macho grande, para freír, hornear o cocer. Base de guarniciones calientes.', '/images/products/7.webp', NULL, 'Tabasco', 1, true, 'por kilo'),
  ('Fresa', 'fresa', 'Fresa de Irapuato, rojo intenso y perfume floral. Para repostería, salsas y decoración.', '/images/products/8.webp', NULL, 'Irapuato', 1, true, 'charola 500 g'),
  ('Papaya Maradol', 'papaya-maradol', 'Papaya Maradol, pulpa naranja y dulzor tropical. Para barra de frutas y postres.', 'https://storage.googleapis.com/takeapp/media/cmijostxx001o04jv3tl8b2v9.png', '["https://storage.googleapis.com/takeapp/media/cmijot3y8001q04jv1fag364h.png"]'::jsonb, 'Local', 1, true, 'por pieza'),
  ('Mango Ataúlfo', 'mango-ataulfo', 'Mango Ataúlfo de Chiapas, carne sin fibra y dulzor de miel. Para salsas, postres y barra.', '/images/products/10.webp', NULL, 'Chiapas', 1, true, 'por pieza'),
  ('Mango Manila', 'mango-manila', 'Mango Manila pequeño, intenso aroma y sabor. Perfecto para salsas mango-habanero.', 'https://storage.googleapis.com/takeapp/media/cmijwgf7r000904l738kc1xwb.png', NULL, 'Local', 1, false, 'por kilo'),
  ('Sandía', 'sandia', 'Sandía de temporal, pulpa roja crujiente. Para barra de aguas frescas y postres fríos.', 'https://storage.googleapis.com/takeapp/media/cmijq38em001604l7hja83595.png', '["https://storage.googleapis.com/takeapp/media/cmijq0j2z002l04jvhi994uoc.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Melón Chino', 'melon-chino', 'Melón chino de pulpa naranja y aroma dulce. Para desayunos, barra de frutas y aguas.', 'https://storage.googleapis.com/takeapp/media/cmijy9mol000104jr05q555i9.png', '["https://storage.googleapis.com/takeapp/media/cmijy9tsg000604kz80fy3y6o.png"]'::jsonb, 'Local', 1, true, 'por pieza'),
  ('Piña Miel', 'pina-miel', 'Piña miel madura, dulzor concentrado. Para aguas, postres, salsas agridulces y parrilla.', 'https://storage.googleapis.com/takeapp/media/cmijt78vd000304l7gky09s9z.png', '["https://storage.googleapis.com/takeapp/media/cmijt68p6000104l7baf861ig.png"]'::jsonb, 'Local', 1, true, 'por pieza'),
  ('Toronja', 'toronja', 'Toronja rosada, jugosa y refrescante. Para jugos de servicio, coctelería y ensaladas.', 'https://storage.googleapis.com/takeapp/media/cmil8aa8y001b04jodgx5fcbu.png', '["https://storage.googleapis.com/takeapp/media/cmil88rbk000d04jsfc4pdytu.png"]'::jsonb, 'Local', 1, false, 'por kilo'),
  ('Uvas Verdes', 'uvas-verdes', 'Uvas verdes sin semilla, crujientes. Para tablas de quesos, ensaladas y decoración.', 'https://storage.googleapis.com/takeapp/media/cmikmo2xq000304l8d0pmawqd.png', '["https://storage.googleapis.com/takeapp/media/cmikmod24001204ik6o9683zm.png"]'::jsonb, 'California', 1, true, 'por kilo'),
  ('Uvas Rojas', 'uvas-rojas', 'Uvas rojas sin semilla, dulzor intenso. Para mesas de postres y servicio.', 'https://storage.googleapis.com/takeapp/media/cmikmw51n000304jz0r6shapj.png', '["https://storage.googleapis.com/takeapp/media/cmikq3wzl000704jp5z2r5v6u.png"]'::jsonb, 'California', 1, false, 'por kilo'),
  ('Guayaba', 'guayaba', 'Guayaba fresca de huerto, aroma intenso. Para aguas frescas, ates y postres.', 'https://storage.googleapis.com/takeapp/media/cmijqtay4000604js048vejxu.png', '["https://storage.googleapis.com/takeapp/media/cmijrhvlp000x04l5cqsg2jp0.png"]'::jsonb, 'Local', 1, false, 'por kilo'),
  ('Mandarina', 'mandarina', 'Mandarina dulce, fácil de pelar. Para mesas de fruta, postres y jugos.', 'https://storage.googleapis.com/takeapp/media/cmijtu4fq000204jy1h4p53xa.png', '["https://storage.googleapis.com/takeapp/media/cmijtulh8000b04ibguqtdro5.png"]'::jsonb, 'Local', 1, false, 'por kilo'),
  ('Jitomate Saladet', 'jitomate-saladet', 'Jitomate saladet de campo, pulpa carnosa. Para salsas madre, guisos y pico de gallo.', 'https://storage.googleapis.com/takeapp/media/cmihqyxja000b04l5h1s4euob.png', '["https://storage.googleapis.com/takeapp/media/cmihr1l5v000l04ldh1155mhg.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Jitomate Bola', 'jitomate-bola', 'Jitomate bola grande y firme. Para rebanar en hamburguesas, tortas y ensaladas.', 'https://storage.googleapis.com/takeapp/media/cmijjlfbn000504ie32jadi6o.png', '["https://storage.googleapis.com/takeapp/media/cmijjls4z000104l179m85trp.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Tomate Verde', 'tomate-verde', 'Tomate verde / tomatillo fresco. Base de salsa verde mexicana, hervido o asado.', 'https://storage.googleapis.com/takeapp/media/cmigud8dq000n04jp1kc96rqk.png', '["https://storage.googleapis.com/takeapp/media/cmii7upcy000304l74le012xa.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Cebolla Blanca', 'cebolla-blanca', 'Cebolla blanca de bulbo firme. Base aromática de todo sofrito y guiso mexicano.', 'https://storage.googleapis.com/takeapp/media/cmihm7h13000104jsc7rz709l.png', '["https://storage.googleapis.com/takeapp/media/cmihty1nd000b04l2ekyf71td.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Cebolla Morada', 'cebolla-morada', 'Cebolla morada de sabor más suave. Para escabeches, ensaladas y guarnición.', 'https://storage.googleapis.com/takeapp/media/cmihm9eva000804kwbbsuf58x.png', '["https://storage.googleapis.com/takeapp/media/cmii8b5vr000i04js2ijx0ea0.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Papa Blanca', 'papa-blanca', 'Papa blanca de tierra suelta, pulpa versátil. Para puré, fritura, guisos y sopas.', 'https://storage.googleapis.com/takeapp/media/cmifgtjlp000b04l5a5r89mmc.jpg', '["https://storage.googleapis.com/takeapp/media/cmii3dles000004k1aui1511a.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Papa Cambray', 'papa-cambray', 'Papa cambray pequeña, piel fina. Para asar enteras, guarnición gourmet.', 'https://storage.googleapis.com/takeapp/media/cmil9723z002s04jobceb395t.png', '["https://storage.googleapis.com/takeapp/media/cmil97pvh000004jvba1o09ez.png"]'::jsonb, 'Local', 1, false, 'por kilo'),
  ('Zanahoria', 'zanahoria', 'Zanahoria fresca de tierra negra, dulzor natural. Para fondos, ensaladas y guarniciones.', 'https://storage.googleapis.com/takeapp/media/cmigh1lun000104lfbmdi5wgm.jpg', '["https://storage.googleapis.com/takeapp/media/cmii40uzp000004ju29ie3076.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Brócoli', 'brocoli', 'Brócoli de floretes compactos y tallo firme. Al vapor, salteado o gratinado.', 'https://storage.googleapis.com/takeapp/media/cmihn1bq8000604l53jdqdh3t.png', '["https://storage.googleapis.com/takeapp/media/cmij8buwh000004kz19b6bl9c.png"]'::jsonb, 'Local', 1, true, 'por pieza'),
  ('Coliflor', 'coliflor', 'Coliflor blanca, cabeza compacta. Para capear, gratinar o como arroz bajo en carbohidratos.', 'https://storage.googleapis.com/takeapp/media/cmihlx4ko000004jp6pn34jcc.png', '["https://storage.googleapis.com/takeapp/media/cmii65ymt000804jya1ip6wb0.png"]'::jsonb, 'Local', 1, true, 'por pieza'),
  ('Lechuga Romana', 'lechuga-romana', 'Lechuga romana de hoja crujiente. Base clásica para ensalada César de servicio.', 'https://storage.googleapis.com/takeapp/media/cmiguf9xj000c04ih2kpi7szc.png', '["https://storage.googleapis.com/takeapp/media/cmii79ibj000204iefpn1b30h.png"]'::jsonb, 'Local', 1, true, 'por pieza'),
  ('Espinaca', 'espinaca', 'Espinaca fresca de hoja verde oscura. Para cremas, ensaladas, salteados y smoothies.', 'https://storage.googleapis.com/takeapp/media/cmihgsazp000204ib1z4gae1g.png', '["https://storage.googleapis.com/takeapp/media/cmij814xl000104l5f7wla7o7.png"]'::jsonb, 'Local', 1, true, 'por manojo'),
  ('Cilantro', 'cilantro', 'Cilantro fresco de rama, aroma cítrico intenso. Toque final para salsas, tacos y guisos.', 'https://storage.googleapis.com/takeapp/media/cmilwesph000704ikfang4orw.png', '["https://storage.googleapis.com/takeapp/media/cmilwz28h000204jxcqcle5br.png"]'::jsonb, 'Local', 1, true, 'por manojo'),
  ('Perejil', 'perejil', 'Perejil fresco de hoja plana. Para salsas verdes, aderezos, chimichurri y decoración.', 'https://storage.googleapis.com/takeapp/media/cmilw6t51000104jq0du3blee.png', '["https://storage.googleapis.com/takeapp/media/cmilw6kb5000204l8hoc09tg9.png"]'::jsonb, 'Local', 1, false, 'por manojo'),
  ('Epazote', 'epazote', 'Epazote fresco, hierba mexicana esencial. Para frijoles, quesadillas y caldos tradicionales.', '/images/products/34.webp', NULL, 'Local', 1, true, 'por manojo'),
  ('Chile Serrano', 'chile-serrano', 'Chile serrano fresco, picor medio-alto. Para salsas crudas, guisos y escabeches.', 'https://storage.googleapis.com/takeapp/media/cmikw8rii000104l7e1vfbfw3.png', '["https://storage.googleapis.com/takeapp/media/cmikwa1t1000204ju50lo2jfa.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Chile Jalapeño', 'chile-jalapeno', 'Chile jalapeño fresco, picor medio. Para rajas, rellenos, salsas y asado.', 'https://storage.googleapis.com/takeapp/media/cmijm5teg000704lbgiuf2ua2.png', '["https://storage.googleapis.com/takeapp/media/cmijm5x27000004jf5lpwd5pa.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Chile Poblano', 'chile-poblano', 'Chile poblano grande y carnoso, picor bajo. Para chiles rellenos, rajas con crema.', 'https://storage.googleapis.com/takeapp/media/cmikz37kb000004l5d2653hrg.png', '["https://storage.googleapis.com/takeapp/media/cmikz3i8e000204l8er5g0od3.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Ajo', 'ajo', 'Ajo fresco, cabeza firme y dientes gordos. Base aromática de todo sofrito profesional.', 'https://storage.googleapis.com/takeapp/media/cmihqf2pi000704la16zb486c.png', '["https://storage.googleapis.com/takeapp/media/cmij8l7y3000404l6c4ue7mq7.png"]'::jsonb, 'Local', 1, true, 'por cabeza'),
  ('Pepino', 'pepino', 'Pepino fresco, piel verde oscura y crujiente. Para ensaladas, aguas y guarniciones.', 'https://storage.googleapis.com/takeapp/media/cmij91iox000804l6hp3j6ul8.png', '["https://storage.googleapis.com/takeapp/media/cmij91zpq000404l1116o64gr.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Calabacita', 'calabacita', 'Calabacita italiana tierna. Para salteados, sopas, rellenos y guarnición al vapor.', 'https://storage.googleapis.com/takeapp/media/cmijj1878000004k0bji0clqu.png', '["https://storage.googleapis.com/takeapp/media/cmijj21nf000004jp5kas41rw.png"]'::jsonb, 'Local', 1, false, 'por kilo'),
  ('Chayote', 'chayote', 'Chayote verde de piel lisa y pulpa suave. Para sopas, guisos y guarniciones.', 'https://storage.googleapis.com/takeapp/media/cmijn2j9r000304js6krldwj1.png', '["https://storage.googleapis.com/takeapp/media/cmijn2rwj000004l5bhobhsto.png"]'::jsonb, 'Local', 1, false, 'por pieza'),
  ('Elote', 'elote', 'Elote blanco tierno de temporada. Para esquites, asado, cremas y guarniciones.', 'https://storage.googleapis.com/takeapp/media/cmihhifyb000004jv1j7x5wbp.png', '["https://storage.googleapis.com/takeapp/media/cmij82p4h000004l15jud2208.png"]'::jsonb, 'Local', 1, true, 'por pieza'),
  ('Nopal', 'nopal', 'Nopal tierno sin espinas, limpio. Para ensaladas, asado, guisos y jugos verdes.', 'https://storage.googleapis.com/takeapp/media/cmigufsl3000604l59l4of2yy.png', '["https://storage.googleapis.com/takeapp/media/cmij7zl6c000004l70hq20gu0.png"]'::jsonb, 'Local', 1, true, 'por kilo'),
  ('Apio', 'apio', 'Apio fresco de tallo crujiente. Para fondos, jugos, ensaladas y botanas con dip.', 'https://storage.googleapis.com/takeapp/media/cmijmdkue000004l5cl6t57qd.png', '["https://storage.googleapis.com/takeapp/media/cmijmdpgt000004l87ghf24bp.png"]'::jsonb, 'Local', 1, false, 'por pieza'),
  ('Betabel', 'betabel', 'Betabel fresco de raíz firme. Para jugos, ensaladas, sopas y guarniciones asadas.', 'https://storage.googleapis.com/takeapp/media/cmikm2eyl000g04l9h841dwam.png', '["https://storage.googleapis.com/takeapp/media/cmikm3r6o000f04l4bz3ecr1u.png"]'::jsonb, 'Local', 1, false, 'por kilo'),
  ('Col Blanca', 'col-blanca', 'Col blanca de cabeza compacta. Para ensalada de col, tacos, sopas y fermentos.', 'https://storage.googleapis.com/takeapp/media/cmihhsrrr000004jfc58l4cxz.png', '["https://storage.googleapis.com/takeapp/media/cmij84wwi000704l7aryp299s.png"]'::jsonb, 'Local', 1, false, 'por pieza'),
  ('Chile Habanero', 'chile-habanero', 'Chile habanero de Yucatán, picor extremo y sabor afrutado. Para salsas explosivas.', 'https://storage.googleapis.com/takeapp/media/cmigr3lni000004l281j40gvp.jpg', '["https://storage.googleapis.com/takeapp/media/cmigr3r7s000304l22p3r4fx5.jpg", "https://storage.googleapis.com/takeapp/media/cmigujm9f000204lk0jfhc8ha.png"]'::jsonb, 'Yucatán', 1, false, 'por 100 g'),
  ('Rábano', 'rabano', 'Rábano rojo fresco, picante y crujiente. Para pozole, tacos y ensaladas.', 'https://storage.googleapis.com/takeapp/media/cmifh7a6k000004jpa7or85li.jpg', NULL, 'Local', 1, false, 'por manojo'),
  ('Hongo Portobello', 'hongo-portobello', 'Hongo Portobello grande y carnoso. Para asar, rellenar o como sustituto de carne.', '/images/products/49.webp', NULL, 'Local', 1, false, 'por kilo'),
  ('Champiñón', 'champinon', 'Champiñón blanco fresco, firme. Para salteados, cremas, salsas y guarniciones.', '/images/products/50.webp', NULL, 'Local', 1, true, 'por kilo');

-- ============================================================
-- 2. ABARROTES (cat_id 2) — 35 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, images, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Arroz Blanco 1kg', 'arroz-blanco-1kg', 'Arroz blanco de grano largo, cocción pareja. Rendimiento alto para cocina de volumen.', '/images/products/51.webp', NULL, 'Verde Valle', 2, false, '1 kg'),
  ('Arroz Blanco 5kg', 'arroz-blanco-5kg', 'Arroz blanco costal de 5 kg. Ideal para cocinas de alto volumen y fondas.', '/images/products/52.webp', NULL, 'Verde Valle', 2, true, '5 kg'),
  ('Frijol Negro 1kg', 'frijol-negro-1kg', 'Frijol negro de parcela, grano parejo y cocción uniforme. Sabor terroso para frijoles de olla.', '/images/products/53.webp', NULL, 'Verde Valle', 2, true, '1 kg'),
  ('Frijol Negro 5kg', 'frijol-negro-5kg', 'Costal de frijol negro 5 kg. Para cocinas que sirven frijoles diario.', '/images/products/54.webp', NULL, 'Verde Valle', 2, true, '5 kg'),
  ('Frijol Bayo 1kg', 'frijol-bayo-1kg', 'Frijol bayo de grano suave. Cremoso al cocerse, para frijoles refritos de carta.', '/images/products/55.webp', NULL, 'La Costeña', 2, false, '1 kg'),
  ('Frijol Peruano 1kg', 'frijol-peruano-1kg', 'Frijol peruano amarillo claro, textura mantecosa. Favorito en cocina del norte.', '/images/products/56.webp', NULL, 'La Costeña', 2, false, '1 kg'),
  ('Lenteja 1kg', 'lenteja-1kg', 'Lenteja de grano mediano, cocción rápida. Para sopas y guarniciones de alto rendimiento.', '/images/products/57.webp', NULL, 'Verde Valle', 2, false, '1 kg'),
  ('Garbanzo 1kg', 'garbanzo-1kg', 'Garbanzo grande de buena cocción. Para caldos, potajes y hummus.', '/images/products/generic/garbanzo-1kg.webp', jsonb_build_array('/images/products/generic/garbanzo-1kg.webp'), 'Verde Valle', 2, false, '1 kg'),
  ('Aceite de Canola 1L', 'aceite-canola-1l', 'Aceite vegetal de canola, punto de humo alto y sabor neutro. Para freidora y cocina diaria.', '/images/products/59.webp', NULL, 'Capullo', 2, true, '1 litro'),
  ('Aceite de Canola 5L', 'aceite-canola-5l', 'Garrafa 5 litros de aceite de canola. Máximo rendimiento para cocinas de volumen.', '/images/products/60.webp', NULL, 'Capullo', 2, true, '5 litros'),
  ('Aceite de Maíz 1L', 'aceite-de-maiz-1l', 'Aceite de maíz 100% puro, ideal para freír. Sabor ligero, no enmascara.', '/images/products/61.webp', NULL, 'Mazola', 2, false, '1 litro'),
  ('Aceite de Oliva 1L', 'aceite-de-oliva-1l', 'Aceite de oliva extra virgen. Para aderezos, pescados, pastas y servicio gourmet.', '/images/products/generic/aceite-de-oliva-1l.webp', jsonb_build_array('/images/products/generic/aceite-de-oliva-1l.webp'), 'Carbonell', 2, false, '1 litro'),
  ('Manteca Vegetal', 'manteca-vegetal', 'Manteca vegetal Inca para freír y repostería. Estable a altas temperaturas.', '/images/products/generic/manteca-vegetal.webp', jsonb_build_array('/images/products/generic/manteca-vegetal.webp'), 'Inca', 2, false, '1 kg'),
  ('Pasta Spaghetti 500g', 'pasta-spaghetti-500g', 'Pasta spaghetti de sémola, cuerpo firme al dente. No se sobrecocina.', '/images/products/64.webp', NULL, 'Barilla', 2, false, '500 g'),
  ('Pasta Codito 500g', 'pasta-codito-500g', 'Pasta codito / elbow. Para sopas aguadas y ensaladas frías de pasta.', '/images/products/generic/pasta-codito-500g.webp', jsonb_build_array('/images/products/generic/pasta-codito-500g.webp'), 'La Moderna', 2, false, '500 g'),
  ('Pasta Fideo 500g', 'pasta-fideo-500g', 'Fideo delgado para sopa aguada o seca. Base de la clásica sopa de fideo mexicana.', '/images/products/generic/pasta-fideo-500g.webp', jsonb_build_array('/images/products/generic/pasta-fideo-500g.webp'), 'La Moderna', 2, true, '500 g'),
  ('Harina de Maíz 1kg', 'harina-de-maiz-1kg', 'Harina de maíz nixtamalizado Maseca. Para tortillas, tamales, sopes y gorditas.', '/images/products/generic/harina-de-maiz-1kg.webp', jsonb_build_array('/images/products/generic/harina-de-maiz-1kg.webp'), 'Maseca', 2, true, '1 kg'),
  ('Harina de Trigo 1kg', 'harina-de-trigo-1kg', 'Harina de trigo todo uso. Para repostería, capeados, salsas madre y panadería.', '/images/products/68.webp', NULL, 'Selecta', 2, false, '1 kg'),
  ('Azúcar Estándar 1kg', 'azucar-estandar-1kg', 'Azúcar refinada estándar, disolución rápida. Para repostería, bebidas y salsas.', '/images/products/generic/azucar-estandar-1kg.webp', jsonb_build_array('/images/products/generic/azucar-estandar-1kg.webp'), 'Zulka', 2, false, '1 kg'),
  ('Azúcar Glass 500g', 'azucar-glass-500g', 'Azúcar glass impalpable para repostería fina, glaseados y decoración.', '/images/products/generic/azucar-glass-500g.webp', jsonb_build_array('/images/products/generic/azucar-glass-500g.webp'), 'Zulka', 2, false, '500 g'),
  ('Sal de Mar Fina 1kg', 'sal-de-mar-fina-1kg', 'Sal de mar refinada, grano fino. El sazón base de toda cocina.', '/images/products/71.webp', NULL, 'Sales del Golfo', 2, false, '1 kg'),
  ('Sal Gruesa 1kg', 'sal-gruesa-1kg', 'Sal de mar en grano grueso. Para carnes asadas, pescados a la sal y cocciones lentas.', '/images/products/72.webp', NULL, 'Sales del Golfo', 2, false, '1 kg'),
  ('Pimienta Negra Molida 100g', 'pimienta-negra-molida-100g', 'Pimienta negra molida fresca. Para sazonar carnes, sopas y salsas.', '/images/products/generic/pimienta-negra-molida-100g.webp', jsonb_build_array('/images/products/generic/pimienta-negra-molida-100g.webp'), 'McCormick', 2, false, '100 g'),
  ('Comino Molido 100g', 'comino-molido-100g', 'Comino molido puro, aroma intenso. Especia clave en cocina mexicana y tex-mex.', '/images/products/generic/comino-molido-100g.webp', jsonb_build_array('/images/products/generic/comino-molido-100g.webp'), 'McCormick', 2, false, '100 g'),
  ('Orégano Molido 100g', 'oregano-molido-100g', 'Orégano mexicano molido. Para pozole, birria, menudos y caldos tradicionales.', '/images/products/75.webp', NULL, 'McCormick', 2, false, '100 g'),
  ('Salsa Valentina 370ml', 'salsa-valentina-370ml', 'Salsa picante clásica mexicana. Para botanas, frutas, mariscos y micheladas.', '/images/products/generic/salsa-valentina-370ml.webp', jsonb_build_array('/images/products/generic/salsa-valentina-370ml.webp'), 'Valentina', 2, true, '370 ml'),
  ('Salsa Maggi 200ml', 'salsa-maggi-200ml', 'Salsa sazonadora líquida Maggi. Umami instantáneo para caldos, carnes y salsas.', '/images/products/77.webp', NULL, 'Maggi', 2, true, '200 ml'),
  ('Salsa de Soya 500ml', 'salsa-de-soya-500ml', 'Salsa de soya fermentada. Para marinados, salteados orientales y salsas fusión.', '/images/products/generic/salsa-de-soya-500ml.webp', jsonb_build_array('/images/products/generic/salsa-de-soya-500ml.webp'), 'Kikkoman', 2, false, '500 ml'),
  ('Salsa Inglesa 250ml', 'salsa-inglesa-250ml', 'Salsa inglesa / Worcestershire para micheladas, clamatos, carnes y salsas.', '/images/products/generic/salsa-inglesa-250ml.webp', jsonb_build_array('/images/products/generic/salsa-inglesa-250ml.webp'), 'Crosse & Blackwell', 2, false, '250 ml'),
  ('Catsup 1kg', 'catsup-1kg', 'Catsup de jitomate en sobre de 1 kg. Para hamburguesas, hot dogs y papas.', '/images/products/80.webp', NULL, 'Heinz', 2, false, '1 kg'),
  ('Mayonesa 1kg', 'mayonesa-1kg', 'Mayonesa con huevo en formato de 1 kg. Para salsas, aderezos y servicio.', '/images/products/81.webp', NULL, 'McCormick', 2, false, '1 kg'),
  ('Mostaza 400g', 'mostaza-400g', 'Mostaza amarilla clásica. Para hot dogs, sándwiches, aderezos y marinados.', '/images/products/generic/mostaza-400g.webp', jsonb_build_array('/images/products/generic/mostaza-400g.webp'), 'French', 2, false, '400 g'),
  ('Consomé de Pollo 1kg', 'consome-de-pollo-1kg', 'Consomé de pollo en polvo, bote 1 kg. Base rápida para caldos, arroces y sopas.', '/images/products/83.webp', NULL, 'Knorr', 2, true, '1 kg'),
  ('Consomé de Res 1kg', 'consome-de-res-1kg', 'Consomé de res en polvo, bote 1 kg. Para birria, caldos de res y guisados.', '/images/products/generic/consome-de-res-1kg.webp', jsonb_build_array('/images/products/generic/consome-de-res-1kg.webp'), 'Knorr', 2, false, '1 kg'),
  ('Vinagre Blanco 1L', 'vinagre-blanco-1l', 'Vinagre blanco destilado. Para escabeches, salsas, conservas y limpieza.', '/images/products/85.webp', NULL, 'Clemente Jacques', 2, false, '1 litro'),
  ('Vinagre de Manzana 1L', 'vinagre-de-manzana-1l', 'Vinagre de manzana orgánico. Para aderezos, marinados y vinagretas.', '/images/products/generic/vinagre-de-manzana-1l.webp', jsonb_build_array('/images/products/generic/vinagre-de-manzana-1l.webp'), 'Clemente Jacques', 2, false, '1 litro'),
  ('Mole Doña María 500g', 'mole-dona-maria-500g', 'Pasta de mole poblano lista para diluir. Base para mole de servicio en restaurante.', '/images/products/generic/mole-dona-maria-500g.webp', jsonb_build_array('/images/products/generic/mole-dona-maria-500g.webp'), 'Doña María', 2, true, '500 g'),
  ('Maicena 500g', 'maicena-500g', 'Fécula de maíz para espesar salsas, atoles y postres. Rendimiento profesional.', '/images/products/generic/maicena-500g.webp', jsonb_build_array('/images/products/generic/maicena-500g.webp'), 'Maizena', 2, false, '500 g');

-- ============================================================
-- 3. LÁCTEOS Y HUEVOS (cat_id 3) — 16 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, images, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Leche Entera Lala 1L', 'leche-entera-lala-1l', 'Leche entera pasteurizada. Para salsas bechamel, cremas, postres y servicio de mesa.', 'https://storage.googleapis.com/takeapp/media/cmidk5jyk00000icpgw3gh4pc.webp', NULL, 'Lala', 3, false, '1 litro'),
  ('Leche Descremada 1L', 'leche-descremada-1l', 'Leche semidescremada, menos grasa. Para smoothies, licuados y cocina ligera.', '/images/products/90.webp', NULL, 'Lala', 3, false, '1 litro'),
  ('Leche Evaporada 360ml', 'leche-evaporada-360ml', 'Leche evaporada Carnation. Para cremas, salsas y postres clásicos mexicanos.', '/images/products/91.webp', NULL, 'Carnation', 3, false, '360 ml'),
  ('Media Crema 240ml', 'media-crema-240ml', 'Media crema Nestlé. Para salsas cremosas, enchiladas y pastas.', '/images/products/92.webp', NULL, 'Nestlé', 3, false, '240 ml'),
  ('Leche Condensada 370ml', 'leche-condensada-370ml', 'Leche condensada azucarada La Lechera. Para flanes, pays y postres fríos.', '/images/products/93.webp', NULL, 'La Lechera', 3, false, '370 ml'),
  ('Huevo Blanco 18pz', 'huevo-blanco-18pz', 'Huevo blanco de gallina de granja, yema naranja. Para cocina caliente y repostería.', 'https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp', NULL, 'San Juan', 3, false, '18 piezas'),
  ('Huevo Blanco Caja 30pz', 'huevo-blanco-caja-30pz', 'Caja de 30 huevos blancos. Para cocinas con alto consumo diario.', 'https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp', NULL, 'San Juan', 3, true, '30 piezas'),
  ('Huevo Rojo 18pz', 'huevo-rojo-18pz', 'Huevo rojo de gallina criolla, yema más intensa. Favorito en cocina tradicional.', '/images/products/96.webp', NULL, 'Local', 3, false, '18 piezas'),
  ('Queso Oaxaca 400g', 'queso-oaxaca-400g', 'Queso Oaxaca artesanal, hebra larga y sabor lácteo limpio. Fundido perfecto para quesadillas.', '/images/products/97.webp', NULL, 'Local', 3, true, '400 g'),
  ('Queso Fresco 500g', 'queso-fresco-500g', 'Queso fresco de vaca, textura granular y sabor lácteo suave. Para enchiladas, frijoles y ensaladas.', '/images/products/98.webp', NULL, 'Local', 3, true, '500 g'),
  ('Queso Panela 400g', 'queso-panela-400g', 'Queso panela suave, no se derrite. Para asar a la plancha, ensaladas y botanas.', '/images/products/99.webp', NULL, 'Local', 3, true, '400 g'),
  ('Queso Manchego 400g', 'queso-manchego-400g', 'Queso tipo manchego semicurado. Para sándwiches gourmet, tablas y gratinados.', '/images/products/100.webp', NULL, 'Covadonga', 3, false, '400 g'),
  ('Queso Crema 200g', 'queso-crema-200g', 'Queso crema Philadelphia. Para cheesecakes, dips, salsas y bagels.', 'https://storage.googleapis.com/takeapp/media/cmidk5taj00000igwdgi364t0.webp', NULL, 'Philadelphia', 3, false, '200 g'),
  ('Yogurt Natural 1L', 'yogurt-natural-1l', 'Yogurt natural sin azúcar. Para aderezos, marinados, smoothies y salsas frías.', '/images/products/102.webp', NULL, 'Yoplait', 3, false, '1 litro'),
  ('Crema Ácida 1L', 'crema-acida-1l', 'Crema ácida espesa, sabor lácteo limpio. Para enchiladas, chilaquiles, cremas y dips.', 'https://storage.googleapis.com/takeapp/media/cmidk5ahb00000ikx1fo4ebab.webp', NULL, 'Lala', 3, false, '1 litro'),
  ('Mantequilla sin Sal 200g', 'mantequilla-sin-sal-200g', 'Mantequilla 100% leche de vaca, sin sal. Para repostería, salsas y cocina fina.', 'https://storage.googleapis.com/takeapp/media/cmidk5ucg00000ijff55kb0k6.webp', NULL, 'Gloria', 3, false, '200 g');

-- ============================================================
-- 4. CARNES, AVES Y PESCADOS (cat_id 4) — 30 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, images, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Pechuga de Pollo', 'pechuga-pollo', 'Pechuga de pollo fresca sin piel. Jugosa y magra, para plancha, empanizado o relleno.', '/images/products/105.webp', NULL, 'Bachoco', 4, false, 'por kilo'),
  ('Milanesa de Pollo', 'milanesa-de-pollo', 'Milanesa de pechuga aplanada. Lista para empanizar, freír o asar en pocos minutos.', '/images/products/106.webp', NULL, 'Bachoco', 4, false, 'por kilo'),
  ('Pierna y Muslo de Pollo', 'pierna-muslo-pollo', 'Pierna con muslo de pollo fresco. Jugosa y sabrosa, para horno, asador o guisos.', '/images/products/107.webp', NULL, 'Bachoco', 4, true, 'por kilo'),
  ('Alitas de Pollo', 'alitas-de-pollo', 'Alitas de pollo frescas, partidas. Para alitas fritas, asadas o en salsa BBQ.', '/images/products/108.webp', NULL, 'Bachoco', 4, false, 'por kilo'),
  ('Pollo Entero', 'pollo-entero', 'Pollo entero fresco sin menudencias. Para rostizado, caldos y cocina de volumen.', '/images/products/generic/pollo-entero.webp', jsonb_build_array('/images/products/generic/pollo-entero.webp'), 'Bachoco', 4, true, 'por pieza'),
  ('Bistec de Res', 'bistec-de-res', 'Bistec de res seleccionado, marmoleo parejo y sabor profundo. Para asar o plancha.', '/images/products/generic/bistec-de-res.webp', jsonb_build_array('/images/products/generic/bistec-de-res.webp'), 'SuKarne', 4, false, 'por kilo'),
  ('Milanesa de Res', 'milanesa-de-res', 'Milanesa de res aplanada, corte delgado y parejo. Lista para empanizar o asar rápido.', '/images/products/111.webp', NULL, 'SuKarne', 4, true, 'por kilo'),
  ('Carne Molida 80/20', 'carne-molida-80-20', 'Carne molida de res 80% magra. Textura uniforme para hamburguesas, albóndigas y rellenos.', '/images/products/112.webp', NULL, 'SuKarne', 4, true, 'por kilo'),
  ('Diezmillo de Res', 'diezmillo-de-res', 'Diezmillo para cocción lenta. Perfecto para birria, caldos, deshebrada y barbacoa.', '/images/products/113.webp', NULL, 'SuKarne', 4, true, 'por kilo'),
  ('Falda de Res', 'falda-de-res', 'Falda de res para cocción prolongada. Ideal para caldos de res, cocido y guisos.', '/images/products/generic/falda-de-res.webp', jsonb_build_array('/images/products/generic/falda-de-res.webp'), 'SuKarne', 4, false, 'por kilo'),
  ('Costilla de Res', 'costilla-de-res', 'Costilla de res en tira, marmoleo generoso. Para asar, hornear o guisar.', 'https://storage.googleapis.com/takeapp/media/cmigudmvx000p04jp7knq43u4.png', '["https://storage.googleapis.com/takeapp/media/cmii8rwpx000304la4njhc1ya.png"]'::jsonb, 'SuKarne', 4, false, 'por kilo'),
  ('Arrachera', 'arrachera', 'Arrachera marinada de res. Suave, jugosa y lista para asador. Corte premium para taquería.', '/images/products/116.webp', NULL, 'SuKarne', 4, true, 'por kilo'),
  ('Ribeye', 'ribeye', 'Corte Ribeye de res con marmoleo superior. Para parrilla de alto nivel y servicio premium.', '/images/products/117.webp', NULL, 'SuKarne', 4, false, 'por kilo'),
  ('T-Bone', 't-bone', 'Corte T-Bone de res con hueso, dos cortes en uno. Espectacular a la parrilla.', '/images/products/118.webp', NULL, 'SuKarne', 4, false, 'por kilo'),
  ('Chuleta de Cerdo', 'chuleta-de-cerdo', 'Chuleta de cerdo ahumada de corte parejo. Para asar, freír o guisar.', '/images/products/119.webp', NULL, 'Kowi', 4, true, 'por kilo'),
  ('Lomo de Cerdo', 'lomo-de-cerdo', 'Lomo de cerdo magro, corte entero. Para hornear, rebanar y servicio en frío.', '/images/products/120.webp', NULL, 'Kowi', 4, false, 'por kilo'),
  ('Costilla de Cerdo', 'costilla-de-cerdo', 'Costilla de cerdo baby back. Para asar con BBQ, hornear o cocción lenta.', '/images/products/121.webp', NULL, 'Kowi', 4, false, 'por kilo'),
  ('Tocino', 'tocino', 'Tocino ahumado en rebanadas delgadas. Crujiente perfecto para desayunos, burgers y wraps.', '/images/products/122.webp', NULL, 'FUD', 4, false, 'paquete 250 g'),
  ('Jamón de Pierna', 'jamon-de-pierna', 'Jamón de pierna de cerdo rebanado. Para sándwiches, tortas, croquetas y ensaladas.', '/images/products/123.webp', NULL, 'FUD', 4, false, 'paquete 250 g'),
  ('Chorizo', 'chorizo', 'Chorizo mexicano de cerdo, especiado y listo para freír. Para papas, tacos, huevo y frijoles.', '/images/products/124.webp', NULL, 'Local', 4, true, 'por kilo'),
  ('Longaniza', 'longaniza', 'Longaniza fresca estilo rancho. Para asar entera o desmenuzar en guisos y tacos.', '/images/products/generic/longaniza.webp', jsonb_build_array('/images/products/generic/longaniza.webp'), 'Local', 4, false, 'por kilo'),
  ('Filete de Tilapia', 'filete-de-tilapia', 'Filete de tilapia fresco de agua dulce, carne blanca firme. Para empanizar, asar o al mojo.', '/images/products/126.webp', NULL, 'Local', 4, false, 'por kilo'),
  ('Filete de Basa', 'filete-de-basa', 'Filete de basa blanco, textura suave y sabor neutro. Para capear, asar o cocinar al vapor.', '/images/products/127.webp', NULL, 'Importado', 4, false, 'por kilo'),
  ('Camarón Pacotilla', 'camaron-pacotilla', 'Camarón pacotilla del Pacífico, pelado y crudo. Tamaño mediano para cocteles, tacos y al mojo.', '/images/products/128.webp', NULL, 'Del Pacífico', 4, false, 'por kilo'),
  ('Camarón U12-U15', 'camaron-u12-u15', 'Camarón jumbo U12-U15, tamaño extra grande. Para platillos premium: al ajillo, empanizado.', '/images/products/129.webp', NULL, 'Del Pacífico', 4, false, 'por kilo'),
  ('Pulpo', 'pulpo', 'Pulpo fresco pre-cocido. Para ceviches, a las brasas, al ajillo o en su tinta.', '/images/products/130.webp', NULL, 'Del Pacífico', 4, false, 'por kilo'),
  ('Mojarra Entera', 'mojarra-entera', 'Mojarra fresca entera, eviscerada. Para freír entera, al mojo de ajo o a la talla.', '/images/products/131.webp', NULL, 'Local', 4, true, 'por pieza'),
  ('Huachinango Entero', 'huachinango-entero', 'Huachinango del Golfo entero, eviscerado. El pescado más noble de la cocina mexicana: zarandeado, frito, al horno.', '/images/products/132.webp', NULL, 'Del Golfo', 4, false, 'por kilo'),
  ('Camarón Seco', 'camaron-seco', 'Camarón seco pequeño para caldos, sopa de camarón, tortitas y salsas tradicionales.', '/images/products/133.webp', NULL, 'Local', 4, false, 'por 100 g'),
  ('Salmón', 'salmon', 'Filete de salmón del Atlántico, color naranja intenso y grasa marmoleada. Para sushi, asado o curado.', '/images/products/134.webp', NULL, 'Importado', 4, false, 'por kilo');

-- ============================================================
-- 5. PANADERÍA Y TORTILLERÍA (cat_id 5) — 10 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, images, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Pan Bimbo Blanco', 'pan-bimbo-blanco', 'Pan de caja blanco de miga suave, estructura firme. Para sándwiches, tortas y tostadas francesas.', '/images/products/generic/pan-bimbo-blanco.webp', jsonb_build_array('/images/products/generic/pan-bimbo-blanco.webp'), 'Bimbo', 5, false, '680 g'),
  ('Pan Integral', 'pan-integral', 'Pan de caja integral con fibra. Para sándwiches saludables y tostadas.', '/images/products/generic/pan-integral.webp', jsonb_build_array('/images/products/generic/pan-integral.webp'), 'Bimbo', 5, false, '680 g'),
  ('Pan para Hot Dog', 'pan-hot-dog', 'Pan para hot dog suave, corte lateral. Para hot dogs, dogos y salchichas.', '/images/products/137.webp', NULL, 'Bimbo', 5, false, 'paquete 8 pz'),
  ('Pan para Hamburguesa', 'pan-hamburguesa', 'Pan para hamburguesa con ajonjolí. Suave, esponjoso y dorado.', '/images/products/138.webp', NULL, 'Bimbo', 5, false, 'paquete 8 pz'),
  ('Tortillas de Maíz', 'tortillas-maiz', 'Tortillas de maíz nixtamalizado, hechas al día. Aroma de molino, sabor auténtico.', 'https://storage.googleapis.com/takeapp/media/cmidk5ige00000ij9gnsz26bv.webp', NULL, 'Local', 5, true, 'paquete 1 kg'),
  ('Tortillas de Harina', 'tortillas-de-harina', 'Tortillas de harina de trigo, tamaño regular. Para burritos, wraps y quesadillas.', 'https://storage.googleapis.com/takeapp/media/cmidk5ovr00000hka85jr5bzf.webp', NULL, 'Tía Rosa', 5, true, 'paquete 12 pz'),
  ('Tostadas', 'tostadas', 'Tostadas de maíz crujientes. Para tostadas de pollo, pata, ceviche y guacamole.', '/images/products/generic/tostadas.webp', jsonb_build_array('/images/products/generic/tostadas.webp'), 'Local', 5, true, 'paquete 20 pz'),
  ('Bolillo', 'bolillo', 'Bolillo recién horneado, corteza dorada y miga suave. Para tortas, molletes y acompañamiento.', '/images/products/generic/bolillo.webp', jsonb_build_array('/images/products/generic/bolillo.webp'), 'Local', 5, true, 'por pieza'),
  ('Telera', 'telera', 'Telera suave para tortas estilo mexicano. La base de la torta de la barda, cubana o ahogada.', '/images/products/generic/telera.webp', jsonb_build_array('/images/products/generic/telera.webp'), 'Local', 5, true, 'por pieza'),
  ('Pan de Ajo', 'pan-de-ajo', 'Pan de ajo con mantequilla y perejil listo para hornear. Guarnición clásica para pastas y carnes.', 'https://storage.googleapis.com/takeapp/media/cmihqf2pi000704la16zb486c.png', NULL, 'Bimbo', 5, false, 'paquete 2 pz');

-- ============================================================
-- 6. BEBIDAS (cat_id 6) — 15 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, images, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Coca-Cola 2.5L', 'coca-cola-25l', 'Refresco Coca-Cola botella 2.5L. La más vendida para servicio en restaurante.', '/images/products/generic/coca-cola-25l.webp', jsonb_build_array('/images/products/generic/coca-cola-25l.webp'), 'Coca-Cola', 6, false, '2.5 litros'),
  ('Coca-Cola Light 2.5L', 'coca-cola-light-25l', 'Coca-Cola sin azúcar 2.5L. Opción ligera para el comensal que cuida calorías.', '/images/products/generic/coca-cola-light-25l.webp', jsonb_build_array('/images/products/generic/coca-cola-light-25l.webp'), 'Coca-Cola', 6, false, '2.5 litros'),
  ('Sprite 2L', 'sprite-2l', 'Refresco Sprite lima-limón. Refrescante y versátil.', '/images/products/147.webp', NULL, 'Coca-Cola', 6, false, '2 litros'),
  ('Fanta Naranja 2L', 'fanta-naranja-2l', 'Refresco Fanta sabor naranja. Favorito para comidas informales.', '/images/products/generic/fanta-naranja-2l.webp', jsonb_build_array('/images/products/generic/fanta-naranja-2l.webp'), 'Coca-Cola', 6, false, '2 litros'),
  ('Sidral Mundet 2L', 'sidral-mundet-2l', 'Refresco de manzana Sidral Mundet. El acompañante clásico de la comida mexicana.', '/images/products/149.webp', NULL, 'Mundet', 6, false, '2 litros'),
  ('Agua Bonafont 1.5L', 'agua-bonafont-15l', 'Agua purificada Bonafont, mineralización ligera. Para servicio de mesa y cocina.', '/images/products/150.webp', NULL, 'Bonafont', 6, false, '1.5 litros'),
  ('Agua Mineral 1.5L', 'agua-mineral-15l', 'Agua mineral con gas Peñafiel. Para bebidas preparadas y servicio.', '/images/products/151.webp', NULL, 'Peñafiel', 6, false, '1.5 litros'),
  ('Agua Mineral Saborizada 1.5L', 'agua-mineral-saborizada-15l', 'Peñafiel sabor limón o naranja. Sin azúcar, refrescante y ligera.', '/images/products/152.webp', NULL, 'Peñafiel', 6, false, '1.5 litros'),
  ('Jugo Jumex 1L', 'jugo-jumex-1l', 'Jugo o néctar de frutas Jumex. Para barra de jugos, smoothies y cocina.', '/images/products/generic/jugo-jumex-1l.webp', jsonb_build_array('/images/products/generic/jugo-jumex-1l.webp'), 'Jumex', 6, false, '1 litro'),
  ('Concentrado Jamaica 1L', 'concentrado-jamaica-1l', 'Concentrado de flor de jamaica para aguas frescas. Rinde hasta 10 litros.', 'https://storage.googleapis.com/takeapp/media/cmiklslqg000r04ikb4kfd62a.png', NULL, 'Local', 6, true, '1 litro'),
  ('Concentrado Horchata 1L', 'concentrado-horchata-1l', 'Concentrado de horchata de arroz. Rinde hasta 10 litros. Sabor tradicional.', '/images/products/generic/concentrado-horchata-1l.webp', jsonb_build_array('/images/products/generic/concentrado-horchata-1l.webp'), 'Local', 6, true, '1 litro'),
  ('Cerveza Corona 355ml', 'cerveza-corona-355ml', 'Cerveza clara Corona Extra. La cerveza mexicana más reconocida del mundo.', '/images/products/generic/cerveza-corona-355ml.webp', jsonb_build_array('/images/products/generic/cerveza-corona-355ml.webp'), 'Corona', 6, false, '355 ml'),
  ('Cerveza Modelo Especial 355ml', 'cerveza-modelo-355ml', 'Cerveza tipo Pilsner Modelo Especial. Sabor balanceado, la más vendida en México.', '/images/products/generic/cerveza-modelo-355ml.webp', jsonb_build_array('/images/products/generic/cerveza-modelo-355ml.webp'), 'Modelo', 6, false, '355 ml'),
  ('Cerveza Victoria 355ml', 'cerveza-victoria-355ml', 'Cerveza tipo Vienna Victoria, maltosa y acaramelada. Maridaje perfecto con comida mexicana.', '/images/products/generic/cerveza-victoria-355ml.webp', jsonb_build_array('/images/products/generic/cerveza-victoria-355ml.webp'), 'Victoria', 6, false, '355 ml'),
  ('Cerveza Pacífico 355ml', 'cerveza-pacifico-355ml', 'Cerveza clara tipo Pilsner Pacífico. Refrescante, estilo costa para mariscos.', '/images/products/generic/cerveza-pacifico-355ml.webp', jsonb_build_array('/images/products/generic/cerveza-pacifico-355ml.webp'), 'Pacífico', 6, false, '355 ml');

-- ============================================================
-- 7. BOTANAS Y DULCES (cat_id 7) — 6 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, images, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Sabritas Clásicas 170g', 'sabritas-clasicas-170g', 'Papas fritas saladas clásicas. El snack mexicano por excelencia.', '/images/products/160.webp', NULL, 'Sabritas', 7, false, '170 g'),
  ('Totopos 200g', 'totopos-200g', 'Totopos de maíz para nachos, chilaquiles y botana con guacamole.', '/images/products/generic/totopos-200g.webp', jsonb_build_array('/images/products/generic/totopos-200g.webp'), 'Local', 7, true, '200 g'),
  ('Cacahuate Salado 200g', 'cacahuate-salado-200g', 'Cacahuate tostado y salado. Para botana de barra y servicio de mesa.', '/images/products/162.webp', NULL, 'Local', 7, false, '200 g'),
  ('Galletas Marías 200g', 'galletas-marias-200g', 'Galletas Marías clásicas Gamesa. Para postres, pay de queso y botana.', '/images/products/163.webp', NULL, 'Gamesa', 7, false, '200 g'),
  ('Galletas Saladas 200g', 'galletas-saladas-200g', 'Galletas saladas tipo soda. Para botana, dips y cocina (empanizado, bases).', '/images/products/164.webp', NULL, 'Gamesa', 7, false, '200 g'),
  ('Chocolate Abuelita', 'chocolate-abuelita', 'Chocolate de mesa Abuelita en tableta. Para chocolate caliente, mole y postres tradicionales.', '/images/products/generic/chocolate-abuelita.webp', jsonb_build_array('/images/products/generic/chocolate-abuelita.webp'), 'Abuelita', 7, true, 'tableta 90 g');

-- ============================================================
-- 8. LIMPIEZA PARA COCINA (cat_id 8) — 14 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, images, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Cloro 1L', 'cloro-1l', 'Cloro blanqueador concentrado Cloralex. Desinfección profunda para cocinas.', '/images/products/generic/cloro-1l.webp', jsonb_build_array('/images/products/generic/cloro-1l.webp'), 'Cloralex', 8, false, '1 litro'),
  ('Cloro 5L', 'cloro-5l', 'Garrafa de cloro 5 litros. Para cocinas de alto volumen con limpieza constante.', '/images/products/generic/cloro-5l.webp', jsonb_build_array('/images/products/generic/cloro-5l.webp'), 'Cloralex', 8, true, '5 litros'),
  ('Jabón Zote 400g', 'jabon-zote-400g', 'Jabón de lavandería Zote en barra. Poder desengrasante para utensilios y trapos.', '/images/products/generic/jabon-zote-400g.webp', jsonb_build_array('/images/products/generic/jabon-zote-400g.webp'), 'Zote', 8, true, '400 g'),
  ('Detergente Líquido 1L', 'detergente-liquido-1l', 'Detergente líquido para ropa de cocina. Limpia mandiles, trapos y uniformes.', '/images/products/169.webp', NULL, 'Foca', 8, false, '1 litro'),
  ('Detergente en Polvo 1kg', 'detergente-en-polvo-1kg', 'Detergente en polvo para lavadora. Limpieza profunda de textiles de cocina.', '/images/products/170.webp', NULL, 'Roma', 8, false, '1 kg'),
  ('Desengrasante 1L', 'desengrasante-1l', 'Desengrasante concentrado para campanas, estufas, azulejos y superficies de acero.', '/images/products/generic/desengrasante-1l.webp', jsonb_build_array('/images/products/generic/desengrasante-1l.webp'), 'Pinol', 8, false, '1 litro'),
  ('Limpiador Multiusos 500ml', 'limpiador-multiusos-500ml', 'Limpiador desinfectante con aroma pino. Superficies impecables en un paso.', '/images/products/172.webp', NULL, 'Pinol', 8, false, '500 ml'),
  ('Limpiavidrios 500ml', 'limpiavidrios-500ml', 'Limpiador de vidrios sin rayas. Para vitrinas, espejos y ventanas de restaurante.', '/images/products/173.webp', NULL, 'Windex', 8, false, '500 ml'),
  ('Jabón Lavaplatos 750ml', 'jabon-lavaplatos-750ml', 'Jabón líquido lavaplatos concentrado. Desengrasa y rinde más lavadas por gota.', '/images/products/generic/jabon-lavaplatos-750ml.webp', jsonb_build_array('/images/products/generic/jabon-lavaplatos-750ml.webp'), 'Axion', 8, true, '750 ml'),
  ('Fibras para Trastes 3pz', 'fibras-para-trastes-3pz', 'Fibras verdes multiusos. Para lavar ollas, sartenes y utensilios.', '/images/products/175.webp', NULL, 'Scotch-Brite', 8, true, '3 piezas'),
  ('Bolsas de Basura 50pz', 'bolsas-de-basura-50pz', 'Bolsas de basura negras tamaño estándar. Resistentes, no se rompen.', '/images/products/generic/bolsas-de-basura-50pz.webp', jsonb_build_array('/images/products/generic/bolsas-de-basura-50pz.webp'), 'Local', 8, false, 'paquete 50 pz'),
  ('Servilletas 100pz', 'servilletas-100pz', 'Servilletas de papel blanco. Para servicio de mesa, desechables y económicas.', '/images/products/177.webp', NULL, 'Petalo', 8, false, 'paquete 100 pz'),
  ('Papel de Cocina 2pz', 'papel-de-cocina-2pz', 'Rollo de papel absorbente para cocina. Para limpieza rápida y secado.', '/images/products/178.webp', NULL, 'Petalo', 8, false, '2 rollos'),
  ('Guantes de Látex Caja 100pz', 'guantes-de-latex-100pz', 'Guantes desechables de látex para manipulación de alimentos. Higiene profesional.', '/images/products/generic/guantes-de-latex-100pz.webp', jsonb_build_array('/images/products/generic/guantes-de-latex-100pz.webp'), 'Local', 8, true, 'caja 100 pz');

-- ============================================================
-- 9. CONGELADOS (cat_id 9) — 8 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, images, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Verduras Congeladas 500g', 'verduras-congeladas-500g', 'Mix de verduras: zanahoria, chícharo, elote y ejote. Listas en minutos.', '/images/products/generic/verduras-congeladas-500g.webp', jsonb_build_array('/images/products/generic/verduras-congeladas-500g.webp'), 'Birds Eye', 9, false, '500 g'),
  ('Papas a la Francesa 1kg', 'papas-a-la-francesa-1kg', 'Papas pre-fritas congeladas. Para freidora, horno o air fryer.', '/images/products/generic/papas-a-la-francesa-1kg.webp', jsonb_build_array('/images/products/generic/papas-a-la-francesa-1kg.webp'), 'McCain', 9, false, '1 kg'),
  ('Helado Vainilla 1L', 'helado-vainilla-1l', 'Helado cremoso de vainilla. Para postres, batidos y flotantes.', '/images/products/182.webp', NULL, 'Holanda', 9, false, '1 litro'),
  ('Paletas de Hielo 12pz', 'paletas-de-hielo-12pz', 'Paletas de hielo surtidas (fresa, uva, limón). Refrescantes para servicio y postre.', '/images/products/183.webp', NULL, 'Holanda', 9, false, '12 piezas'),
  ('Filete de Tilapia Congelado 1kg', 'filete-tilapia-congelado-1kg', 'Filete de tilapia IQF congelado individualmente. Descongela por pieza.', '/images/products/184.webp', NULL, 'Importado', 9, false, '1 kg'),
  ('Camarón Congelado 1kg', 'camaron-congelado-1kg', 'Camarón mediano IQF congelado. Listo para descongelar y cocinar.', '/images/products/185.webp', NULL, 'Importado', 9, false, '1 kg'),
  ('Nuggets de Pollo 1kg', 'nuggets-de-pollo-1kg', 'Nuggets de pechuga de pollo empanizados. Listos para freír u hornear.', '/images/products/186.webp', NULL, 'Bachoco', 9, false, '1 kg'),
  ('Deditos de Pescado 1kg', 'deditos-de-pescado-1kg', 'Deditos de pescado empanizados. Para freír u hornear. Rinden para menú infantil.', '/images/products/generic/deditos-de-pescado-1kg.webp', jsonb_build_array('/images/products/generic/deditos-de-pescado-1kg.webp'), 'Del Pacífico', 9, false, '1 kg');

-- ============================================================
-- ============================================================
-- PRECIOS POR TIENDA (product_stores)
-- ============================================================
-- Resurte.me (store_id 1): Precios de mayoreo / central de abastos
--
-- Cat 1 (Frutas y Verduras):       IDs 1-50 (50 productos)
-- Cat 2 (Abarrotes):                IDs 51-88 (38 productos)
-- Cat 3 (Lácteos y Huevos):         IDs 89-104 (16 productos)
-- Cat 4 (Carnes, Aves, Pescados):   IDs 105-134 (30 productos)
-- Cat 5 (Panadería y Tortillería):  IDs 135-144 (10 productos)
-- Cat 6 (Bebidas):                  IDs 145-159 (15 productos)
-- Cat 7 (Botanas y Dulces):         IDs 160-165 (6 productos)
-- Cat 8 (Limpieza para Cocina):     IDs 166-179 (14 productos)
-- Cat 9 (Congelados):               IDs 180-187 (8 productos)

DO $$
DECLARE
  pid BIGINT;
  pr NUMERIC(10,2);
  sp NUMERIC(10,2);
BEGIN

  -- Frutas y Verduras (IDs 1-50, 50 productos)
  FOR pid IN 1..50 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 1 THEN 38 WHEN 2 THEN 45 WHEN 3 THEN 60 WHEN 4 THEN 28 WHEN 5 THEN 32 WHEN 6 THEN 20 WHEN 7 THEN 22 WHEN 8 THEN 48 WHEN 9 THEN 38 WHEN 10 THEN 25 WHEN 11 THEN 22 WHEN 12 THEN 14 WHEN 13 THEN 35 WHEN 14 THEN 32 WHEN 15 THEN 28 WHEN 16 THEN 58 WHEN 17 THEN 65 WHEN 18 THEN 35 WHEN 19 THEN 30 WHEN 20 THEN 24 WHEN 21 THEN 26 WHEN 22 THEN 28 WHEN 23 THEN 20 WHEN 24 THEN 25 WHEN 25 THEN 22 WHEN 26 THEN 28 WHEN 27 THEN 16 WHEN 28 THEN 25 WHEN 29 THEN 28 WHEN 30 THEN 26 WHEN 31 THEN 18 WHEN 32 THEN 8 WHEN 33 THEN 10 WHEN 34 THEN 12 WHEN 35 THEN 25 WHEN 36 THEN 22 WHEN 37 THEN 28 WHEN 38 THEN 15 WHEN 39 THEN 12 WHEN 40 THEN 18 WHEN 41 THEN 22 WHEN 42 THEN 8 WHEN 43 THEN 32 WHEN 44 THEN 28 WHEN 45 THEN 22 WHEN 46 THEN 45 WHEN 47 THEN 15 WHEN 48 THEN 55 WHEN 49 THEN 85 WHEN 50 THEN 58 END;
    sp := CASE pid WHEN 1 THEN 32 WHEN 5 THEN 28 WHEN 6 THEN 18 WHEN 20 THEN 20 WHEN 23 THEN 18 WHEN 32 THEN 6 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

  END LOOP;

  -- Abarrotes (IDs 51-88, 38 productos)
  FOR pid IN 51..88 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 51 THEN 26 WHEN 52 THEN 105 WHEN 53 THEN 35 WHEN 54 THEN 155 WHEN 55 THEN 38 WHEN 56 THEN 42 WHEN 57 THEN 28 WHEN 58 THEN 32 WHEN 59 THEN 40 WHEN 60 THEN 185 WHEN 61 THEN 52 WHEN 62 THEN 120 WHEN 63 THEN 45 WHEN 64 THEN 16 WHEN 65 THEN 14 WHEN 66 THEN 14 WHEN 67 THEN 19 WHEN 68 THEN 24 WHEN 69 THEN 24 WHEN 70 THEN 36 WHEN 71 THEN 12 WHEN 72 THEN 15 WHEN 73 THEN 28 WHEN 74 THEN 14 WHEN 75 THEN 16 WHEN 76 THEN 25 WHEN 77 THEN 42 WHEN 78 THEN 35 WHEN 79 THEN 55 WHEN 80 THEN 65 WHEN 81 THEN 35 WHEN 82 THEN 32 WHEN 83 THEN 45 WHEN 84 THEN 28 WHEN 85 THEN 22 WHEN 86 THEN 18 WHEN 87 THEN 48 WHEN 88 THEN 24 END;
    sp := CASE pid WHEN 51 THEN 22 WHEN 53 THEN 30 WHEN 55 THEN 34 WHEN 73 THEN 24 WHEN 81 THEN 28 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

  END LOOP;

  -- Lácteos y Huevos (IDs 89-104, 16 productos)
  FOR pid IN 89..104 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 89 THEN 26 WHEN 90 THEN 24 WHEN 91 THEN 18 WHEN 92 THEN 16 WHEN 93 THEN 28 WHEN 94 THEN 52 WHEN 95 THEN 85 WHEN 96 THEN 58 WHEN 97 THEN 58 WHEN 98 THEN 45 WHEN 99 THEN 42 WHEN 100 THEN 68 WHEN 101 THEN 35 WHEN 102 THEN 35 WHEN 103 THEN 48 WHEN 104 THEN 28 END;
    sp := CASE pid WHEN 89 THEN 22 WHEN 94 THEN 48 WHEN 97 THEN 52 WHEN 102 THEN 30 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

  END LOOP;

  -- Carnes, Aves y Pescados (IDs 105-134, 30 productos)
  FOR pid IN 105..134 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 105 THEN 115 WHEN 106 THEN 125 WHEN 107 THEN 85 WHEN 108 THEN 95 WHEN 109 THEN 88 WHEN 110 THEN 165 WHEN 111 THEN 155 WHEN 112 THEN 135 WHEN 113 THEN 148 WHEN 114 THEN 142 WHEN 115 THEN 155 WHEN 116 THEN 240 WHEN 117 THEN 280 WHEN 118 THEN 260 WHEN 119 THEN 128 WHEN 120 THEN 155 WHEN 121 THEN 142 WHEN 122 THEN 58 WHEN 123 THEN 55 WHEN 124 THEN 85 WHEN 125 THEN 95 WHEN 126 THEN 138 WHEN 127 THEN 128 WHEN 128 THEN 310 WHEN 129 THEN 480 WHEN 130 THEN 260 WHEN 131 THEN 195 WHEN 132 THEN 68 WHEN 133 THEN 195 WHEN 134 THEN 165 END;
    sp := CASE pid WHEN 105 THEN 108 WHEN 110 THEN 150 WHEN 112 THEN 128 WHEN 114 THEN 135 WHEN 133 THEN 175 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, (CASE pid WHEN 129 THEN 'out_of_stock' WHEN 132 THEN 'low_stock' WHEN 134 THEN 'low_stock' ELSE 'in_stock' END)::stock_status);

  END LOOP;

  -- Panadería y Tortillería (IDs 135-144, 10 productos)
  FOR pid IN 135..144 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 135 THEN 38 WHEN 136 THEN 40 WHEN 137 THEN 32 WHEN 138 THEN 35 WHEN 139 THEN 20 WHEN 140 THEN 35 WHEN 141 THEN 28 WHEN 142 THEN 5 WHEN 143 THEN 6 WHEN 144 THEN 22 END;
    sp := CASE pid WHEN 135 THEN 34 WHEN 139 THEN 18 WHEN 142 THEN 4 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

  END LOOP;

  -- Bebidas (IDs 145-159, 15 productos)
  FOR pid IN 145..159 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 145 THEN 36 WHEN 146 THEN 34 WHEN 147 THEN 30 WHEN 148 THEN 28 WHEN 149 THEN 28 WHEN 150 THEN 14 WHEN 151 THEN 16 WHEN 152 THEN 16 WHEN 153 THEN 26 WHEN 154 THEN 42 WHEN 155 THEN 38 WHEN 156 THEN 20 WHEN 157 THEN 22 WHEN 158 THEN 22 WHEN 159 THEN 20 END;
    sp := CASE pid WHEN 145 THEN 32 WHEN 150 THEN 12 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

  END LOOP;

  -- Botanas y Dulces (IDs 160-165, 6 productos)
  FOR pid IN 160..165 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 160 THEN 36 WHEN 161 THEN 25 WHEN 162 THEN 22 WHEN 163 THEN 20 WHEN 164 THEN 18 WHEN 165 THEN 16 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

  END LOOP;

  -- Limpieza para Cocina (IDs 166-179, 14 productos)
  FOR pid IN 166..179 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 166 THEN 20 WHEN 167 THEN 78 WHEN 168 THEN 16 WHEN 169 THEN 30 WHEN 170 THEN 28 WHEN 171 THEN 28 WHEN 172 THEN 26 WHEN 173 THEN 32 WHEN 174 THEN 28 WHEN 175 THEN 18 WHEN 176 THEN 35 WHEN 177 THEN 28 WHEN 178 THEN 24 WHEN 179 THEN 85 END;
    sp := CASE pid WHEN 166 THEN 18 WHEN 168 THEN 14 WHEN 174 THEN 24 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

  END LOOP;

  -- Congelados (IDs 180-187, 8 productos)
  FOR pid IN 180..187 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 180 THEN 42 WHEN 181 THEN 58 WHEN 182 THEN 52 WHEN 183 THEN 45 WHEN 184 THEN 125 WHEN 185 THEN 220 WHEN 186 THEN 85 WHEN 187 THEN 78 END;
    sp := CASE pid WHEN 181 THEN 52 WHEN 185 THEN 200 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

  END LOOP;
END $$;


-- ============================================================
-- 10. PRODUCTOS ADICIONALES — Ingredientes de recetas
-- Generado automáticamente para completar catálogo de recetas
-- ============================================================
INSERT INTO products (name, slug, description, image_url, images, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Pan Brioche', 'pan-brioche', 'Pan brioche suave con mantequilla.', '/images/products/recipe/pan-brioche.webp', jsonb_build_array('/images/products/recipe/pan-brioche.webp'), 'Benny', 5, false, 'paquete 4 pz'),
  ('Queso Cheddar Rebanado', 'queso-cheddar-rebanado', 'Rebanadas de queso cheddar americano.', '/images/products/recipe/queso-cheddar-rebanado.webp', jsonb_build_array('/images/products/recipe/queso-cheddar-rebanado.webp'), 'Kraft', 3, true, 'paquete 200 g'),
  ('Pepinillos', 'pepinillos', 'Pepinillos encurtidos agridulces en rodajas.', '/images/products/recipe/pepinillos.webp', jsonb_build_array('/images/products/recipe/pepinillos.webp'), 'Vlasic', 1, true, 'frasco 500 g'),
  ('Salchicha Jumbo', 'salchicha-jumbo', 'Salchicha estilo Frankfurt jumbo para hot dogs.', '/images/products/recipe/salchicha-jumbo.webp', jsonb_build_array('/images/products/recipe/salchicha-jumbo.webp'), 'FUD', 4, true, 'paquete 6 pz'),
  ('Pepinillos Encurtidos', 'pepinillos-encurtidos', 'Pepinillos enteros encurtidos en salmuera.', '/images/products/recipe/pepinillos-encurtidos.webp', jsonb_build_array('/images/products/recipe/pepinillos-encurtidos.webp'), 'Vlasic', 1, true, 'frasco 1 L'),
  ('Chiles Jalapeños Encurtidos', 'chiles-jalapenos-encurtidos', 'Jalapeños en escabeche tatemados.', '/images/products/recipe/chiles-jalapenos-encurtidos.webp', jsonb_build_array('/images/products/recipe/chiles-jalapenos-encurtidos.webp'), 'La Costeña', 1, true, 'lata 380 g'),
  ('Papas Congeladas', 'papas-congeladas', 'Papas pre-fritas congeladas para freír.', '/images/products/recipe/papas-congeladas.webp', jsonb_build_array('/images/products/recipe/papas-congeladas.webp'), 'McCain', 9, false, 'bolsa 1 kg'),
  ('Aceite Vegetal', 'aceite-vegetal', 'Aceite vegetal para freír y cocinar.', '/images/products/recipe/aceite-vegetal.webp', jsonb_build_array('/images/products/recipe/aceite-vegetal.webp'), '1-2-3', 2, true, 'botella 1 L'),
  ('Aros de Cebolla', 'aros-de-cebolla', 'Aros de cebolla empanizados congelados.', '/images/products/recipe/aros-de-cebolla.webp', jsonb_build_array('/images/products/recipe/aros-de-cebolla.webp'), 'McCain', 9, false, 'bolsa 500 g'),
  ('Salsa BBQ', 'salsa-bbq', 'Salsa barbacoa ahumada estilo Kansas City.', '/images/products/recipe/salsa-bbq.webp', jsonb_build_array('/images/products/recipe/salsa-bbq.webp'), 'Hunt''s', 7, true, 'botella 500 ml'),
  ('Frijoles Refritos', 'frijoles-refritos', 'Frijoles refritos tradicionales listos para servir.', '/images/products/recipe/frijoles-refritos.webp', jsonb_build_array('/images/products/recipe/frijoles-refritos.webp'), 'La Sierra', 7, true, 'lata 580 g'),
  ('Panko', 'panko', 'Pan molido japonés para empanizados extra crujientes.', '/images/products/recipe/panko.webp', jsonb_build_array('/images/products/recipe/panko.webp'), 'Kikkoman', 2, true, 'bolsa 200 g'),
  ('Huevo Fresco', 'huevo-fresco', 'Huevo blanco fresco de gallina para cocina diaria.', '/images/products/recipe/huevo-fresco.webp', jsonb_build_array('/images/products/recipe/huevo-fresco.webp'), 'San Juan', 3, true, 'caja 30 pz'),
  ('Aderezo Ranch', 'aderezo-ranch', 'Aderezo ranch cremoso para ensaladas y dips.', '/images/products/recipe/aderezo-ranch.webp', jsonb_build_array('/images/products/recipe/aderezo-ranch.webp'), 'McCormick', 7, true, 'botella 355 ml'),
  ('Pierna de Cerdo', 'pierna-de-cerdo', 'Pierna de cerdo fresca para carnitas y guisos.', '/images/products/recipe/pierna-de-cerdo.webp', jsonb_build_array('/images/products/recipe/pierna-de-cerdo.webp'), 'Local', 4, true, 'por kilo'),
  ('Achiote en Pasta', 'achiote-en-pasta', 'Pasta de achiote concentrada para cochinita pibil.', '/images/products/recipe/achiote-en-pasta.webp', jsonb_build_array('/images/products/recipe/achiote-en-pasta.webp'), 'El Yucateco', 2, true, 'paquete 100 g'),
  ('Chiles Secos Surtidos', 'chiles-secos-surtidos', 'Chiles secos variados para moles y adobos.', '/images/products/recipe/chiles-secos-surtidos.webp', jsonb_build_array('/images/products/recipe/chiles-secos-surtidos.webp'), 'Local', 2, true, 'bolsa 250 g'),
  ('Cebolla Cambray', 'cebolla-cambray', 'Cebollas cambray tiernas para asar al carbón.', '/images/products/recipe/cebolla-cambray.webp', jsonb_build_array('/images/products/recipe/cebolla-cambray.webp'), 'Local', 1, true, 'por manojo'),
  ('Chile Guajillo', 'chile-guajillo', 'Chile guajillo seco de sabor afrutado para adobos.', '/images/products/recipe/chile-guajillo.webp', jsonb_build_array('/images/products/recipe/chile-guajillo.webp'), 'Local', 2, true, 'bolsa 200 g'),
  ('Manteca de Cerdo', 'manteca-de-cerdo', 'Manteca de cerdo pura para fritura tradicional.', '/images/products/recipe/manteca-de-cerdo.webp', jsonb_build_array('/images/products/recipe/manteca-de-cerdo.webp'), 'Local', 2, true, 'por kilo'),
  ('Hoja de Laurel', 'hoja-de-laurel', 'Hojas de laurel secas para guisos y caldos.', '/images/products/recipe/hoja-de-laurel.webp', jsonb_build_array('/images/products/recipe/hoja-de-laurel.webp'), 'Local', 2, true, 'bolsa 20 g'),
  ('Flor de Calabaza', 'flor-de-calabaza', 'Flor de calabaza fresca para quesadillas y sopas.', '/images/products/recipe/flor-de-calabaza.webp', jsonb_build_array('/images/products/recipe/flor-de-calabaza.webp'), 'Local', 1, true, 'por manojo'),
  ('Chile Chipotle', 'chile-chipotle', 'Chipotles en adobo para salsas y guisos ahumados.', '/images/products/recipe/chile-chipotle.webp', jsonb_build_array('/images/products/recipe/chile-chipotle.webp'), 'La Costeña', 2, true, 'lata 230 g'),
  ('Alga Nori', 'alga-nori', 'Hojas de alga nori tostada para sushi rolls.', '/images/products/recipe/alga-nori.webp', jsonb_build_array('/images/products/recipe/alga-nori.webp'), 'Kikkoman', 2, true, 'paquete 10 hojas'),
  ('Surimi', 'surimi', 'Palitos de surimi para sushi california y ensaladas.', '/images/products/recipe/surimi.webp', jsonb_build_array('/images/products/recipe/surimi.webp'), 'Del Pacífico', 4, true, 'paquete 250 g'),
  ('Jengibre Encurtido', 'jengibre-encurtido', 'Jengibre rosado encurtido para sushi (gari).', '/images/products/recipe/jengibre-encurtido.webp', jsonb_build_array('/images/products/recipe/jengibre-encurtido.webp'), 'Kikkoman', 2, true, 'frasco 200 g'),
  ('Huesos de Cerdo', 'huesos-de-cerdo', 'Huesos de cerdo para caldo de ramen tonkotsu.', '/images/products/recipe/huesos-de-cerdo.webp', jsonb_build_array('/images/products/recipe/huesos-de-cerdo.webp'), 'Local', 4, true, 'por kilo'),
  ('Fideos Ramen', 'fideos-ramen', 'Fideos para ramen estilo japonés, cocción rápida.', '/images/products/recipe/fideos-ramen.webp', jsonb_build_array('/images/products/recipe/fideos-ramen.webp'), 'Maruchan', 2, true, 'paquete 500 g'),
  ('Jengibre Fresco', 'jengibre-fresco', 'Raíz de jengibre fresco para cocina asiática.', '/images/products/recipe/jengibre-fresco.webp', jsonb_build_array('/images/products/recipe/jengibre-fresco.webp'), 'Local', 1, true, 'por 100 g'),
  ('Carne de Cerdo Molida', 'carne-de-cerdo-molida', 'Carne de cerdo molida para gyoza y dumplings.', '/images/products/recipe/carne-de-cerdo-molida.webp', jsonb_build_array('/images/products/recipe/carne-de-cerdo-molida.webp'), 'Local', 4, true, 'por kilo'),
  ('Col China', 'col-china', 'Col china (hakusai) para ramen, salteados y kimchi.', '/images/products/recipe/col-china.webp', jsonb_build_array('/images/products/recipe/col-china.webp'), 'Local', 1, true, 'por pieza'),
  ('Cebollín', 'cebollin', 'Cebollín fresco para guarnición de sushi y ramen.', '/images/products/recipe/cebollin.webp', jsonb_build_array('/images/products/recipe/cebollin.webp'), 'Local', 1, true, 'por manojo'),
  ('Pasta Wonton', 'pasta-wonton', 'Cuadros de pasta fina para wonton y dumplings.', '/images/products/recipe/pasta-wonton.webp', jsonb_build_array('/images/products/recipe/pasta-wonton.webp'), 'Local', 5, false, 'paquete 50 hojas'),
  ('Pasta de Tamarindo', 'pasta-de-tamarindo', 'Concentrado de tamarindo para salsas agridulces.', '/images/products/recipe/pasta-de-tamarindo.webp', jsonb_build_array('/images/products/recipe/pasta-de-tamarindo.webp'), 'Local', 2, true, 'frasco 300 g'),
  ('Germinado de Soya', 'germinado-de-soya', 'Germinado de soya fresco para salteados y ramen.', '/images/products/recipe/germinado-de-soya.webp', jsonb_build_array('/images/products/recipe/germinado-de-soya.webp'), 'Local', 1, true, 'bolsa 200 g'),
  ('Salsa de Anguila', 'salsa-de-anguila', 'Salsa dulce de anguila (unagi) para sushi glaze.', '/images/products/recipe/salsa-de-anguila.webp', jsonb_build_array('/images/products/recipe/salsa-de-anguila.webp'), 'Kikkoman', 7, true, 'botella 200 ml'),
  ('Puré de Tomate Enlatado', 'pure-de-tomate-enlatado', 'Puré de tomate italiano para salsas y bases.', '/images/products/recipe/pure-de-tomate-enlatado.webp', jsonb_build_array('/images/products/recipe/pure-de-tomate-enlatado.webp'), 'La Fina', 7, true, 'lata 794 g'),
  ('Queso Mozzarella', 'queso-mozzarella', 'Queso mozzarella fresco para pizzas, ideal para fundir.', '/images/products/recipe/queso-mozzarella.webp', jsonb_build_array('/images/products/recipe/queso-mozzarella.webp'), 'Local', 3, true, 'por kilo'),
  ('Albahaca Fresca', 'albahaca-fresca', 'Albahaca fresca italiana de hoja grande para pesto y pizzas.', '/images/products/recipe/albahaca-fresca.webp', jsonb_build_array('/images/products/recipe/albahaca-fresca.webp'), 'Local', 1, true, 'por manojo'),
  ('Levadura', 'levadura', 'Levadura seca instantánea para panes y masas.', '/images/products/recipe/levadura.webp', jsonb_build_array('/images/products/recipe/levadura.webp'), 'Levapan', 5, false, 'sobre 11 g'),
  ('Pepperoni', 'pepperoni', 'Pepperoni rebanado para pizzas estilo americano.', '/images/products/recipe/pepperoni.webp', jsonb_build_array('/images/products/recipe/pepperoni.webp'), 'FUD', 4, true, 'paquete 200 g'),
  ('Champiñones Frescos', 'champinones-frescos', 'Champiñones frescos rebanados para pizzas y salteados.', '/images/products/recipe/champinones-frescos.webp', jsonb_build_array('/images/products/recipe/champinones-frescos.webp'), 'Local', 1, true, 'charola 250 g'),
  ('Pimiento Morrón', 'pimiento-morron', 'Pimiento morrón de colores para pizzas y asados.', '/images/products/recipe/pimiento-morron.webp', jsonb_build_array('/images/products/recipe/pimiento-morron.webp'), 'Local', 1, true, 'por kilo'),
  ('Pasta Fettuccine', 'pasta-fettuccine', 'Pasta larga fettuccine de sémola de trigo.', '/images/products/recipe/pasta-fettuccine.webp', jsonb_build_array('/images/products/recipe/pasta-fettuccine.webp'), 'Barilla', 2, true, 'paquete 500 g'),
  ('Queso Parmesano', 'queso-parmesano', 'Queso parmesano añejo para rallar fresco.', '/images/products/recipe/queso-parmesano.webp', jsonb_build_array('/images/products/recipe/queso-parmesano.webp'), 'Kraft', 3, true, 'cuña 200 g'),
  ('Crema para Batir', 'crema-para-batir', 'Crema para batir con 35% de grasa para salsas y repostería.', '/images/products/recipe/crema-para-batir.webp', jsonb_build_array('/images/products/recipe/crema-para-batir.webp'), 'Alpura', 3, true, 'litro'),
  ('Queso Gorgonzola', 'queso-gorgonzola', 'Queso azul italiano gorgonzola DOP cremoso.', '/images/products/recipe/queso-gorgonzola.webp', jsonb_build_array('/images/products/recipe/queso-gorgonzola.webp'), 'Importado', 3, true, 'cuña 200 g'),
  ('Queso Provolone', 'queso-provolone', 'Queso provolone semiduro para sándwiches y gratinados.', '/images/products/recipe/queso-provolone.webp', jsonb_build_array('/images/products/recipe/queso-provolone.webp'), 'Local', 3, true, 'por kilo'),
  ('Pasta para Lasaña', 'pasta-para-lasana', 'Láminas de pasta para lasaña, precocción.', '/images/products/recipe/pasta-para-lasana.webp', jsonb_build_array('/images/products/recipe/pasta-para-lasana.webp'), 'Barilla', 2, true, 'caja 500 g'),
  ('Puré de Jitomate', 'pure-de-jitomate', 'Puré de jitomate concentrado para salsas italianas.', '/images/products/recipe/pure-de-jitomate.webp', jsonb_build_array('/images/products/recipe/pure-de-jitomate.webp'), 'La Fina', 7, true, 'lata 794 g'),
  ('Soletillas', 'soletillas', 'Bizcochos de soletilla para tiramisú y postres.', '/images/products/recipe/soletillas.webp', jsonb_build_array('/images/products/recipe/soletillas.webp'), 'Local', 5, false, 'paquete 200 g'),
  ('Queso Mascarpone', 'queso-mascarpone', 'Queso mascarpone cremoso para tiramisú y postres.', '/images/products/recipe/queso-mascarpone.webp', jsonb_build_array('/images/products/recipe/queso-mascarpone.webp'), 'Importado', 3, true, 'tarrina 250 g'),
  ('Café Espresso', 'cafe-espresso', 'Café espresso en grano tostado italiano.', '/images/products/recipe/cafe-espresso.webp', jsonb_build_array('/images/products/recipe/cafe-espresso.webp'), 'Illy', 6, false, 'bolsa 1 kg'),
  ('Cocoa en Polvo', 'cocoa-en-polvo', 'Cocoa en polvo sin azúcar para repostería y moles.', '/images/products/recipe/cocoa-en-polvo.webp', jsonb_build_array('/images/products/recipe/cocoa-en-polvo.webp'), 'Hershey''s', 7, true, 'lata 200 g'),
  ('Salsa Buffalo', 'salsa-buffalo', 'Salsa picante estilo buffalo para alitas clásicas.', '/images/products/recipe/salsa-buffalo.webp', jsonb_build_array('/images/products/recipe/salsa-buffalo.webp'), 'Frank''s', 7, true, 'botella 355 ml'),
  ('Queso Azul', 'queso-azul', 'Queso azul para aderezo de alitas y ensaladas.', '/images/products/recipe/queso-azul.webp', jsonb_build_array('/images/products/recipe/queso-azul.webp'), 'Local', 3, true, 'cuña 150 g'),
  ('Pan Molido', 'pan-molido', 'Pan molido fino para empanizar pollo y croquetas.', '/images/products/recipe/pan-molido.webp', jsonb_build_array('/images/products/recipe/pan-molido.webp'), 'Local', 5, false, 'bolsa 500 g'),
  ('Romero Fresco', 'romero-fresco', 'Romero fresco en rama para marinadas y asados.', '/images/products/recipe/romero-fresco.webp', jsonb_build_array('/images/products/recipe/romero-fresco.webp'), 'Local', 1, true, 'por manojo'),
  ('Tomillo Fresco', 'tomillo-fresco', 'Tomillo fresco para pollos, pescados y guisos.', '/images/products/recipe/tomillo-fresco.webp', jsonb_build_array('/images/products/recipe/tomillo-fresco.webp'), 'Local', 1, true, 'por manojo'),
  ('Papas Cambray', 'papas-cambray', 'Papas cambray gourmet para asar enteras.', '/images/products/recipe/papas-cambray.webp', jsonb_build_array('/images/products/recipe/papas-cambray.webp'), 'Local', 1, true, 'por kilo'),
  ('Miel de Abeja', 'miel-de-abeja', 'Miel de abeja 100% natural para aderezos y glaseados.', '/images/products/recipe/miel-de-abeja.webp', jsonb_build_array('/images/products/recipe/miel-de-abeja.webp'), 'Carlota', 7, true, 'frasco 500 g'),
  ('Queso Asadero', 'queso-asadero', 'Queso asadero para fundir en quesadillas y chiles rellenos.', '/images/products/recipe/queso-asadero.webp', jsonb_build_array('/images/products/recipe/queso-asadero.webp'), 'Local', 3, true, 'por kilo'),
  ('Chile Mulato', 'chile-mulato', 'Chile mulato seco para moles oscuros tradicionales.', '/images/products/recipe/chile-mulato.webp', jsonb_build_array('/images/products/recipe/chile-mulato.webp'), 'Local', 2, true, 'bolsa 150 g'),
  ('Chile Ancho', 'chile-ancho', 'Chile ancho seco de sabor dulce y terroso para adobos.', '/images/products/recipe/chile-ancho.webp', jsonb_build_array('/images/products/recipe/chile-ancho.webp'), 'Local', 2, true, 'bolsa 150 g'),
  ('Chile Pasilla', 'chile-pasilla', 'Chile pasilla seco ahumado para moles y salsas.', '/images/products/recipe/chile-pasilla.webp', jsonb_build_array('/images/products/recipe/chile-pasilla.webp'), 'Local', 2, true, 'bolsa 150 g'),
  ('Chocolate de Mesa', 'chocolate-de-mesa', 'Chocolate de mesa para mole poblano y chocolate caliente.', '/images/products/recipe/chocolate-de-mesa.webp', jsonb_build_array('/images/products/recipe/chocolate-de-mesa.webp'), 'Abuelita', 7, true, 'tableta 90 g'),
  ('Almendras', 'almendras', 'Almendras enteras sin sal para moles y repostería.', '/images/products/recipe/almendras.webp', jsonb_build_array('/images/products/recipe/almendras.webp'), 'Local', 2, true, 'bolsa 200 g'),
  ('Pasas', 'pasas', 'Pasas para moles, rellenos y picadillo tradicional.', '/images/products/recipe/pasas.webp', jsonb_build_array('/images/products/recipe/pasas.webp'), 'Local', 2, true, 'bolsa 200 g'),
  ('Maíz Cacahuazintle', 'maiz-cacahuazintle', 'Maíz cacahuazintle de grano grande para pozole.', '/images/products/recipe/maiz-cacahuazintle.webp', jsonb_build_array('/images/products/recipe/maiz-cacahuazintle.webp'), 'Local', 2, true, 'por kilo'),
  ('Pera', 'pera', 'Pera fresca para ensaladas, postres y guarniciones.', '/images/products/recipe/pera.webp', jsonb_build_array('/images/products/recipe/pera.webp'), 'Local', 1, true, 'por kilo'),
  ('Nuez de Castilla', 'nuez-de-castilla', 'Nuez de castilla para nogada y repostería.', '/images/products/recipe/nuez-de-castilla.webp', jsonb_build_array('/images/products/recipe/nuez-de-castilla.webp'), 'Local', 2, true, 'bolsa 200 g'),
  ('Queso de Cabra', 'queso-de-cabra', 'Queso de cabra fresco para ensaladas y entradas.', '/images/products/recipe/queso-de-cabra.webp', jsonb_build_array('/images/products/recipe/queso-de-cabra.webp'), 'Local', 3, true, 'por 200 g'),
  ('Granada', 'granada', 'Granada roja fresca para chiles en nogada y decoración.', '/images/products/recipe/granada.webp', jsonb_build_array('/images/products/recipe/granada.webp'), 'Local', 1, true, 'por pieza'),
  ('Masa para Tamal', 'masa-para-tamal', 'Masa de maíz preparada para tamales.', '/images/products/recipe/masa-para-tamal.webp', jsonb_build_array('/images/products/recipe/masa-para-tamal.webp'), 'Local', 5, false, 'por kilo'),
  ('Hoja de Maíz', 'hoja-de-maiz', 'Hojas de maíz secas para tamales.', '/images/products/recipe/hoja-de-maiz.webp', jsonb_build_array('/images/products/recipe/hoja-de-maiz.webp'), 'Local', 2, true, 'paquete 100 hojas'),
  ('Caldo de Pollo', 'caldo-de-pollo', 'Caldo de pollo concentrado para sopas y arroces.', '/images/products/recipe/caldo-de-pollo.webp', jsonb_build_array('/images/products/recipe/caldo-de-pollo.webp'), 'Knorr', 7, true, 'litro'),
  ('Filete de Pescado Blanco', 'filete-de-pescado-blanco', 'Filete de pescado blanco del día para ceviches y frituras.', '/images/products/recipe/filete-de-pescado-blanco.webp', jsonb_build_array('/images/products/recipe/filete-de-pescado-blanco.webp'), 'Local', 4, true, 'por kilo'),
  ('Jugo de Tomate', 'jugo-de-tomate', 'Jugo de tomate sazonado para coctelería y micheladas.', '/images/products/recipe/jugo-de-tomate.webp', jsonb_build_array('/images/products/recipe/jugo-de-tomate.webp'), 'Del Valle', 6, false, 'botella 1 L'),
  ('Salsa Picante', 'salsa-picante', 'Salsa picante mexicana para mariscos y botanas.', '/images/products/recipe/salsa-picante.webp', jsonb_build_array('/images/products/recipe/salsa-picante.webp'), 'Valentina', 7, true, 'botella 150 ml'),
  ('Sal de Grano', 'sal-de-grano', 'Sal de grano para terminar carnes asadas.', '/images/products/recipe/sal-de-grano.webp', jsonb_build_array('/images/products/recipe/sal-de-grano.webp'), 'Local', 2, true, 'por kilo'),
  ('Costillas de Cerdo', 'costillas-de-cerdo', 'Costillas de cerdo frescas para asador y BBQ.', '/images/products/recipe/costillas-de-cerdo.webp', jsonb_build_array('/images/products/recipe/costillas-de-cerdo.webp'), 'Local', 4, true, 'por kilo'),
  ('Azúcar Mascabado', 'azucar-mascabado', 'Azúcar mascabado sin refinar para rubs y adobos.', '/images/products/recipe/azucar-mascabado.webp', jsonb_build_array('/images/products/recipe/azucar-mascabado.webp'), 'Local', 2, true, 'por kilo'),
  ('Pimentón', 'pimenton', 'Pimentón español ahumado para carnes y embutidos.', '/images/products/recipe/pimenton.webp', jsonb_build_array('/images/products/recipe/pimenton.webp'), 'McCormick', 2, true, 'frasco 100 g'),
  ('Cebolla en Polvo', 'cebolla-en-polvo', 'Cebolla en polvo para sazonadores y rubs.', '/images/products/recipe/cebolla-en-polvo.webp', jsonb_build_array('/images/products/recipe/cebolla-en-polvo.webp'), 'McCormick', 2, true, 'frasco 100 g'),
  ('Suadero de Res', 'suadero-de-res', 'Suadero de res para tacos de plancha.', '/images/products/recipe/suadero-de-res.webp', jsonb_build_array('/images/products/recipe/suadero-de-res.webp'), 'Local', 4, true, 'por kilo'),
  ('Salsa Verde', 'salsa-verde', 'Salsa verde mexicana de tomate y chile serrano.', '/images/products/recipe/salsa-verde.webp', jsonb_build_array('/images/products/recipe/salsa-verde.webp'), 'La Costeña', 7, true, 'frasco 370 g'),
  ('Nutella', 'nutella', 'Crema de avellana y chocolate para crepas y hotcakes.', '/images/products/recipe/nutella.webp', jsonb_build_array('/images/products/recipe/nutella.webp'), 'Nutella', 7, true, 'frasco 350 g'),
  ('Harina para Hot Cakes', 'harina-para-hot-cakes', 'Mezcla preparada para hot cakes esponjosos.', '/images/products/recipe/harina-para-hot-cakes.webp', jsonb_build_array('/images/products/recipe/harina-para-hot-cakes.webp'), 'Hot Cakes', 5, false, 'caja 800 g'),
  ('Miel de Maple', 'miel-de-maple', 'Miel de maple pura para hotcakes, waffles y crepas.', '/images/products/recipe/miel-de-maple.webp', jsonb_build_array('/images/products/recipe/miel-de-maple.webp'), 'Aunt Jemima', 7, true, 'botella 250 ml'),
  ('Café en Grano', 'cafe-en-grano', 'Café en grano de altura para espresso y americano.', '/images/products/recipe/cafe-en-grano.webp', jsonb_build_array('/images/products/recipe/cafe-en-grano.webp'), 'Local', 6, false, 'bolsa 1 kg'),
  ('Zarzamora', 'zarzamora', 'Zarzamora fresca para smoothies, bowls y repostería.', '/images/products/recipe/zarzamora.webp', jsonb_build_array('/images/products/recipe/zarzamora.webp'), 'Driscoll''s', 1, true, 'charola 170 g'),
  ('Atún Fresco', 'atun-fresco', 'Atún fresco en lomo para poke bowls y tataki.', '/images/products/recipe/atun-fresco.webp', jsonb_build_array('/images/products/recipe/atun-fresco.webp'), 'Local', 4, true, 'por kilo'),
  ('Edamame', 'edamame', 'Vainas de soya edamame para bowls y botanas.', '/images/products/recipe/edamame.webp', jsonb_build_array('/images/products/recipe/edamame.webp'), 'Birds Eye', 1, true, 'bolsa 400 g'),
  ('Pan para Crutones', 'pan-para-crutones', 'Cubos de pan sazonado para crutones de ensalada César.', '/images/products/recipe/pan-para-crutones.webp', jsonb_build_array('/images/products/recipe/pan-para-crutones.webp'), 'Bimbo', 5, false, 'bolsa 300 g'),
  ('Quinoa', 'quinoa', 'Quinoa real blanca, alto contenido de proteína vegetal.', '/images/products/recipe/quinoa.webp', jsonb_build_array('/images/products/recipe/quinoa.webp'), 'Local', 2, true, 'bolsa 500 g'),
  ('Jitomate Cherry', 'jitomate-cherry', 'Jitomate cherry dulce para ensaladas y bowls.', '/images/products/recipe/jitomate-cherry.webp', jsonb_build_array('/images/products/recipe/jitomate-cherry.webp'), 'Local', 1, true, 'charola 250 g'),
  ('Aceituna Kalamata', 'aceituna-kalamata', 'Aceitunas kalamata griegas para ensaladas mediterráneas.', '/images/products/recipe/aceituna-kalamata.webp', jsonb_build_array('/images/products/recipe/aceituna-kalamata.webp'), 'Local', 2, true, 'frasco 300 g'),
  ('Queso Feta', 'queso-feta', 'Queso feta griego en salmuera para ensaladas frescas.', '/images/products/recipe/queso-feta.webp', jsonb_build_array('/images/products/recipe/queso-feta.webp'), 'Local', 3, true, 'por 200 g'),
  ('Tortilla Integral', 'tortilla-integral', 'Tortillas de harina integral para wraps saludables.', '/images/products/recipe/tortilla-integral.webp', jsonb_build_array('/images/products/recipe/tortilla-integral.webp'), 'Tía Rosa', 5, false, 'paquete 12 pz'),
  ('Yogur Griego', 'yogur-griego', 'Yogur griego natural sin azúcar para bowls y aderezos.', '/images/products/recipe/yogur-griego.webp', jsonb_build_array('/images/products/recipe/yogur-griego.webp'), 'Yoplait', 3, true, 'litro'),
  ('Chispas de Chocolate', 'chispas-de-chocolate', 'Chispas de chocolate semiamargo para galletas y repostería.', '/images/products/recipe/chispas-de-chocolate.webp', jsonb_build_array('/images/products/recipe/chispas-de-chocolate.webp'), 'Hershey''s', 7, true, 'bolsa 300 g'),
  ('Yemas de Huevo', 'yemas-de-huevo', 'Yemas de huevo pasteurizadas para cremas y repostería.', '/images/products/recipe/yemas-de-huevo.webp', jsonb_build_array('/images/products/recipe/yemas-de-huevo.webp'), 'San Juan', 3, true, 'litro pasteurizado'),
  ('Canela en Polvo', 'canela-en-polvo', 'Canela molida para postres, arroz con leche y repostería.', '/images/products/recipe/canela-en-polvo.webp', jsonb_build_array('/images/products/recipe/canela-en-polvo.webp'), 'McCormick', 2, true, 'frasco 100 g'),
  ('Cajeta', 'cajeta', 'Cajeta de leche de cabra estilo tradicional.', '/images/products/recipe/cajeta.webp', jsonb_build_array('/images/products/recipe/cajeta.webp'), 'Coronado', 7, true, 'frasco 350 g'),
  ('Pan Pita', 'pan-pita', 'Pan pita estilo árabe para shawarma y falafel.', '/images/products/recipe/pan-pita.webp', jsonb_build_array('/images/products/recipe/pan-pita.webp'), 'Local', 5, false, 'paquete 6 pz'),
  ('Jocoque', 'jocoque', 'Jocoque seco para aderezos y tacos árabes.', '/images/products/recipe/jocoque.webp', jsonb_build_array('/images/products/recipe/jocoque.webp'), 'Local', 3, true, 'frasco 500 g'),
  ('Eneldo Fresco', 'eneldo-fresco', 'Eneldo fresco para tzatziki y cocina griega.', '/images/products/recipe/eneldo-fresco.webp', jsonb_build_array('/images/products/recipe/eneldo-fresco.webp'), 'Local', 1, true, 'por manojo'),
  ('Tahini', 'tahini', 'Pasta de ajonjolí tahini para hummus y salsas.', '/images/products/recipe/tahini.webp', jsonb_build_array('/images/products/recipe/tahini.webp'), 'Local', 2, true, 'frasco 300 g'),
  ('Pasta Filo', 'pasta-filo', 'Hojas de pasta filo para baklava y pasteles.', '/images/products/recipe/pasta-filo.webp', jsonb_build_array('/images/products/recipe/pasta-filo.webp'), 'Local', 5, false, 'caja 500 g'),
  ('Pistache', 'pistache', 'Pistache sin sal para repostería árabe y helados.', '/images/products/recipe/pistache.webp', jsonb_build_array('/images/products/recipe/pistache.webp'), 'Local', 2, true, 'bolsa 200 g'),
  ('Harina PAN', 'harina-pan', 'Harina de maíz precocida para arepas auténticas.', '/images/products/recipe/harina-pan.webp', jsonb_build_array('/images/products/recipe/harina-pan.webp'), 'PAN', 2, true, 'paquete 1 kg'),
  ('Achiote', 'achiote', 'Semillas de achiote para dar color natural a las comidas.', '/images/products/recipe/achiote.webp', jsonb_build_array('/images/products/recipe/achiote.webp'), 'Local', 2, true, 'bolsa 50 g'),
  ('Maíz Tierno', 'maiz-tierno', 'Maíz tierno en grano para cachapas y arepas dulces.', '/images/products/recipe/maiz-tierno.webp', jsonb_build_array('/images/products/recipe/maiz-tierno.webp'), 'Del Monte', 1, true, 'lata 410 g'),
  ('Queso de Mano', 'queso-de-mano', 'Queso blanco venezolano de mano para arepas.', '/images/products/recipe/queso-de-mano.webp', jsonb_build_array('/images/products/recipe/queso-de-mano.webp'), 'Local', 3, true, 'por kilo'),
  ('Queso Blanco', 'queso-blanco', 'Queso blanco duro para rallar, estilo llanero.', '/images/products/recipe/queso-blanco.webp', jsonb_build_array('/images/products/recipe/queso-blanco.webp'), 'Local', 3, true, 'por kilo'),
  ('Frijoles Rojos', 'frijoles-rojos', 'Frijoles rojos para pabellón criollo y sopas.', '/images/products/recipe/frijoles-rojos.webp', jsonb_build_array('/images/products/recipe/frijoles-rojos.webp'), 'La Sierra', 2, true, 'bolsa 1 kg'),
  ('Chicharrón', 'chicharron', 'Chicharrón de cerdo para freír y guisos latinos.', '/images/products/recipe/chicharron.webp', jsonb_build_array('/images/products/recipe/chicharron.webp'), 'Local', 4, true, 'por kilo'),
  ('Cerveza Clara', 'cerveza-clara', 'Cerveza clara tipo lager para micheladas y servicio.', '/images/products/recipe/cerveza-clara.webp', jsonb_build_array('/images/products/recipe/cerveza-clara.webp'), 'Modelo', 6, false, 'six 355 ml'),
  ('Chile en Polvo', 'chile-en-polvo', 'Chile en polvo con limón para botanas y micheladas.', '/images/products/recipe/chile-en-polvo.webp', jsonb_build_array('/images/products/recipe/chile-en-polvo.webp'), 'Tajín', 2, true, 'frasco 150 g'),
  ('Jalapeños en Escabeche', 'jalapenos-en-escabeche', 'Jalapeños en escabeche para botanear.', '/images/products/recipe/jalapenos-en-escabeche.webp', jsonb_build_array('/images/products/recipe/jalapenos-en-escabeche.webp'), 'La Costeña', 7, true, 'lata 380 g'),
  ('Hierbabuena Fresca', 'hierbabuena-fresca', 'Hierbabuena fresca para mojitos, tés y coctelería.', '/images/products/recipe/hierbabuena-fresca.webp', jsonb_build_array('/images/products/recipe/hierbabuena-fresca.webp'), 'Local', 1, true, 'por manojo'),
  ('Tequila Blanco', 'tequila-blanco', 'Tequila blanco joven para coctelería y barra.', '/images/products/recipe/tequila-blanco.webp', jsonb_build_array('/images/products/recipe/tequila-blanco.webp'), 'José Cuervo', 6, false, 'botella 750 ml'),
  ('Licor de Naranja', 'licor-de-naranja', 'Licor de naranja triple sec para margaritas y coctelería.', '/images/products/recipe/licor-de-naranja.webp', jsonb_build_array('/images/products/recipe/licor-de-naranja.webp'), 'Controy', 6, false, 'botella 750 ml'),
  ('Ron Blanco', 'ron-blanco', 'Ron blanco para mojitos, cuba libre y coctelería.', '/images/products/recipe/ron-blanco.webp', jsonb_build_array('/images/products/recipe/ron-blanco.webp'), 'Bacardi', 6, false, 'botella 750 ml');


-- ============================================================
-- PRECIOS PARA PRODUCTOS ADICIONALES (IDs 188-311)
-- ============================================================
DO $$
DECLARE
  pid BIGINT;
  i INT := 0;
  pr NUMERIC(10,2);
  sp NUMERIC(10,2);
BEGIN

  -- Categoría 1 (IDs 188-210, 23 productos)
  FOR i IN 0..22 LOOP
    pid := 188 + i;
    pr := CASE i WHEN 0 THEN 38 WHEN 1 THEN 45 WHEN 2 THEN 32 WHEN 3 THEN 42 WHEN 4 THEN 35 WHEN 5 THEN 28 WHEN 6 THEN 35 WHEN 7 THEN 30 WHEN 8 THEN 32 WHEN 9 THEN 28 WHEN 10 THEN 38 WHEN 11 THEN 28 WHEN 12 THEN 25 WHEN 13 THEN 22 WHEN 14 THEN 35 WHEN 15 THEN 30 WHEN 16 THEN 42 WHEN 17 THEN 28 WHEN 18 THEN 32 WHEN 19 THEN 35 WHEN 20 THEN 28 WHEN 21 THEN 32 WHEN 22 THEN 30 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status) VALUES (pid, 1, pr, sp, 'in_stock');
  END LOOP;

  -- Categoría 2 (IDs 211-245, 35 productos)
  FOR i IN 0..34 LOOP
    pid := 211 + i;
    pr := CASE i WHEN 0 THEN 26 WHEN 1 THEN 32 WHEN 2 THEN 22 WHEN 3 THEN 28 WHEN 4 THEN 24 WHEN 5 THEN 28 WHEN 6 THEN 25 WHEN 7 THEN 18 WHEN 8 THEN 25 WHEN 9 THEN 26 WHEN 10 THEN 22 WHEN 11 THEN 28 WHEN 12 THEN 32 WHEN 13 THEN 42 WHEN 14 THEN 35 WHEN 15 THEN 28 WHEN 16 THEN 26 WHEN 17 THEN 28 WHEN 18 THEN 35 WHEN 19 THEN 38 WHEN 20 THEN 35 WHEN 21 THEN 32 WHEN 22 THEN 28 WHEN 23 THEN 30 WHEN 24 THEN 25 WHEN 25 THEN 22 WHEN 26 THEN 35 WHEN 27 THEN 28 WHEN 28 THEN 26 WHEN 29 THEN 32 WHEN 30 THEN 30 WHEN 31 THEN 28 WHEN 32 THEN 22 WHEN 33 THEN 28 WHEN 34 THEN 25 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status) VALUES (pid, 1, pr, sp, 'in_stock');
  END LOOP;

  -- Categoría 3 (IDs 246-262, 17 productos)
  FOR i IN 0..16 LOOP
    pid := 246 + i;
    pr := CASE i WHEN 0 THEN 52 WHEN 1 THEN 28 WHEN 2 THEN 48 WHEN 3 THEN 68 WHEN 4 THEN 65 WHEN 5 THEN 58 WHEN 6 THEN 42 WHEN 7 THEN 72 WHEN 8 THEN 68 WHEN 9 THEN 62 WHEN 10 THEN 42 WHEN 11 THEN 35 WHEN 12 THEN 48 WHEN 13 THEN 42 WHEN 14 THEN 55 WHEN 15 THEN 48 WHEN 16 THEN 32 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status) VALUES (pid, 1, pr, sp, 'in_stock');
  END LOOP;

  -- Categoría 4 (IDs 263-273, 11 productos)
  FOR i IN 0..10 LOOP
    pid := 263 + i;
    pr := CASE i WHEN 0 THEN 95 WHEN 1 THEN 88 WHEN 2 THEN 72 WHEN 3 THEN 85 WHEN 4 THEN 68 WHEN 5 THEN 95 WHEN 6 THEN 125 WHEN 7 THEN 88 WHEN 8 THEN 78 WHEN 9 THEN 85 WHEN 10 THEN 68 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status) VALUES (pid, 1, pr, sp, 'in_stock');
  END LOOP;

  -- Categoría 5 (IDs 274-284, 11 productos)
  FOR i IN 0..10 LOOP
    pid := 274 + i;
    pr := CASE i WHEN 0 THEN 42 WHEN 1 THEN 28 WHEN 2 THEN 32 WHEN 3 THEN 18 WHEN 4 THEN 36 WHEN 5 THEN 32 WHEN 6 THEN 28 WHEN 7 THEN 25 WHEN 8 THEN 28 WHEN 9 THEN 38 WHEN 10 THEN 35 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status) VALUES (pid, 1, pr, sp, 'in_stock');
  END LOOP;

  -- Categoría 6 (IDs 285-291, 7 productos)
  FOR i IN 0..6 LOOP
    pid := 285 + i;
    pr := CASE i WHEN 0 THEN 185 WHEN 1 THEN 22 WHEN 2 THEN 195 WHEN 3 THEN 285 WHEN 4 THEN 36 WHEN 5 THEN 185 WHEN 6 THEN 165 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status) VALUES (pid, 1, pr, sp, 'in_stock');
  END LOOP;

  -- Categoría 7 (IDs 292-309, 18 productos)
  FOR i IN 0..17 LOOP
    pid := 292 + i;
    pr := CASE i WHEN 0 THEN 35 WHEN 1 THEN 18 WHEN 2 THEN 65 WHEN 3 THEN 38 WHEN 4 THEN 32 WHEN 5 THEN 35 WHEN 6 THEN 25 WHEN 7 THEN 28 WHEN 8 THEN 22 WHEN 9 THEN 48 WHEN 10 THEN 28 WHEN 11 THEN 35 WHEN 12 THEN 32 WHEN 13 THEN 28 WHEN 14 THEN 42 WHEN 15 THEN 35 WHEN 16 THEN 28 WHEN 17 THEN 32 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status) VALUES (pid, 1, pr, sp, 'in_stock');
  END LOOP;

  -- Categoría 9 (IDs 310-311, 2 productos)
  FOR i IN 0..1 LOOP
    pid := 310 + i;
    pr := CASE i WHEN 0 THEN 62 WHEN 1 THEN 55 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status) VALUES (pid, 1, pr, sp, 'in_stock');
  END LOOP;

END $$;

-- ============================================================
-- COLECCIONES DE RESTAURANTE (14 giros)
-- ============================================================
INSERT INTO restaurant_collections (name, slug, description, image_url, tags, display_order) VALUES
  ('Hamburguesas y Hot Dogs', 'hamburguesas-hot-dogs',
   'Carne molida sirloin/chuck, pan brioche, queso cheddar, papas congeladas, tocino y aderezos. Proveeduría completa para burger joints y hot dog stands.',
   '/images/collections/burger.webp',
   '["hamburgueseria","burger","hotdog"]', 1),
  ('Taquerías y Antojitos', 'taquerias-antojitos',
   'Cortes para asada, pastor y suadero, tortillas, cebolla, cilantro, chiles frescos y queso asadero. Todo para taquerías y puestos de antojitos.',
   '/images/collections/taqueria.webp',
   '["taqueria","tacos","mexicana","antojitos"]', 2),
  ('Sushi y Comida Asiática', 'sushi-comida-asiatica',
   'Arroz grano corto, alga nori, salmón, atún, queso crema, panko, sriracha y salsa de soya.',
   '/images/collections/sushi.webp',
   '["sushi","japonesa","asiatica"]', 3),
  ('Pizzas y Comida Italiana', 'pizzas-comida-italiana',
   'Harina de fuerza, mozzarella, pepperoni, puré de tomate enlatado y cajas de cartón.',
   '/images/collections/pizza.webp',
   '["pizzeria","italiana","pasta"]', 4),
  ('Pollo y Alitas', 'pollo-alitas',
   'Alitas, boneless, pollo entero, salsas en garrafa (Buffalo, BBQ) y aceite por bidón.',
   '/images/collections/pollo.webp',
   '["pollo","alitas","boneless","fritura"]', 5),
  ('Comida Mexicana y Comida Corrida', 'comida-mexicana-corrida',
   'Guisados, arroz, frijol, carnes de cerdo/res, desechables térmicos KRAFT.',
   '/images/collections/fonda.webp',
   '["fonda","cocina-economica","mexicana","guisados"]', 6),
  ('Mariscos y Pescados', 'mariscos-pescados',
   'Camarón, pulpo, filete de pescado, tostadas, aguacate, salsas y limones.',
   '/images/collections/mariscos.webp',
   '["marisqueria","mariscos","pescados"]', 7),
  ('Cortes de Carne y Asaderos', 'cortes-carne-asaderos',
   'Rib eye, New York, picanha, arrachera, carbón, tortillas de harina y queso para fundir.',
   '/images/collections/cortes.webp',
   '["cortes","asador","parrilla","carne-res"]', 8),
  ('Cafeterías, Crepas y Desayunos', 'cafeterias-crepas-desayunos',
   'Café en grano, leches enteras/vegetales, jarabes, huevo, hot cakes y vasos térmicos.',
   '/images/collections/cafe.webp',
   '["cafeteria","cafe","desayunos","crepas"]', 9),
  ('Saludable, Ensaladas y Pokés', 'saludable-ensaladas-pokes',
   'Lechugas gourmet, kale, semillas, proteínas magras, aderezos y contenedores PET.',
   '/images/collections/saludable.webp',
   '["saludable","ensaladas","poke","organico"]', 10),
  ('Postres, Panadería y Helados', 'postres-panaderia-helados',
   'Harina preparada, mantequilla, chispas de chocolate, fruta congelada y bases para helado.',
   '/images/collections/postres.webp',
   '["postres","panaderia","helados","reposteria"]', 11),
  ('Comida Árabe y Griega', 'comida-arabe-griega',
   'Carne para trompo, pan pita, jocoque, tahini y especias concentradas.',
   '/images/collections/arabe.webp',
   '["arabe","griega","trompo","kebab"]', 12),
  ('Comida Venezolana y Latina', 'comida-venezolana-latina',
   'Harina PAN, plátano macho, queso costeño/paisa, yuca y papelón.',
   '/images/collections/latina.webp',
   '["venezolana","colombiana","latina","arepas"]', 13),
  ('Bebidas, Bares y Botanas', 'bebidas-bares-botanas',
   'Cervezas, refrescos, mezcladores, desechables para micheladas, botanas y frituras.',
   '/images/collections/bebidas.webp',
   '["bebidas","bar","botanas","licor"]', 14);

-- ============================================================
-- TAGS: Los productos ya se taggearon vía script Node.js.
-- Las 14 colecciones filtran por intersección de tags
-- (product.tags ∩ collection.tags) en el servidor.
-- ============================================================
-- FIN COLECCIONES
-- ============================================================