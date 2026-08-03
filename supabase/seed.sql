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
  ('Frutas y Verduras', 'frutas-verduras', 'apple'),
  ('Abarrotes', 'abarrotes', 'package'),
  ('Lácteos y Huevos', 'lacteos-huevos', 'milk'),
  ('Carnes, Aves y Pescados', 'carnes-aves-pescados', 'beef'),
  ('Panadería y Tortillería', 'panaderia-tortilleria', 'bread'),
  ('Bebidas', 'bebidas', 'cup'),
  ('Botanas y Dulces', 'botanas-dulces', 'cookie'),
  ('Limpieza para Cocina', 'limpieza-cocina', 'spray'),
  ('Congelados', 'congelados', 'snowflake');

-- ============================================================
-- TIENDAS
-- ============================================================
INSERT INTO stores (name, slug, description, logo_url, banner_url, min_order, delivery_fee, avg_delivery_time, whatsapp_number, is_active) VALUES
  ('Resurte.me', 'resurte-me',
   'Central de Abastos Digital para restaurantes. Productos frescos al mejor precio de mayoreo. Seleccionados cada madrugada en la Central, directo a tu cocina.',
   'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200&q=80',
   'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=1200&q=80',
   200.00, 29.00, '30-45 min', '+525512345678', true),
  ('Carnemart', 'carnemart',
   'Proveeduría gourmet para cocina profesional. Cortes prime, ingredientes selectos y servicio premium. La calidad que tu cocina merece.',
   'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=200&q=80',
   'https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=1200&q=80',
   300.00, 39.00, '45-60 min', '+525598765432', true);

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
INSERT INTO products (name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Manzana Roja', 'manzana-roja', 'Manzana roja de huerto local, pulpa firme y jugosa. Para repostería, ensaladas y cocina.', 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Manzana Verde', 'manzana-verde', 'Manzana verde Granny Smith. Ácida y crocante, ideal para pays, ensaladas y guarniciones.', 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=600&q=80', 'Importado', 1, true, 'por kilo'),
  ('Aguacate Hass', 'aguacate-hass', 'Aguacate Hass de Michoacán, madurez perfecta. Pulpa cremosa para guacamole de servicio.', 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&q=80', 'Michoacán', 1, true, 'por kilo'),
  ('Naranja Valencia', 'naranja-valencia', 'Naranja Valencia de Veracruz. Jugosa, dulzor y acidez balanceados. Para jugo de servicio.', 'https://images.unsplash.com/photo-1547514701-42782101795e?w=600&q=80', 'Veracruz', 1, true, 'por kilo'),
  ('Limón Agrio', 'limon-agrio', 'Limón agrio de Colima con abundante jugo. Imprescindible en toda cocina mexicana.', 'https://images.unsplash.com/photo-1587496679742-bad502958fbf?w=600&q=80', 'Colima', 1, true, 'por kilo'),
  ('Plátano Tabasco', 'platano-tabasco', 'Plátano Tabasco maduro, dulzor natural y textura cremosa. Para postres y licuados.', 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&q=80', 'Tabasco', 1, true, 'por kilo'),
  ('Plátano Macho', 'platano-macho', 'Plátano macho grande, para freír, hornear o cocer. Base de guarniciones calientes.', 'https://images.unsplash.com/photo-1603052749629-5a4a7e5fb0f2?w=600&q=80', 'Tabasco', 1, true, 'por kilo'),
  ('Fresa', 'fresa', 'Fresa de Irapuato, rojo intenso y perfume floral. Para repostería, salsas y decoración.', 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=600&q=80', 'Irapuato', 1, true, 'charola 500 g'),
  ('Papaya Maradol', 'papaya-maradol', 'Papaya Maradol, pulpa naranja y dulzor tropical. Para barra de frutas y postres.', 'https://images.unsplash.com/photo-1617114912620-65a362306488?w=600&q=80', 'Local', 1, true, 'por pieza'),
  ('Mango Ataúlfo', 'mango-ataulfo', 'Mango Ataúlfo de Chiapas, carne sin fibra y dulzor de miel. Para salsas, postres y barra.', 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&q=80', 'Chiapas', 1, true, 'por pieza'),
  ('Mango Manila', 'mango-manila', 'Mango Manila pequeño, intenso aroma y sabor. Perfecto para salsas mango-habanero.', 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=600&q=80', 'Local', 1, false, 'por kilo'),
  ('Sandía', 'sandia', 'Sandía de temporal, pulpa roja crujiente. Para barra de aguas frescas y postres fríos.', 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Melón Chino', 'melon-chino', 'Melón chino de pulpa naranja y aroma dulce. Para desayunos, barra de frutas y aguas.', 'https://images.unsplash.com/photo-1570042225831-d98fa7577f1e?w=600&q=80', 'Local', 1, true, 'por pieza'),
  ('Piña Miel', 'pina-miel', 'Piña miel madura, dulzor concentrado. Para aguas, postres, salsas agridulces y parrilla.', 'https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=600&q=80', 'Local', 1, true, 'por pieza'),
  ('Toronja', 'toronja', 'Toronja rosada, jugosa y refrescante. Para jugos de servicio, coctelería y ensaladas.', 'https://images.unsplash.com/photo-1582979512215-1103d1760c11?w=600&q=80', 'Local', 1, false, 'por kilo'),
  ('Uvas Verdes', 'uvas-verdes', 'Uvas verdes sin semilla, crujientes. Para tablas de quesos, ensaladas y decoración.', 'https://images.unsplash.com/photo-1537640538966-79f369143f8f?w=600&q=80', 'California', 1, true, 'por kilo'),
  ('Uvas Rojas', 'uvas-rojas', 'Uvas rojas sin semilla, dulzor intenso. Para mesas de postres y servicio.', 'https://images.unsplash.com/photo-1596363505729-4190a950f5d2?w=600&q=80', 'California', 1, false, 'por kilo'),
  ('Guayaba', 'guayaba', 'Guayaba fresca de huerto, aroma intenso. Para aguas frescas, ates y postres.', 'https://images.unsplash.com/photo-1601034625336-afa4b2b0d525?w=600&q=80', 'Local', 1, false, 'por kilo'),
  ('Mandarina', 'mandarina', 'Mandarina dulce, fácil de pelar. Para mesas de fruta, postres y jugos.', 'https://images.unsplash.com/photo-1580052614034-c55d20bfee3b?w=600&q=80', 'Local', 1, false, 'por kilo'),
  ('Jitomate Saladet', 'jitomate-saladet', 'Jitomate saladet de campo, pulpa carnosa. Para salsas madre, guisos y pico de gallo.', 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Jitomate Bola', 'jitomate-bola', 'Jitomate bola grande y firme. Para rebanar en hamburguesas, tortas y ensaladas.', 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Tomate Verde', 'tomate-verde', 'Tomate verde / tomatillo fresco. Base de salsa verde mexicana, hervido o asado.', 'https://images.unsplash.com/photo-1596614152436-c380364ed4f3?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Cebolla Blanca', 'cebolla-blanca', 'Cebolla blanca de bulbo firme. Base aromática de todo sofrito y guiso mexicano.', 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Cebolla Morada', 'cebolla-morada', 'Cebolla morada de sabor más suave. Para escabeches, ensaladas y guarnición.', 'https://images.unsplash.com/photo-1618512496248-a01fe7aa2b8a?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Papa Blanca', 'papa-blanca', 'Papa blanca de tierra suelta, pulpa versátil. Para puré, fritura, guisos y sopas.', 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Papa Cambray', 'papa-cambray', 'Papa cambray pequeña, piel fina. Para asar enteras, guarnición gourmet.', 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&q=80', 'Local', 1, false, 'por kilo'),
  ('Zanahoria', 'zanahoria', 'Zanahoria fresca de tierra negra, dulzor natural. Para fondos, ensaladas y guarniciones.', 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Brócoli', 'brocoli', 'Brócoli de floretes compactos y tallo firme. Al vapor, salteado o gratinado.', 'https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?w=600&q=80', 'Local', 1, true, 'por pieza'),
  ('Coliflor', 'coliflor', 'Coliflor blanca, cabeza compacta. Para capear, gratinar o como arroz bajo en carbohidratos.', 'https://images.unsplash.com/photo-1566825469059-9abfc7aa1c8c?w=600&q=80', 'Local', 1, true, 'por pieza'),
  ('Lechuga Romana', 'lechuga-romana', 'Lechuga romana de hoja crujiente. Base clásica para ensalada César de servicio.', 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=600&q=80', 'Local', 1, true, 'por pieza'),
  ('Espinaca', 'espinaca', 'Espinaca fresca de hoja verde oscura. Para cremas, ensaladas, salteados y smoothies.', 'https://images.unsplash.com/photo-1576045057995-9d6ad2b532e0?w=600&q=80', 'Local', 1, true, 'por manojo'),
  ('Cilantro', 'cilantro', 'Cilantro fresco de rama, aroma cítrico intenso. Toque final para salsas, tacos y guisos.', 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80', 'Local', 1, true, 'por manojo'),
  ('Perejil', 'perejil', 'Perejil fresco de hoja plana. Para salsas verdes, aderezos, chimichurri y decoración.', 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80', 'Local', 1, false, 'por manojo'),
  ('Epazote', 'epazote', 'Epazote fresco, hierba mexicana esencial. Para frijoles, quesadillas y caldos tradicionales.', 'https://images.unsplash.com/photo-1588516903720-8ceb4d005b1c?w=600&q=80', 'Local', 1, true, 'por manojo'),
  ('Chile Serrano', 'chile-serrano', 'Chile serrano fresco, picor medio-alto. Para salsas crudas, guisos y escabeches.', 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Chile Jalapeño', 'chile-jalapeno', 'Chile jalapeño fresco, picor medio. Para rajas, rellenos, salsas y asado.', 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Chile Poblano', 'chile-poblano', 'Chile poblano grande y carnoso, picor bajo. Para chiles rellenos, rajas con crema.', 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Ajo', 'ajo', 'Ajo fresco, cabeza firme y dientes gordos. Base aromática de todo sofrito profesional.', 'https://images.unsplash.com/photo-1540148426945-6cf51a4b14d2?w=600&q=80', 'Local', 1, true, 'por cabeza'),
  ('Pepino', 'pepino', 'Pepino fresco, piel verde oscura y crujiente. Para ensaladas, aguas y guarniciones.', 'https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Calabacita', 'calabacita', 'Calabacita italiana tierna. Para salteados, sopas, rellenos y guarnición al vapor.', 'https://images.unsplash.com/photo-1589621316382-008455b857cd?w=600&q=80', 'Local', 1, false, 'por kilo'),
  ('Chayote', 'chayote', 'Chayote verde de piel lisa y pulpa suave. Para sopas, guisos y guarniciones.', 'https://images.unsplash.com/photo-1557800636-894a64c1696f?w=600&q=80', 'Local', 1, false, 'por pieza'),
  ('Elote', 'elote', 'Elote blanco tierno de temporada. Para esquites, asado, cremas y guarniciones.', 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=600&q=80', 'Local', 1, true, 'por pieza'),
  ('Nopal', 'nopal', 'Nopal tierno sin espinas, limpio. Para ensaladas, asado, guisos y jugos verdes.', 'https://images.unsplash.com/photo-1591375796243-3d48f438c83e?w=600&q=80', 'Local', 1, true, 'por kilo'),
  ('Apio', 'apio', 'Apio fresco de tallo crujiente. Para fondos, jugos, ensaladas y botanas con dip.', 'https://images.unsplash.com/photo-1584270354949-c26b0d5b0b04?w=600&q=80', 'Local', 1, false, 'por pieza'),
  ('Betabel', 'betabel', 'Betabel fresco de raíz firme. Para jugos, ensaladas, sopas y guarniciones asadas.', 'https://images.unsplash.com/photo-1593105544559-ecb03bf76f82?w=600&q=80', 'Local', 1, false, 'por kilo'),
  ('Col Blanca', 'col-blanca', 'Col blanca de cabeza compacta. Para ensalada de col, tacos, sopas y fermentos.', 'https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=600&q=80', 'Local', 1, false, 'por pieza'),
  ('Chile Habanero', 'chile-habanero', 'Chile habanero de Yucatán, picor extremo y sabor afrutado. Para salsas explosivas.', 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=600&q=80', 'Yucatán', 1, false, 'por 100 g'),
  ('Rábano', 'rabano', 'Rábano rojo fresco, picante y crujiente. Para pozole, tacos y ensaladas.', 'https://images.unsplash.com/photo-1587132137056-bfbf0166836e?w=600&q=80', 'Local', 1, false, 'por manojo'),
  ('Hongo Portobello', 'hongo-portobello', 'Hongo Portobello grande y carnoso. Para asar, rellenar o como sustituto de carne.', 'https://images.unsplash.com/photo-1604999333679-b86d54738315?w=600&q=80', 'Local', 1, false, 'por kilo'),
  ('Champiñón', 'champinon', 'Champiñón blanco fresco, firme. Para salteados, cremas, salsas y guarniciones.', 'https://images.unsplash.com/photo-1604999333679-b86d54738315?w=600&q=80', 'Local', 1, true, 'por kilo');

-- ============================================================
-- 2. ABARROTES (cat_id 2) — 35 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Arroz Blanco 1kg', 'arroz-blanco-1kg', 'Arroz blanco de grano largo, cocción pareja. Rendimiento alto para cocina de volumen.', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&q=80', 'Verde Valle', 2, false, '1 kg'),
  ('Arroz Blanco 5kg', 'arroz-blanco-5kg', 'Arroz blanco costal de 5 kg. Ideal para cocinas de alto volumen y fondas.', 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&q=80', 'Verde Valle', 2, true, '5 kg'),
  ('Frijol Negro 1kg', 'frijol-negro-1kg', 'Frijol negro de parcela, grano parejo y cocción uniforme. Sabor terroso para frijoles de olla.', 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=600&q=80', 'Verde Valle', 2, true, '1 kg'),
  ('Frijol Negro 5kg', 'frijol-negro-5kg', 'Costal de frijol negro 5 kg. Para cocinas que sirven frijoles diario.', 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=600&q=80', 'Verde Valle', 2, true, '5 kg'),
  ('Frijol Bayo 1kg', 'frijol-bayo-1kg', 'Frijol bayo de grano suave. Cremoso al cocerse, para frijoles refritos de carta.', 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=600&q=80', 'La Costeña', 2, false, '1 kg'),
  ('Frijol Peruano 1kg', 'frijol-peruano-1kg', 'Frijol peruano amarillo claro, textura mantecosa. Favorito en cocina del norte.', 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=600&q=80', 'La Costeña', 2, false, '1 kg'),
  ('Lenteja 1kg', 'lenteja-1kg', 'Lenteja de grano mediano, cocción rápida. Para sopas y guarniciones de alto rendimiento.', 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=600&q=80', 'Verde Valle', 2, false, '1 kg'),
  ('Garbanzo 1kg', 'garbanzo-1kg', 'Garbanzo grande de buena cocción. Para caldos, potajes y hummus.', 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=600&q=80', 'Verde Valle', 2, false, '1 kg'),
  ('Aceite de Canola 1L', 'aceite-canola-1l', 'Aceite vegetal de canola, punto de humo alto y sabor neutro. Para freidora y cocina diaria.', 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&q=80', 'Capullo', 2, true, '1 litro'),
  ('Aceite de Canola 5L', 'aceite-canola-5l', 'Garrafa 5 litros de aceite de canola. Máximo rendimiento para cocinas de volumen.', 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&q=80', 'Capullo', 2, true, '5 litros'),
  ('Aceite de Maíz 1L', 'aceite-de-maiz-1l', 'Aceite de maíz 100% puro, ideal para freír. Sabor ligero, no enmascara.', 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&q=80', 'Mazola', 2, false, '1 litro'),
  ('Aceite de Oliva 1L', 'aceite-de-oliva-1l', 'Aceite de oliva extra virgen. Para aderezos, pescados, pastas y servicio gourmet.', 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&q=80', 'Carbonell', 2, false, '1 litro'),
  ('Manteca Vegetal', 'manteca-vegetal', 'Manteca vegetal Inca para freír y repostería. Estable a altas temperaturas.', 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&q=80', 'Inca', 2, false, '1 kg'),
  ('Pasta Spaghetti 500g', 'pasta-spaghetti-500g', 'Pasta spaghetti de sémola, cuerpo firme al dente. No se sobrecocina.', 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=600&q=80', 'Barilla', 2, false, '500 g'),
  ('Pasta Codito 500g', 'pasta-codito-500g', 'Pasta codito / elbow. Para sopas aguadas y ensaladas frías de pasta.', 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=600&q=80', 'La Moderna', 2, false, '500 g'),
  ('Pasta Fideo 500g', 'pasta-fideo-500g', 'Fideo delgado para sopa aguada o seca. Base de la clásica sopa de fideo mexicana.', 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=600&q=80', 'La Moderna', 2, true, '500 g'),
  ('Harina de Maíz 1kg', 'harina-de-maiz-1kg', 'Harina de maíz nixtamalizado Maseca. Para tortillas, tamales, sopes y gorditas.', 'https://images.unsplash.com/photo-1585418847778-db6bd70c6997?w=600&q=80', 'Maseca', 2, true, '1 kg'),
  ('Harina de Trigo 1kg', 'harina-de-trigo-1kg', 'Harina de trigo todo uso. Para repostería, capeados, salsas madre y panadería.', 'https://images.unsplash.com/photo-1585418847778-db6bd70c6997?w=600&q=80', 'Selecta', 2, false, '1 kg'),
  ('Azúcar Estándar 1kg', 'azucar-estandar-1kg', 'Azúcar refinada estándar, disolución rápida. Para repostería, bebidas y salsas.', 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?w=600&q=80', 'Zulka', 2, false, '1 kg'),
  ('Azúcar Glass 500g', 'azucar-glass-500g', 'Azúcar glass impalpable para repostería fina, glaseados y decoración.', 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?w=600&q=80', 'Zulka', 2, false, '500 g'),
  ('Sal de Mar Fina 1kg', 'sal-de-mar-fina-1kg', 'Sal de mar refinada, grano fino. El sazón base de toda cocina.', 'https://images.unsplash.com/photo-1626196794642-39a17c7e5188?w=600&q=80', 'Sales del Golfo', 2, false, '1 kg'),
  ('Sal Gruesa 1kg', 'sal-gruesa-1kg', 'Sal de mar en grano grueso. Para carnes asadas, pescados a la sal y cocciones lentas.', 'https://images.unsplash.com/photo-1626196794642-39a17c7e5188?w=600&q=80', 'Sales del Golfo', 2, false, '1 kg'),
  ('Pimienta Negra Molida 100g', 'pimienta-negra-molida-100g', 'Pimienta negra molida fresca. Para sazonar carnes, sopas y salsas.', 'https://images.unsplash.com/photo-1615484477201-9f4956b1186a?w=600&q=80', 'McCormick', 2, false, '100 g'),
  ('Comino Molido 100g', 'comino-molido-100g', 'Comino molido puro, aroma intenso. Especia clave en cocina mexicana y tex-mex.', 'https://images.unsplash.com/photo-1615484477201-9f4956b1186a?w=600&q=80', 'McCormick', 2, false, '100 g'),
  ('Orégano Molido 100g', 'oregano-molido-100g', 'Orégano mexicano molido. Para pozole, birria, menudos y caldos tradicionales.', 'https://images.unsplash.com/photo-1615484477201-9f4956b1186a?w=600&q=80', 'McCormick', 2, false, '100 g'),
  ('Salsa Valentina 370ml', 'salsa-valentina-370ml', 'Salsa picante clásica mexicana. Para botanas, frutas, mariscos y micheladas.', 'https://images.unsplash.com/photo-1583454158998-7de9e1d13690?w=600&q=80', 'Valentina', 2, true, '370 ml'),
  ('Salsa Maggi 200ml', 'salsa-maggi-200ml', 'Salsa sazonadora líquida Maggi. Umami instantáneo para caldos, carnes y salsas.', 'https://images.unsplash.com/photo-1583454158998-7de9e1d13690?w=600&q=80', 'Maggi', 2, true, '200 ml'),
  ('Salsa de Soya 500ml', 'salsa-de-soya-500ml', 'Salsa de soya fermentada. Para marinados, salteados orientales y salsas fusión.', 'https://images.unsplash.com/photo-1583454158998-7de9e1d13690?w=600&q=80', 'Kikkoman', 2, false, '500 ml'),
  ('Salsa Inglesa 250ml', 'salsa-inglesa-250ml', 'Salsa inglesa / Worcestershire para micheladas, clamatos, carnes y salsas.', 'https://images.unsplash.com/photo-1583454158998-7de9e1d13690?w=600&q=80', 'Crosse & Blackwell', 2, false, '250 ml'),
  ('Catsup 1kg', 'catsup-1kg', 'Catsup de jitomate en sobre de 1 kg. Para hamburguesas, hot dogs y papas.', 'https://images.unsplash.com/photo-1583454158998-7de9e1d13690?w=600&q=80', 'Heinz', 2, false, '1 kg'),
  ('Mayonesa 1kg', 'mayonesa-1kg', 'Mayonesa con huevo en formato de 1 kg. Para salsas, aderezos y servicio.', 'https://images.unsplash.com/photo-1583454158998-7de9e1d13690?w=600&q=80', 'McCormick', 2, false, '1 kg'),
  ('Mostaza 400g', 'mostaza-400g', 'Mostaza amarilla clásica. Para hot dogs, sándwiches, aderezos y marinados.', 'https://images.unsplash.com/photo-1583454158998-7de9e1d13690?w=600&q=80', 'French', 2, false, '400 g'),
  ('Consomé de Pollo 1kg', 'consome-de-pollo-1kg', 'Consomé de pollo en polvo, bote 1 kg. Base rápida para caldos, arroces y sopas.', 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80', 'Knorr', 2, true, '1 kg'),
  ('Consomé de Res 1kg', 'consome-de-res-1kg', 'Consomé de res en polvo, bote 1 kg. Para birria, caldos de res y guisados.', 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80', 'Knorr', 2, false, '1 kg'),
  ('Vinagre Blanco 1L', 'vinagre-blanco-1l', 'Vinagre blanco destilado. Para escabeches, salsas, conservas y limpieza.', 'https://images.unsplash.com/photo-1583454158998-7de9e1d13690?w=600&q=80', 'Clemente Jacques', 2, false, '1 litro'),
  ('Vinagre de Manzana 1L', 'vinagre-de-manzana-1l', 'Vinagre de manzana orgánico. Para aderezos, marinados y vinagretas.', 'https://images.unsplash.com/photo-1583454158998-7de9e1d13690?w=600&q=80', 'Clemente Jacques', 2, false, '1 litro'),
  ('Mole Doña María 500g', 'mole-dona-maria-500g', 'Pasta de mole poblano lista para diluir. Base para mole de servicio en restaurante.', 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80', 'Doña María', 2, true, '500 g'),
  ('Maicena 500g', 'maicena-500g', 'Fécula de maíz para espesar salsas, atoles y postres. Rendimiento profesional.', 'https://images.unsplash.com/photo-1585418847778-db6bd70c6997?w=600&q=80', 'Maizena', 2, false, '500 g');

-- ============================================================
-- 3. LÁCTEOS Y HUEVOS (cat_id 3) — 16 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Leche Entera Lala 1L', 'leche-entera-lala-1l', 'Leche entera pasteurizada. Para salsas bechamel, cremas, postres y servicio de mesa.', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600&q=80', 'Lala', 3, false, '1 litro'),
  ('Leche Descremada 1L', 'leche-descremada-1l', 'Leche semidescremada, menos grasa. Para smoothies, licuados y cocina ligera.', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600&q=80', 'Lala', 3, false, '1 litro'),
  ('Leche Evaporada 360ml', 'leche-evaporada-360ml', 'Leche evaporada Carnation. Para cremas, salsas y postres clásicos mexicanos.', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600&q=80', 'Carnation', 3, false, '360 ml'),
  ('Media Crema 240ml', 'media-crema-240ml', 'Media crema Nestlé. Para salsas cremosas, enchiladas y pastas.', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600&q=80', 'Nestlé', 3, false, '240 ml'),
  ('Leche Condensada 370ml', 'leche-condensada-370ml', 'Leche condensada azucarada La Lechera. Para flanes, pays y postres fríos.', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600&q=80', 'La Lechera', 3, false, '370 ml'),
  ('Huevo Blanco 18pz', 'huevo-blanco-18pz', 'Huevo blanco de gallina de granja, yema naranja. Para cocina caliente y repostería.', 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=600&q=80', 'San Juan', 3, false, '18 piezas'),
  ('Huevo Blanco Caja 30pz', 'huevo-blanco-caja-30pz', 'Caja de 30 huevos blancos. Para cocinas con alto consumo diario.', 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=600&q=80', 'San Juan', 3, true, '30 piezas'),
  ('Huevo Rojo 18pz', 'huevo-rojo-18pz', 'Huevo rojo de gallina criolla, yema más intensa. Favorito en cocina tradicional.', 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=600&q=80', 'Local', 3, false, '18 piezas'),
  ('Queso Oaxaca 400g', 'queso-oaxaca-400g', 'Queso Oaxaca artesanal, hebra larga y sabor lácteo limpio. Fundido perfecto para quesadillas.', 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=600&q=80', 'Local', 3, true, '400 g'),
  ('Queso Fresco 500g', 'queso-fresco-500g', 'Queso fresco de vaca, textura granular y sabor lácteo suave. Para enchiladas, frijoles y ensaladas.', 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=600&q=80', 'Local', 3, true, '500 g'),
  ('Queso Panela 400g', 'queso-panela-400g', 'Queso panela suave, no se derrite. Para asar a la plancha, ensaladas y botanas.', 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=600&q=80', 'Local', 3, true, '400 g'),
  ('Queso Manchego 400g', 'queso-manchego-400g', 'Queso tipo manchego semicurado. Para sándwiches gourmet, tablas y gratinados.', 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=600&q=80', 'Covadonga', 3, false, '400 g'),
  ('Queso Crema 200g', 'queso-crema-200g', 'Queso crema Philadelphia. Para cheesecakes, dips, salsas y bagels.', 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=600&q=80', 'Philadelphia', 3, false, '200 g'),
  ('Yogurt Natural 1L', 'yogurt-natural-1l', 'Yogurt natural sin azúcar. Para aderezos, marinados, smoothies y salsas frías.', 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&q=80', 'Yoplait', 3, false, '1 litro'),
  ('Crema Ácida 1L', 'crema-acida-1l', 'Crema ácida espesa, sabor lácteo limpio. Para enchiladas, chilaquiles, cremas y dips.', 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=600&q=80', 'Lala', 3, false, '1 litro'),
  ('Mantequilla sin Sal 200g', 'mantequilla-sin-sal-200g', 'Mantequilla 100% leche de vaca, sin sal. Para repostería, salsas y cocina fina.', 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=600&q=80', 'Gloria', 3, false, '200 g');

-- ============================================================
-- 4. CARNES, AVES Y PESCADOS (cat_id 4) — 30 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Pechuga de Pollo', 'pechuga-pollo', 'Pechuga de pollo fresca sin piel. Jugosa y magra, para plancha, empanizado o relleno.', 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=600&q=80', 'Bachoco', 4, false, 'por kilo'),
  ('Milanesa de Pollo', 'milanesa-de-pollo', 'Milanesa de pechuga aplanada. Lista para empanizar, freír o asar en pocos minutos.', 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=600&q=80', 'Bachoco', 4, false, 'por kilo'),
  ('Pierna y Muslo de Pollo', 'pierna-muslo-pollo', 'Pierna con muslo de pollo fresco. Jugosa y sabrosa, para horno, asador o guisos.', 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=600&q=80', 'Bachoco', 4, true, 'por kilo'),
  ('Alitas de Pollo', 'alitas-de-pollo', 'Alitas de pollo frescas, partidas. Para alitas fritas, asadas o en salsa BBQ.', 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=600&q=80', 'Bachoco', 4, false, 'por kilo'),
  ('Pollo Entero', 'pollo-entero', 'Pollo entero fresco sin menudencias. Para rostizado, caldos y cocina de volumen.', 'https://images.unsplash.com/photo-1598515213692-5f252f75d78b?w=600&q=80', 'Bachoco', 4, true, 'por pieza'),
  ('Bistec de Res', 'bistec-de-res', 'Bistec de res seleccionado, marmoleo parejo y sabor profundo. Para asar o plancha.', 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=600&q=80', 'SuKarne', 4, false, 'por kilo'),
  ('Milanesa de Res', 'milanesa-de-res', 'Milanesa de res aplanada, corte delgado y parejo. Lista para empanizar o asar rápido.', 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=600&q=80', 'SuKarne', 4, true, 'por kilo'),
  ('Carne Molida 80/20', 'carne-molida-80-20', 'Carne molida de res 80% magra. Textura uniforme para hamburguesas, albóndigas y rellenos.', 'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=600&q=80', 'SuKarne', 4, true, 'por kilo'),
  ('Diezmillo de Res', 'diezmillo-de-res', 'Diezmillo para cocción lenta. Perfecto para birria, caldos, deshebrada y barbacoa.', 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=600&q=80', 'SuKarne', 4, true, 'por kilo'),
  ('Falda de Res', 'falda-de-res', 'Falda de res para cocción prolongada. Ideal para caldos de res, cocido y guisos.', 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=600&q=80', 'SuKarne', 4, false, 'por kilo'),
  ('Costilla de Res', 'costilla-de-res', 'Costilla de res en tira, marmoleo generoso. Para asar, hornear o guisar.', 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=600&q=80', 'SuKarne', 4, false, 'por kilo'),
  ('Arrachera', 'arrachera', 'Arrachera marinada de res. Suave, jugosa y lista para asador. Corte premium para taquería.', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80', 'SuKarne', 4, true, 'por kilo'),
  ('Ribeye', 'ribeye', 'Corte Ribeye de res con marmoleo superior. Para parrilla de alto nivel y servicio premium.', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80', 'SuKarne', 4, false, 'por kilo'),
  ('T-Bone', 't-bone', 'Corte T-Bone de res con hueso, dos cortes en uno. Espectacular a la parrilla.', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80', 'SuKarne', 4, false, 'por kilo'),
  ('Chuleta de Cerdo', 'chuleta-de-cerdo', 'Chuleta de cerdo ahumada de corte parejo. Para asar, freír o guisar.', 'https://images.unsplash.com/photo-1432139509613-5c4255a1d179?w=600&q=80', 'Kowi', 4, true, 'por kilo'),
  ('Lomo de Cerdo', 'lomo-de-cerdo', 'Lomo de cerdo magro, corte entero. Para hornear, rebanar y servicio en frío.', 'https://images.unsplash.com/photo-1432139509613-5c4255a1d179?w=600&q=80', 'Kowi', 4, false, 'por kilo'),
  ('Costilla de Cerdo', 'costilla-de-cerdo', 'Costilla de cerdo baby back. Para asar con BBQ, hornear o cocción lenta.', 'https://images.unsplash.com/photo-1432139509613-5c4255a1d179?w=600&q=80', 'Kowi', 4, false, 'por kilo'),
  ('Tocino', 'tocino', 'Tocino ahumado en rebanadas delgadas. Crujiente perfecto para desayunos, burgers y wraps.', 'https://images.unsplash.com/photo-1529921879210-78ba6e06747c?w=600&q=80', 'FUD', 4, false, 'paquete 250 g'),
  ('Jamón de Pierna', 'jamon-de-pierna', 'Jamón de pierna de cerdo rebanado. Para sándwiches, tortas, croquetas y ensaladas.', 'https://images.unsplash.com/photo-1529921879210-78ba6e06747c?w=600&q=80', 'FUD', 4, false, 'paquete 250 g'),
  ('Chorizo', 'chorizo', 'Chorizo mexicano de cerdo, especiado y listo para freír. Para papas, tacos, huevo y frijoles.', 'https://images.unsplash.com/photo-1529921879210-78ba6e06747c?w=600&q=80', 'Local', 4, true, 'por kilo'),
  ('Longaniza', 'longaniza', 'Longaniza fresca estilo rancho. Para asar entera o desmenuzar en guisos y tacos.', 'https://images.unsplash.com/photo-1529921879210-78ba6e06747c?w=600&q=80', 'Local', 4, false, 'por kilo'),
  ('Filete de Tilapia', 'filete-de-tilapia', 'Filete de tilapia fresco de agua dulce, carne blanca firme. Para empanizar, asar o al mojo.', 'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=600&q=80', 'Local', 4, false, 'por kilo'),
  ('Filete de Basa', 'filete-de-basa', 'Filete de basa blanco, textura suave y sabor neutro. Para capear, asar o cocinar al vapor.', 'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=600&q=80', 'Importado', 4, false, 'por kilo'),
  ('Camarón Pacotilla', 'camaron-pacotilla', 'Camarón pacotilla del Pacífico, pelado y crudo. Tamaño mediano para cocteles, tacos y al mojo.', 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=600&q=80', 'Del Pacífico', 4, false, 'por kilo'),
  ('Camarón U12-U15', 'camaron-u12-u15', 'Camarón jumbo U12-U15, tamaño extra grande. Para platillos premium: al ajillo, empanizado.', 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=600&q=80', 'Del Pacífico', 4, false, 'por kilo'),
  ('Pulpo', 'pulpo', 'Pulpo fresco pre-cocido. Para ceviches, a las brasas, al ajillo o en su tinta.', 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=600&q=80', 'Del Pacífico', 4, false, 'por kilo'),
  ('Mojarra Entera', 'mojarra-entera', 'Mojarra fresca entera, eviscerada. Para freír entera, al mojo de ajo o a la talla.', 'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=600&q=80', 'Local', 4, true, 'por pieza'),
  ('Huachinango Entero', 'huachinango-entero', 'Huachinango del Golfo entero, eviscerado. El pescado más noble de la cocina mexicana: zarandeado, frito, al horno.', 'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=600&q=80', 'Del Golfo', 4, false, 'por kilo'),
  ('Camarón Seco', 'camaron-seco', 'Camarón seco pequeño para caldos, sopa de camarón, tortitas y salsas tradicionales.', 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=600&q=80', 'Local', 4, false, 'por 100 g'),
  ('Salmón', 'salmon', 'Filete de salmón del Atlántico, color naranja intenso y grasa marmoleada. Para sushi, asado o curado.', 'https://images.unsplash.com/photo-1599084993091-1cb5c0721cc6?w=600&q=80', 'Importado', 4, false, 'por kilo');

-- ============================================================
-- 5. PANADERÍA Y TORTILLERÍA (cat_id 5) — 10 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Pan Bimbo Blanco', 'pan-bimbo-blanco', 'Pan de caja blanco de miga suave, estructura firme. Para sándwiches, tortas y tostadas francesas.', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=80', 'Bimbo', 5, false, '680 g'),
  ('Pan Integral', 'pan-integral', 'Pan de caja integral con fibra. Para sándwiches saludables y tostadas.', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=80', 'Bimbo', 5, false, '680 g'),
  ('Pan para Hot Dog', 'pan-hot-dog', 'Pan para hot dog suave, corte lateral. Para hot dogs, dogos y salchichas.', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=80', 'Bimbo', 5, false, 'paquete 8 pz'),
  ('Pan para Hamburguesa', 'pan-hamburguesa', 'Pan para hamburguesa con ajonjolí. Suave, esponjoso y dorado.', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=80', 'Bimbo', 5, false, 'paquete 8 pz'),
  ('Tortillas de Maíz', 'tortillas-maiz', 'Tortillas de maíz nixtamalizado, hechas al día. Aroma de molino, sabor auténtico.', 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80', 'Local', 5, true, 'paquete 1 kg'),
  ('Tortillas de Harina', 'tortillas-de-harina', 'Tortillas de harina de trigo, tamaño regular. Para burritos, wraps y quesadillas.', 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80', 'Tía Rosa', 5, true, 'paquete 12 pz'),
  ('Tostadas', 'tostadas', 'Tostadas de maíz crujientes. Para tostadas de pollo, pata, ceviche y guacamole.', 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80', 'Local', 5, true, 'paquete 20 pz'),
  ('Bolillo', 'bolillo', 'Bolillo recién horneado, corteza dorada y miga suave. Para tortas, molletes y acompañamiento.', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=80', 'Local', 5, true, 'por pieza'),
  ('Telera', 'telera', 'Telera suave para tortas estilo mexicano. La base de la torta de la barda, cubana o ahogada.', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=80', 'Local', 5, true, 'por pieza'),
  ('Pan de Ajo', 'pan-de-ajo', 'Pan de ajo con mantequilla y perejil listo para hornear. Guarnición clásica para pastas y carnes.', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&q=80', 'Bimbo', 5, false, 'paquete 2 pz');

-- ============================================================
-- 6. BEBIDAS (cat_id 6) — 15 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Coca-Cola 2.5L', 'coca-cola-25l', 'Refresco Coca-Cola botella 2.5L. La más vendida para servicio en restaurante.', 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&q=80', 'Coca-Cola', 6, false, '2.5 litros'),
  ('Coca-Cola Light 2.5L', 'coca-cola-light-25l', 'Coca-Cola sin azúcar 2.5L. Opción ligera para el comensal que cuida calorías.', 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&q=80', 'Coca-Cola', 6, false, '2.5 litros'),
  ('Sprite 2L', 'sprite-2l', 'Refresco Sprite lima-limón. Refrescante y versátil.', 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&q=80', 'Coca-Cola', 6, false, '2 litros'),
  ('Fanta Naranja 2L', 'fanta-naranja-2l', 'Refresco Fanta sabor naranja. Favorito para comidas informales.', 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&q=80', 'Coca-Cola', 6, false, '2 litros'),
  ('Sidral Mundet 2L', 'sidral-mundet-2l', 'Refresco de manzana Sidral Mundet. El acompañante clásico de la comida mexicana.', 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&q=80', 'Mundet', 6, false, '2 litros'),
  ('Agua Bonafont 1.5L', 'agua-bonafont-15l', 'Agua purificada Bonafont, mineralización ligera. Para servicio de mesa y cocina.', 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=600&q=80', 'Bonafont', 6, false, '1.5 litros'),
  ('Agua Mineral 1.5L', 'agua-mineral-15l', 'Agua mineral con gas Peñafiel. Para bebidas preparadas y servicio.', 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=600&q=80', 'Peñafiel', 6, false, '1.5 litros'),
  ('Agua Mineral Saborizada 1.5L', 'agua-mineral-saborizada-15l', 'Peñafiel sabor limón o naranja. Sin azúcar, refrescante y ligera.', 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=600&q=80', 'Peñafiel', 6, false, '1.5 litros'),
  ('Jugo Jumex 1L', 'jugo-jumex-1l', 'Jugo o néctar de frutas Jumex. Para barra de jugos, smoothies y cocina.', 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&q=80', 'Jumex', 6, false, '1 litro'),
  ('Concentrado Jamaica 1L', 'concentrado-jamaica-1l', 'Concentrado de flor de jamaica para aguas frescas. Rinde hasta 10 litros.', 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&q=80', 'Local', 6, true, '1 litro'),
  ('Concentrado Horchata 1L', 'concentrado-horchata-1l', 'Concentrado de horchata de arroz. Rinde hasta 10 litros. Sabor tradicional.', 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&q=80', 'Local', 6, true, '1 litro'),
  ('Cerveza Corona 355ml', 'cerveza-corona-355ml', 'Cerveza clara Corona Extra. La cerveza mexicana más reconocida del mundo.', 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&q=80', 'Corona', 6, false, '355 ml'),
  ('Cerveza Modelo Especial 355ml', 'cerveza-modelo-355ml', 'Cerveza tipo Pilsner Modelo Especial. Sabor balanceado, la más vendida en México.', 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&q=80', 'Modelo', 6, false, '355 ml'),
  ('Cerveza Victoria 355ml', 'cerveza-victoria-355ml', 'Cerveza tipo Vienna Victoria, maltosa y acaramelada. Maridaje perfecto con comida mexicana.', 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&q=80', 'Victoria', 6, false, '355 ml'),
  ('Cerveza Pacífico 355ml', 'cerveza-pacifico-355ml', 'Cerveza clara tipo Pilsner Pacífico. Refrescante, estilo costa para mariscos.', 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&q=80', 'Pacífico', 6, false, '355 ml');

-- ============================================================
-- 7. BOTANAS Y DULCES (cat_id 7) — 6 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Sabritas Clásicas 170g', 'sabritas-clasicas-170g', 'Papas fritas saladas clásicas. El snack mexicano por excelencia.', 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&q=80', 'Sabritas', 7, false, '170 g'),
  ('Totopos 200g', 'totopos-200g', 'Totopos de maíz para nachos, chilaquiles y botana con guacamole.', 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&q=80', 'Local', 7, true, '200 g'),
  ('Cacahuate Salado 200g', 'cacahuate-salado-200g', 'Cacahuate tostado y salado. Para botana de barra y servicio de mesa.', 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&q=80', 'Local', 7, false, '200 g'),
  ('Galletas Marías 200g', 'galletas-marias-200g', 'Galletas Marías clásicas Gamesa. Para postres, pay de queso y botana.', 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&q=80', 'Gamesa', 7, false, '200 g'),
  ('Galletas Saladas 200g', 'galletas-saladas-200g', 'Galletas saladas tipo soda. Para botana, dips y cocina (empanizado, bases).', 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&q=80', 'Gamesa', 7, false, '200 g'),
  ('Chocolate Abuelita', 'chocolate-abuelita', 'Chocolate de mesa Abuelita en tableta. Para chocolate caliente, mole y postres tradicionales.', 'https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=600&q=80', 'Abuelita', 7, true, 'tableta 90 g');

-- ============================================================
-- 8. LIMPIEZA PARA COCINA (cat_id 8) — 14 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Cloro 1L', 'cloro-1l', 'Cloro blanqueador concentrado Cloralex. Desinfección profunda para cocinas.', 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=600&q=80', 'Cloralex', 8, false, '1 litro'),
  ('Cloro 5L', 'cloro-5l', 'Garrafa de cloro 5 litros. Para cocinas de alto volumen con limpieza constante.', 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=600&q=80', 'Cloralex', 8, true, '5 litros'),
  ('Jabón Zote 400g', 'jabon-zote-400g', 'Jabón de lavandería Zote en barra. Poder desengrasante para utensilios y trapos.', 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=600&q=80', 'Zote', 8, true, '400 g'),
  ('Detergente Líquido 1L', 'detergente-liquido-1l', 'Detergente líquido para ropa de cocina. Limpia mandiles, trapos y uniformes.', 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?w=600&q=80', 'Foca', 8, false, '1 litro'),
  ('Detergente en Polvo 1kg', 'detergente-en-polvo-1kg', 'Detergente en polvo para lavadora. Limpieza profunda de textiles de cocina.', 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?w=600&q=80', 'Roma', 8, false, '1 kg'),
  ('Desengrasante 1L', 'desengrasante-1l', 'Desengrasante concentrado para campanas, estufas, azulejos y superficies de acero.', 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=600&q=80', 'Pinol', 8, false, '1 litro'),
  ('Limpiador Multiusos 500ml', 'limpiador-multiusos-500ml', 'Limpiador desinfectante con aroma pino. Superficies impecables en un paso.', 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=600&q=80', 'Pinol', 8, false, '500 ml'),
  ('Limpiavidrios 500ml', 'limpiavidrios-500ml', 'Limpiador de vidrios sin rayas. Para vitrinas, espejos y ventanas de restaurante.', 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=600&q=80', 'Windex', 8, false, '500 ml'),
  ('Jabón Lavaplatos 750ml', 'jabon-lavaplatos-750ml', 'Jabón líquido lavaplatos concentrado. Desengrasa y rinde más lavadas por gota.', 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=600&q=80', 'Axion', 8, true, '750 ml'),
  ('Fibras para Trastes 3pz', 'fibras-para-trastes-3pz', 'Fibras verdes multiusos. Para lavar ollas, sartenes y utensilios.', 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=600&q=80', 'Scotch-Brite', 8, true, '3 piezas'),
  ('Bolsas de Basura 50pz', 'bolsas-de-basura-50pz', 'Bolsas de basura negras tamaño estándar. Resistentes, no se rompen.', 'https://images.unsplash.com/photo-1605600659908-0a71926b0e72?w=600&q=80', 'Local', 8, false, 'paquete 50 pz'),
  ('Servilletas 100pz', 'servilletas-100pz', 'Servilletas de papel blanco. Para servicio de mesa, desechables y económicas.', 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=600&q=80', 'Petalo', 8, false, 'paquete 100 pz'),
  ('Papel de Cocina 2pz', 'papel-de-cocina-2pz', 'Rollo de papel absorbente para cocina. Para limpieza rápida y secado.', 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=600&q=80', 'Petalo', 8, false, '2 rollos'),
  ('Guantes de Látex Caja 100pz', 'guantes-de-latex-100pz', 'Guantes desechables de látex para manipulación de alimentos. Higiene profesional.', 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=600&q=80', 'Local', 8, true, 'caja 100 pz');

-- ============================================================
-- 9. CONGELADOS (cat_id 9) — 8 productos
-- ============================================================
INSERT INTO products (name, slug, description, image_url, brand, category_id, show_in_whatsapp, unit) VALUES
  ('Verduras Congeladas 500g', 'verduras-congeladas-500g', 'Mix de verduras: zanahoria, chícharo, elote y ejote. Listas en minutos.', 'https://images.unsplash.com/photo-1587132137056-bfbf0166836e?w=600&q=80', 'Birds Eye', 9, false, '500 g'),
  ('Papas a la Francesa 1kg', 'papas-a-la-francesa-1kg', 'Papas pre-fritas congeladas. Para freidora, horno o air fryer.', 'https://images.unsplash.com/photo-1587132137056-bfbf0166836e?w=600&q=80', 'McCain', 9, false, '1 kg'),
  ('Helado Vainilla 1L', 'helado-vainilla-1l', 'Helado cremoso de vainilla. Para postres, batidos y flotantes.', 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=600&q=80', 'Holanda', 9, false, '1 litro'),
  ('Paletas de Hielo 12pz', 'paletas-de-hielo-12pz', 'Paletas de hielo surtidas (fresa, uva, limón). Refrescantes para servicio y postre.', 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=600&q=80', 'Holanda', 9, false, '12 piezas'),
  ('Filete de Tilapia Congelado 1kg', 'filete-tilapia-congelado-1kg', 'Filete de tilapia IQF congelado individualmente. Descongela por pieza.', 'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=600&q=80', 'Importado', 9, false, '1 kg'),
  ('Camarón Congelado 1kg', 'camaron-congelado-1kg', 'Camarón mediano IQF congelado. Listo para descongelar y cocinar.', 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=600&q=80', 'Importado', 9, false, '1 kg'),
  ('Nuggets de Pollo 1kg', 'nuggets-de-pollo-1kg', 'Nuggets de pechuga de pollo empanizados. Listos para freír u hornear.', 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=600&q=80', 'Bachoco', 9, false, '1 kg'),
  ('Deditos de Pescado 1kg', 'deditos-de-pescado-1kg', 'Deditos de pescado empanizados. Para freír u hornear. Rinden para menú infantil.', 'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=600&q=80', 'Del Pacífico', 9, false, '1 kg');

-- ============================================================
-- ============================================================
-- PRECIOS POR TIENDA (product_stores)
-- ============================================================
-- Resurte.me (store_id 1): Precios de mayoreo / central de abastos
-- Carnemart  (store_id 2): Precios premium +20-40% sobre Resurte.me
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

    -- Carnemart
    pr := CASE pid WHEN 1 THEN 49 WHEN 2 THEN 58 WHEN 3 THEN 78 WHEN 4 THEN 36 WHEN 5 THEN 42 WHEN 6 THEN 26 WHEN 7 THEN 29 WHEN 8 THEN 62 WHEN 9 THEN 49 WHEN 10 THEN 32 WHEN 11 THEN 28 WHEN 12 THEN 18 WHEN 13 THEN 45 WHEN 14 THEN 42 WHEN 15 THEN 36 WHEN 16 THEN 75 WHEN 17 THEN 84 WHEN 18 THEN 45 WHEN 19 THEN 39 WHEN 20 THEN 31 WHEN 21 THEN 34 WHEN 22 THEN 36 WHEN 23 THEN 26 WHEN 24 THEN 32 WHEN 25 THEN 28 WHEN 26 THEN 36 WHEN 27 THEN 21 WHEN 28 THEN 32 WHEN 29 THEN 36 WHEN 30 THEN 34 WHEN 31 THEN 23 WHEN 32 THEN 10 WHEN 33 THEN 13 WHEN 34 THEN 16 WHEN 35 THEN 32 WHEN 36 THEN 28 WHEN 37 THEN 36 WHEN 38 THEN 20 WHEN 39 THEN 16 WHEN 40 THEN 23 WHEN 41 THEN 28 WHEN 42 THEN 10 WHEN 43 THEN 42 WHEN 44 THEN 36 WHEN 45 THEN 28 WHEN 46 THEN 58 WHEN 47 THEN 20 WHEN 48 THEN 72 WHEN 49 THEN 110 WHEN 50 THEN 75 END;
    sp := CASE pid WHEN 1 THEN 42 WHEN 5 THEN 36 WHEN 20 THEN 26 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 2, pr, sp, 'in_stock');
  END LOOP;

  -- Abarrotes (IDs 51-88, 38 productos)
  FOR pid IN 51..88 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 51 THEN 26 WHEN 52 THEN 105 WHEN 53 THEN 35 WHEN 54 THEN 155 WHEN 55 THEN 38 WHEN 56 THEN 42 WHEN 57 THEN 28 WHEN 58 THEN 32 WHEN 59 THEN 40 WHEN 60 THEN 185 WHEN 61 THEN 52 WHEN 62 THEN 120 WHEN 63 THEN 45 WHEN 64 THEN 16 WHEN 65 THEN 14 WHEN 66 THEN 14 WHEN 67 THEN 19 WHEN 68 THEN 24 WHEN 69 THEN 24 WHEN 70 THEN 36 WHEN 71 THEN 12 WHEN 72 THEN 15 WHEN 73 THEN 28 WHEN 74 THEN 14 WHEN 75 THEN 16 WHEN 76 THEN 25 WHEN 77 THEN 42 WHEN 78 THEN 35 WHEN 79 THEN 55 WHEN 80 THEN 65 WHEN 81 THEN 35 WHEN 82 THEN 32 WHEN 83 THEN 45 WHEN 84 THEN 28 WHEN 85 THEN 22 WHEN 86 THEN 18 WHEN 87 THEN 48 WHEN 88 THEN 24 END;
    sp := CASE pid WHEN 51 THEN 22 WHEN 53 THEN 30 WHEN 55 THEN 34 WHEN 73 THEN 24 WHEN 81 THEN 28 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

    -- Carnemart
    pr := CASE pid WHEN 51 THEN 34 WHEN 52 THEN 135 WHEN 53 THEN 45 WHEN 54 THEN 199 WHEN 55 THEN 49 WHEN 56 THEN 55 WHEN 57 THEN 36 WHEN 58 THEN 42 WHEN 59 THEN 52 WHEN 60 THEN 240 WHEN 61 THEN 68 WHEN 62 THEN 155 WHEN 63 THEN 58 WHEN 64 THEN 21 WHEN 65 THEN 18 WHEN 66 THEN 18 WHEN 67 THEN 25 WHEN 68 THEN 31 WHEN 69 THEN 31 WHEN 70 THEN 47 WHEN 71 THEN 16 WHEN 72 THEN 20 WHEN 73 THEN 36 WHEN 74 THEN 18 WHEN 75 THEN 21 WHEN 76 THEN 32 WHEN 77 THEN 55 WHEN 78 THEN 45 WHEN 79 THEN 72 WHEN 80 THEN 85 WHEN 81 THEN 45 WHEN 82 THEN 42 WHEN 83 THEN 58 WHEN 84 THEN 36 WHEN 85 THEN 28 WHEN 86 THEN 24 WHEN 87 THEN 62 WHEN 88 THEN 31 END;
    sp := CASE pid WHEN 55 THEN 42 WHEN 81 THEN 38 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 2, pr, sp, 'in_stock');
  END LOOP;

  -- Lácteos y Huevos (IDs 89-104, 16 productos)
  FOR pid IN 89..104 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 89 THEN 26 WHEN 90 THEN 24 WHEN 91 THEN 18 WHEN 92 THEN 16 WHEN 93 THEN 28 WHEN 94 THEN 52 WHEN 95 THEN 85 WHEN 96 THEN 58 WHEN 97 THEN 58 WHEN 98 THEN 45 WHEN 99 THEN 42 WHEN 100 THEN 68 WHEN 101 THEN 35 WHEN 102 THEN 35 WHEN 103 THEN 48 WHEN 104 THEN 28 END;
    sp := CASE pid WHEN 89 THEN 22 WHEN 94 THEN 48 WHEN 97 THEN 52 WHEN 102 THEN 30 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

    -- Carnemart
    pr := CASE pid WHEN 89 THEN 34 WHEN 90 THEN 31 WHEN 91 THEN 24 WHEN 92 THEN 21 WHEN 93 THEN 36 WHEN 94 THEN 68 WHEN 95 THEN 110 WHEN 96 THEN 75 WHEN 97 THEN 75 WHEN 98 THEN 58 WHEN 99 THEN 55 WHEN 100 THEN 88 WHEN 101 THEN 45 WHEN 102 THEN 45 WHEN 103 THEN 62 WHEN 104 THEN 36 END;
    sp := CASE pid WHEN 94 THEN 62 WHEN 97 THEN 68 WHEN 102 THEN 39 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 2, pr, sp, 'in_stock');
  END LOOP;

  -- Carnes, Aves y Pescados (IDs 105-134, 30 productos)
  FOR pid IN 105..134 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 105 THEN 115 WHEN 106 THEN 125 WHEN 107 THEN 85 WHEN 108 THEN 95 WHEN 109 THEN 88 WHEN 110 THEN 165 WHEN 111 THEN 155 WHEN 112 THEN 135 WHEN 113 THEN 148 WHEN 114 THEN 142 WHEN 115 THEN 155 WHEN 116 THEN 240 WHEN 117 THEN 280 WHEN 118 THEN 260 WHEN 119 THEN 128 WHEN 120 THEN 155 WHEN 121 THEN 142 WHEN 122 THEN 58 WHEN 123 THEN 55 WHEN 124 THEN 85 WHEN 125 THEN 95 WHEN 126 THEN 138 WHEN 127 THEN 128 WHEN 128 THEN 310 WHEN 129 THEN 480 WHEN 130 THEN 260 WHEN 131 THEN 195 WHEN 132 THEN 68 WHEN 133 THEN 195 WHEN 134 THEN 165 END;
    sp := CASE pid WHEN 105 THEN 108 WHEN 110 THEN 150 WHEN 112 THEN 128 WHEN 114 THEN 135 WHEN 133 THEN 175 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, (CASE pid WHEN 129 THEN 'out_of_stock' WHEN 132 THEN 'low_stock' WHEN 134 THEN 'low_stock' ELSE 'in_stock' END)::stock_status);

    -- Carnemart
    pr := CASE pid WHEN 105 THEN 148 WHEN 106 THEN 160 WHEN 107 THEN 110 WHEN 108 THEN 122 WHEN 109 THEN 115 WHEN 110 THEN 215 WHEN 111 THEN 200 WHEN 112 THEN 175 WHEN 113 THEN 192 WHEN 114 THEN 185 WHEN 115 THEN 200 WHEN 116 THEN 310 WHEN 117 THEN 360 WHEN 118 THEN 340 WHEN 119 THEN 165 WHEN 120 THEN 200 WHEN 121 THEN 185 WHEN 122 THEN 75 WHEN 123 THEN 72 WHEN 124 THEN 110 WHEN 125 THEN 122 WHEN 126 THEN 178 WHEN 127 THEN 165 WHEN 128 THEN 400 WHEN 129 THEN 620 WHEN 130 THEN 340 WHEN 131 THEN 255 WHEN 132 THEN 88 WHEN 133 THEN 255 WHEN 134 THEN 215 END;
    sp := CASE pid WHEN 105 THEN 138 WHEN 110 THEN 195 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 2, pr, sp, 'in_stock');
  END LOOP;

  -- Panadería y Tortillería (IDs 135-144, 10 productos)
  FOR pid IN 135..144 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 135 THEN 38 WHEN 136 THEN 40 WHEN 137 THEN 32 WHEN 138 THEN 35 WHEN 139 THEN 20 WHEN 140 THEN 35 WHEN 141 THEN 28 WHEN 142 THEN 5 WHEN 143 THEN 6 WHEN 144 THEN 22 END;
    sp := CASE pid WHEN 135 THEN 34 WHEN 139 THEN 18 WHEN 142 THEN 4 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

    -- Carnemart
    pr := CASE pid WHEN 135 THEN 46 WHEN 136 THEN 48 WHEN 137 THEN 39 WHEN 138 THEN 42 WHEN 139 THEN 25 WHEN 140 THEN 42 WHEN 141 THEN 34 WHEN 142 THEN 7 WHEN 143 THEN 8 WHEN 144 THEN 27 END;
    sp := CASE pid WHEN 139 THEN 22 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 2, pr, sp, 'in_stock');
  END LOOP;

  -- Bebidas (IDs 145-159, 15 productos)
  FOR pid IN 145..159 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 145 THEN 36 WHEN 146 THEN 34 WHEN 147 THEN 30 WHEN 148 THEN 28 WHEN 149 THEN 28 WHEN 150 THEN 14 WHEN 151 THEN 16 WHEN 152 THEN 16 WHEN 153 THEN 26 WHEN 154 THEN 42 WHEN 155 THEN 38 WHEN 156 THEN 20 WHEN 157 THEN 22 WHEN 158 THEN 22 WHEN 159 THEN 20 END;
    sp := CASE pid WHEN 145 THEN 32 WHEN 150 THEN 12 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

    -- Carnemart
    pr := CASE pid WHEN 145 THEN 44 WHEN 146 THEN 42 WHEN 147 THEN 37 WHEN 148 THEN 35 WHEN 149 THEN 35 WHEN 150 THEN 18 WHEN 151 THEN 20 WHEN 152 THEN 20 WHEN 153 THEN 32 WHEN 154 THEN 52 WHEN 155 THEN 48 WHEN 156 THEN 26 WHEN 157 THEN 28 WHEN 158 THEN 28 WHEN 159 THEN 26 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 2, pr, sp, 'in_stock');
  END LOOP;

  -- Botanas y Dulces (IDs 160-165, 6 productos)
  FOR pid IN 160..165 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 160 THEN 36 WHEN 161 THEN 25 WHEN 162 THEN 22 WHEN 163 THEN 20 WHEN 164 THEN 18 WHEN 165 THEN 16 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

    -- Carnemart
    pr := CASE pid WHEN 160 THEN 44 WHEN 161 THEN 30 WHEN 162 THEN 28 WHEN 163 THEN 25 WHEN 164 THEN 22 WHEN 165 THEN 22 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 2, pr, sp, 'in_stock');
  END LOOP;

  -- Limpieza para Cocina (IDs 166-179, 14 productos)
  FOR pid IN 166..179 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 166 THEN 20 WHEN 167 THEN 78 WHEN 168 THEN 16 WHEN 169 THEN 30 WHEN 170 THEN 28 WHEN 171 THEN 28 WHEN 172 THEN 26 WHEN 173 THEN 32 WHEN 174 THEN 28 WHEN 175 THEN 18 WHEN 176 THEN 35 WHEN 177 THEN 28 WHEN 178 THEN 24 WHEN 179 THEN 85 END;
    sp := CASE pid WHEN 166 THEN 18 WHEN 168 THEN 14 WHEN 174 THEN 24 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

    -- Carnemart
    pr := CASE pid WHEN 166 THEN 26 WHEN 167 THEN 100 WHEN 168 THEN 21 WHEN 169 THEN 38 WHEN 170 THEN 36 WHEN 171 THEN 36 WHEN 172 THEN 34 WHEN 173 THEN 42 WHEN 174 THEN 36 WHEN 175 THEN 24 WHEN 176 THEN 45 WHEN 177 THEN 36 WHEN 178 THEN 31 WHEN 179 THEN 110 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 2, pr, sp, 'in_stock');
  END LOOP;

  -- Congelados (IDs 180-187, 8 productos)
  FOR pid IN 180..187 LOOP
    -- Resurte.me
    pr := CASE pid WHEN 180 THEN 42 WHEN 181 THEN 58 WHEN 182 THEN 52 WHEN 183 THEN 45 WHEN 184 THEN 125 WHEN 185 THEN 220 WHEN 186 THEN 85 WHEN 187 THEN 78 END;
    sp := CASE pid WHEN 181 THEN 52 WHEN 185 THEN 200 ELSE NULL END;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 1, pr, sp, 'in_stock');

    -- Carnemart
    pr := CASE pid WHEN 180 THEN 55 WHEN 181 THEN 75 WHEN 182 THEN 68 WHEN 183 THEN 58 WHEN 184 THEN 160 WHEN 185 THEN 285 WHEN 186 THEN 110 WHEN 187 THEN 100 END;
    sp := NULL;
    INSERT INTO product_stores (product_id, store_id, price, sale_price, stock_status)
    VALUES (pid, 2, pr, sp, 'in_stock');
  END LOOP;
END $$;
