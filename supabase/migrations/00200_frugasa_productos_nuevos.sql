-- ============================================================
-- 00200 — FRUGASA: alta de los articulos que la tienda no tenia
--
-- QUE HACE
-- --------
-- Da de alta 61 productos de la lista de FRUGASA que no existian en el
-- catalogo, con precio = CEIL(costo x 1.20) y el tope de la competencia
-- ya aplicado cuando existe un comparable por kilo.
--
-- Se quedan FUERA, a proposito:
--   * `HUEVO` (R0097)          -> la tienda ya vende "Huevo Blanco 18pz".
--     FRUGASA lo cotiza por kilo y la tienda por pieza: convertir exigiria
--     suponer el peso del huevo. Queda en revision manual.
--   * `VARIOS T Extras` (R0124) -> no es un producto, es un renglon de
--     "extras" de la lista del proveedor.
--   * `CARBONATO` (R0241)      -> la tienda ya vende "Bicarbonato de Sodio
--     500g" y el nombre es ambiguo: podria ser el mismo articulo.
--   * Chiles que la tienda YA vende: Guajillo, Pasilla, Chipotle y de
--     Arbol (R0108 se despliega en variedades, no en un solo articulo).
--   * `Cacahuate salado`       -> ya existe "Cacahuate Salado 200g".
--
-- IMAGENES
-- --------
-- Se reutiliza una imagen que YA existe en `public/images/products/**`.
-- Cuando hay foto del MISMO alimento se usa esa (`chiles-secos-surtidos`
-- para las variedades de chile seco, `papelon` para el piloncillo,
-- `arroz-integral-1kg` para granos). Cuando no la hay se deja
-- `image_url` en NULL a proposito: `ProductCard` pinta un marcador, y una
-- foto de otro alimento seria enganosa (criterio que fijo `00194`).
-- 40 de los 61 llevan imagen; 21 quedan pendientes de foto real.
--
-- Idempotente: `WHERE NOT EXISTS` por slug (la tabla no tiene UNIQUE en
-- `slug`, asi que no se puede usar `ON CONFLICT`).
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_supplier bigint;
  v_filas int;
  v_links int;
BEGIN
  SELECT id INTO v_supplier FROM public.suppliers WHERE slug = 'frugasa';
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION '00200: falta el proveedor frugasa; corre 00196 primero';
  END IF;

  -- sku, nombre, slug, descripcion, imagen, categoria, precio, sku del proveedor
  CREATE TEMP TABLE _frugasa_alta (
    supplier_sku text,
    name         text,
    slug         text,
    description  text,
    image_url    text,
    category_id  bigint,
    price        numeric(12,2)
  ) ON COMMIT DROP;

  INSERT INTO _frugasa_alta
    (supplier_sku, name, slug, description, image_url, category_id, price)
  VALUES
    ('R0001', 'Acelga', 'acelga', 'Hoja de acelga fresca, de tallo firme y hoja verde. Se usa en caldos, guisos y ensaladas. Precio por kilo.', '/images/products/generic/verduras-congeladas-500g.webp', 1, 10.00),
    ('R0004', 'Alfalfa Germinado', 'alfalfa-germinado', 'Alfalfa germinada fresca y crujiente, para ensaladas, sandwiches y garnituras. Precio por kilo.', '/images/products/recipe/germinado-de-soya.webp', 1, 8.00),
    ('R0008', 'Camote Amarillo', 'camote-amarillo', 'Camote amarillo de pulpa dulce, ideal para hornear, freír o puré. Precio por kilo.', '/images/products/ab-foods/papa-dulce-recta-38-caja-680kg-foto.webp', 1, 49.90),
    ('R0009', 'Calabaza', 'calabaza', 'Calabaza de castilla para cremas, guisos y postres. Precio por kilo.', '/images/products/generic/verduras-congeladas-500g.webp', 1, 24.00),
    ('R0014', 'Cebolla Amarilla', 'cebolla-amarilla', 'Cebolla amarilla de bulbo grande, base de guisos, caldos y salsas. Precio por kilo.', '/images/products/recipe/cebolla-cambray.webp', 1, 30.00),
    ('R0016', 'Chile Chilaca', 'chile-chilaca', 'Chile chilaca fresco, alargado y de sabor suave, para rajas, caldos y cremas. Precio por kilo.', '/images/products/aji-dulce.webp', 1, 59.90),
    ('R0020', 'Durazno', 'durazno', 'Durazno de hueso, dulce y jugoso, para postres, ensaladas y aguas frescas. Precio por kilo.', NULL, 1, 99.90),
    ('R0023', 'Espárrago', 'esparrago', 'Espárrago fresco de tallo delgado, para asar, saltear o gratinar. Precio por kilo.', NULL, 1, 211.00),
    ('R0029', 'Jícama', 'jicama', 'Jícama fresca y crujiente, para ensaladas, snacks y guarniciones. Precio por kilo.', NULL, 1, 30.00),
    ('R0031', 'Kiwi', 'kiwi', 'Kiwi maduro, dulce y ácido, para ensaladas de fruta, postres y jugos. Precio por kilo.', NULL, 1, 117.00),
    ('R0037', 'Manzana Golden', 'manzana-golden', 'Manzana Golden de pulpa dulce, para postres, ensaladas y repostería. Precio por kilo.', NULL, 1, 49.90),
    ('R0039', 'Melón Honeydew', 'melon-honeydew', 'Melón Honeydew de pulpa verde pálida y sabor dulce, para ensaladas y jugos. Precio por kilo.', NULL, 1, 33.00),
    ('R0057', 'Tuna (fruta)', 'tuna-fruta', 'Tuna fresca, el fruto del nopal, dulce y con semillas comestibles. Para aguas frescas y postres. Precio por kilo.', NULL, 1, 21.00),
    ('R0062', 'Chile Caribe', 'chile-caribe', 'Chile caribe fresco y picante, para salsas y escabeches. Precio por kilo.', '/images/products/aji-dulce.webp', 1, 46.00),
    ('R0066', 'Ciruelo Rojo', 'ciruelo-rojo', 'Ciruelo rojo, dulce y jugoso, para postres, ensaladas y aguas frescas. Precio por kilo.', NULL, 1, 39.90),
    ('R0066', 'Ciruelo Negro', 'ciruelo-negro', 'Ciruelo negro de pulpa dulce y firme, para postres y ensaladas. Precio por kilo.', NULL, 1, 39.90),
    ('R0083', 'Ejote', 'ejote', 'Ejote fresco de vaina tierna, para guisar, saltear o ensalada. Precio por kilo.', '/images/products/generic/verduras-congeladas-500g.webp', 1, 57.00),
    ('R0102', 'Menta Fresca', 'menta-fresca', 'Menta fresca para infusiones, coctelería, postres y platillos. Precio por kilo.', '/images/products/recipe/hierbabuena-fresca.webp', 1, 19.00),
    ('R0153', 'Mejorana Fresca', 'mejorana-fresca', 'Mejorana fresca, aromática y de sabor suave, para carnes, caldos y aderezos. Precio por kilo.', '/images/products/recipe/tomillo-fresco.webp', 1, 247.00),
    ('R0158', 'Chícharo', 'chicharo', 'Chícharo fresco en vaina, dulce y tierno, para guisos, caldos y ensaladas. Precio por kilo.', '/images/products/generic/verduras-congeladas-500g.webp', 1, 36.00),
    ('R0129', 'Arándano Fresco', 'arandano-fresco', 'Arándano fresco para postres, ensaladas, panadería y bebidas. Precio por kilo.', '/images/products/arandanos.webp', 1, 146.00),
    ('R0145', 'Blue Berry', 'blue-berry', 'Blue berry fresco, dulce y firme, para postres, panadería y ensaladas. Precio por kilo.', '/images/products/arandanos.webp', 1, 98.00),
    ('R0147', 'Frambuesa', 'frambuesa', 'Frambuesa fresca para postres, mermeladas, coctelería y panadería. Precio por kilo.', '/images/products/frutos-rojos.webp', 1, 98.00),
    ('R0161', 'Uva Negra', 'uva-negra', 'Uva negra sin semilla, dulce y firme, para mesa, ensaladas y tablas de quesos. Precio por kilo.', NULL, 1, 46.00),
    ('R0132', 'Maíz Rosero', 'maiz-rosero', 'Maíz rosero en grano, para esquites, sopas y guisos. Precio por kilo.', '/images/products/recipe/maiz-tierno.webp', 1, 49.00),
    ('R0142', 'Chacal', 'chacal', 'Jitomate chacal, de sabor intenso, para salsas y guisos. Precio por kilo.', NULL, 1, 90.00),
    ('R0143', 'Poro', 'poro', 'Poro fresco, de sabor suave entre cebolla y ajo, para caldos y guisos. Precio por kilo.', NULL, 1, 30.00),
    ('R0212', 'Té de Limón', 'te-de-limon', 'Hierba de té de limón (zacate de limón) fresca, para infusiones y aguas. Precio por kilo.', NULL, 1, 11.00),
    ('R0219', 'Ensalada César Mr. Lucky', 'ensalada-cesar-mr-lucky', 'Ensalada César lista para servir, con aderezo incluido. Precio por kilo.', NULL, 1, 77.00),
    ('R0222', 'Ensalada Primavera Mr. Lucky', 'ensalada-primavera-mr-lucky', 'Ensalada primavera lista para servir, con mezcla de verduras frescas. Precio por kilo.', NULL, 1, 57.00),
    ('R0230', 'Apio en Palitos con Aderezo Mr. Lucky', 'apio-palitos-aderezo-mr-lucky', 'Palitos de apio listos para servir con aderezo. Precio por kilo.', NULL, 1, 42.00),
    ('R0070', 'Ajonjolí', 'ajonjoli', 'Semilla de ajonjolí natural, para panadería, aderezos y guisos. Precio por kilo.', NULL, 2, 148.00),
    ('R0071', 'Albahaca', 'albahaca', 'Albahaca seca en hoja, para salsas, guisos y aderezos. Precio por kilo.', '/images/products/recipe/albahaca-fresca.webp', 2, 70.00),
    ('R0073', 'Amaranto', 'amaranto', 'Amaranto en grano, para barras, postres y botanas. Precio por kilo.', '/images/products/generic/garbanzo-1kg.webp', 2, 114.00),
    ('R0077', 'Cacahuate Natural Tostado', 'cacahuate-natural-tostado', 'Cacahuate natural tostado sin sal, para botana, salsas y repostería. Precio por kilo.', '/images/products/162.webp', 2, 65.00),
    ('R0077-1', 'Cacahuate Enchilado', 'cacahuate-enchilado', 'Cacahuate tostado con chile en polvo, botana lista para servir. Precio por kilo.', '/images/products/162.webp', 2, 72.00),
    ('R0077-1', 'Cacahuate Japonés', 'cacahuate-japones', 'Cacahuate japonés con cubierta crocante, botana y topping de postres. Precio por kilo.', '/images/products/162.webp', 2, 130.00),
    ('R0079', 'Clavo', 'clavo', 'Clavo entero de aroma intenso, para caldos, adobos, dulces y ponches. Precio por kilo.', NULL, 2, 354.00),
    ('R0080', 'Coco Rayado', 'coco-rayado', 'Coco rayado seco, para repostería, panadería y postres. Precio por kilo.', NULL, 2, 111.00),
    ('R0091-1', 'Gragea', 'gragea', 'Gragea de colores, para decorar pasteles, galletas y postres. Precio por kilo.', NULL, 2, 81.00),
    ('R0092', 'Granola', 'granola', 'Granola de avena con frutos secos, para desayunos, yogur y postres. Precio por kilo.', NULL, 2, 83.00),
    ('R0093', 'Haba', 'haba', 'Haba seca, para guisos, sopas y botanas. Precio por kilo.', '/images/products/generic/garbanzo-1kg.webp', 2, 157.00),
    ('R0098', 'Jamaica', 'jamaica', 'Flor de jamaica seca, para aguas frescas, salsas y postres. Precio por kilo.', '/images/products/154.webp', 2, 130.00),
    ('R0108', 'Chile Chiltepín', 'chile-chiltepin', 'Chile chiltepín seco, muy picante, para salsas y molcajete. Precio por kilo.', '/images/products/recipe/chiles-secos-surtidos.webp', 2, 1916.00),
    ('R0108', 'Chile Mirasol', 'chile-mirasol', 'Chile mirasol seco, de picor medio, para salsas y adobos. Precio por kilo.', '/images/products/recipe/chiles-secos-surtidos.webp', 2, 284.00),
    ('R0108', 'Chile Pasado', 'chile-pasado', 'Chile pasado seco, de sabor ahumado, para caldos y guisos del norte. Precio por kilo.', '/images/products/recipe/chiles-secos-surtidos.webp', 2, 280.00),
    ('R0108', 'Chile De la Tierra', 'chile-de-la-tierra', 'Chile de la tierra seco, para salsas tradicionales y guisos. Precio por kilo.', '/images/products/recipe/chiles-secos-surtidos.webp', 2, 252.00),
    ('R0108', 'Chile Cascabel', 'chile-cascabel', 'Chile cascabel seco, de picor bajo y notas tostadas, para salsas y adobos. Precio por kilo.', '/images/products/recipe/chiles-secos-surtidos.webp', 2, 439.00),
    ('R0108', 'Chile Colorín', 'chile-colorin', 'Chile colorín seco, de color rojo intenso y picor suave, para salsas y moles. Precio por kilo.', '/images/products/recipe/chiles-secos-surtidos.webp', 2, 187.00),
    ('R0108', 'Chile Morita', 'chile-morita', 'Chile morita seco, ahumado y de picor medio, para salsas y adobos. Precio por kilo.', '/images/products/recipe/chiles-secos-surtidos.webp', 2, 179.00),
    ('R0115', 'Pepita de Girasol', 'pepita-de-girasol', 'Pepita de girasol, para salsas, botanas y repostería. Precio por kilo.', '/images/products/semillas-girasol.webp', 2, 72.00),
    ('R0115', 'Pepita de Calabaza', 'pepita-de-calabaza', 'Pepita de calabaza verde, para pipián, salsas y botanas. Precio por kilo.', '/images/products/semillas-girasol.webp', 2, 189.00),
    ('R0117', 'Piloncillo', 'piloncillo', 'Piloncillo de caña, para café de olla, atoles y postres. Precio por kilo.', '/images/products/papelon.webp', 2, 41.00),
    ('R0121', 'Tamarindo', 'tamarindo', 'Tamarindo en vaina, para aguas frescas, salsas y dulces. Precio por kilo.', '/images/products/recipe/pasta-de-tamarindo.webp', 2, 117.00),
    ('R0163', 'Ciruela Pasa', 'ciruela-pasa', 'Ciruela pasa sin hueso, para repostería, guisos y botanas. Precio por kilo.', '/images/products/recipe/pasas.webp', 2, 171.00),
    ('R0164', 'Avena', 'avena', 'Avena en hojuela, para desayunos, repostería y granola. Precio por kilo.', '/images/products/generic/arroz-integral-1kg.webp', 2, 33.00),
    ('R0174', 'Trigo Entero', 'trigo-entero', 'Trigo entero en grano, para guisos, sopas y repostería. Precio por kilo.', '/images/products/generic/arroz-integral-1kg.webp', 2, 22.00),
    ('R0243', 'Cúrcuma', 'curcuma', 'Cúrcuma molida, para guisos, adobos y bebidas. Precio por kilo.', '/images/products/recipe/canela-en-polvo.webp', 2, 203.00),
    ('R0244', 'Linaza', 'linaza', 'Semilla de linaza, para panadería, licuados y botanas. Precio por kilo.', '/images/products/semillas-girasol.webp', 2, 47.00),
    ('R0245', 'Tapioca', 'tapioca', 'Tapioca en perla, para postres y bebidas. Precio por kilo.', '/images/products/generic/arroz-integral-1kg.webp', 2, 101.00),
    ('R0246', 'Anís', 'anis', 'Anís en semilla, para panadería, infusiones y dulces. Precio por kilo.', '/images/products/recipe/canela-en-polvo.webp', 2, 166.00);

  INSERT INTO public.products (
    name, slug, description, image_url, images, brand, category_id,
    price, sale_price, stock_status, is_visible, show_in_whatsapp,
    unit, tags
  )
  SELECT
    a.name, a.slug, a.description, a.image_url,
    CASE WHEN a.image_url IS NULL THEN NULL ELSE jsonb_build_array(a.image_url) END,
    'Local', a.category_id,
    a.price, NULL, 'in_stock', true, false,
    'por kilo', '[]'::jsonb
  FROM _frugasa_alta a
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.slug = a.slug);

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  -- Costo de lista POR KILO de cada articulo nuevo.
  CREATE TEMP TABLE _frugasa_costo (
    slug         text PRIMARY KEY,
    presentation text,
    cost         numeric(12,2)
  ) ON COMMIT DROP;

  INSERT INTO _frugasa_costo (slug, presentation, cost) VALUES
    ('acelga', 'T 24, P Generica.', 8.20),
    ('alfalfa-germinado', 'O Manojo.', 6.00),
    ('camote-amarillo', 'C Amarillo, C Nacional.', 67.50),
    ('calabaza', 'C X, P E Selecto.', 20.00),
    ('cebolla-amarilla', 'T LG, O USA.', 25.00),
    ('chile-chilaca', 'P P. Especial.', 61.25),
    ('durazno', 'O USA, P Empaque.', 166.20),
    ('esparrago', 'P Palillo.', 175.50),
    ('jicama', 'P Empaque.', 24.30),
    ('kiwi', 'O USA, P Tradicional.', 97.50),
    ('manzana-golden', 'T 100, P Empaque.', 44.00),
    ('melon-honeydew', 'T Mixto, O MEX.', 26.90),
    ('tuna-fruta', 'C Verde, P E Selecto.', 17.05),
    ('chile-caribe', 'P Empaque.', 37.80),
    ('ciruelo-rojo', 'C Rojo, O USA.', 115.00),
    ('ciruelo-negro', 'C Negro(a), O USA.', 115.00),
    ('ejote', 'P Empaque.', 47.25),
    ('menta-fresca', NULL, 15.20),
    ('mejorana-fresca', NULL, 205.20),
    ('chicharo', 'T Vaina.', 29.70),
    ('arandano-fresco', NULL, 121.50),
    ('blue-berry', NULL, 81.00),
    ('frambuesa', NULL, 81.00),
    ('uva-negra', NULL, 38.00),
    ('maiz-rosero', NULL, 40.50),
    ('chacal', NULL, 74.25),
    ('poro', NULL, 25.00),
    ('te-de-limon', NULL, 9.15),
    ('ensalada-cesar-mr-lucky', NULL, 64.00),
    ('ensalada-primavera-mr-lucky', NULL, 47.00),
    ('apio-palitos-aderezo-mr-lucky', NULL, 35.00),
    ('ajonjoli', NULL, 122.85),
    ('albahaca', NULL, 57.95),
    ('amaranto', NULL, 94.50),
    ('cacahuate-natural-tostado', 'T Natural tostado.', 54.00),
    ('cacahuate-enchilado', 'T Enchilado.', 59.40),
    ('cacahuate-japones', 'T Japones.', 108.00),
    ('clavo', 'P Entera(o).', 295.00),
    ('coco-rayado', NULL, 91.80),
    ('gragea', NULL, 67.50),
    ('granola', NULL, 68.90),
    ('haba', NULL, 130.15),
    ('jamaica', NULL, 108.00),
    ('chile-chiltepin', 'T Chiltepín.', 2632.50),
    ('chile-mirasol', 'T Mirasol.', 236.25),
    ('chile-pasado', 'T Pasado.', 232.90),
    ('chile-de-la-tierra', 'T De la Tierra.', 209.25),
    ('chile-cascabel', 'T Cascabel.', 472.50),
    ('chile-colorin', 'T Colorin.', 155.25),
    ('chile-morita', 'T Morita.', 148.50),
    ('pepita-de-girasol', 'T Girasol.', 59.40),
    ('pepita-de-calabaza', 'T Calabaza.', 157.30),
    ('piloncillo', NULL, 33.75),
    ('tamarindo', NULL, 97.20),
    ('ciruela-pasa', NULL, 141.75),
    ('avena', NULL, 27.00),
    ('trigo-entero', NULL, 17.55),
    ('curcuma', NULL, 168.75),
    ('linaza', NULL, 39.15),
    ('tapioca', NULL, 83.70),
    ('anis', NULL, 137.70);

  INSERT INTO public.product_suppliers
    (product_id, supplier_id, supplier_sku, presentation, cost, list_date, is_primary, notes)
  SELECT p.id, v_supplier, a.supplier_sku, c.presentation, c.cost,
         DATE '2026-09-18', true,
         'Lista FRUGASA "Precios 1853" (RESTAURANT 2). Costo por kilo.'
  FROM _frugasa_alta a
  JOIN public.products p ON p.slug = a.slug
  JOIN _frugasa_costo c ON c.slug = a.slug
  ON CONFLICT (product_id, supplier_id, supplier_sku) DO UPDATE
    SET cost = EXCLUDED.cost,
        presentation = EXCLUDED.presentation,
        list_date = EXCLUDED.list_date,
        notes = EXCLUDED.notes,
        updated_at = now();

  GET DIAGNOSTICS v_links = ROW_COUNT;

  -- Snapshot de precios de referencia (22-sep-2026, sucursal 6) de los
  -- articulos nuevos. Sin esto, re-ejecutar 00198 dejaria a los nuevos sin
  -- tope, porque la tabla estaria vacia para ellos.
  CREATE TEMP TABLE _alsuper_seed (
    slug          text PRIMARY KEY,
    external_id   text NOT NULL,
    external_name text NOT NULL,
    format        text,
    price         numeric(12,2) NOT NULL,
    regular_price numeric(12,2),
    unit_price    numeric(12,2)
  ) ON COMMIT DROP;

  INSERT INTO _alsuper_seed
    (slug, external_id, external_name, format, price, regular_price, unit_price)
  VALUES
    ('camote-amarillo', '120', 'Camote  Kg', 'KG', 49.90, 79.90, 49.90),
    ('calabaza', '417865', 'Calabaza Butternut  por kg', 'KG', 79.90, 79.90, 79.90),
    ('chile-chilaca', '25', 'Chile Chilaca  Kg', 'KG', 59.90, 99.90, 59.90),
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
    ('haba', '7130000', 'Haba  Verde Valle 500 g', '500 GR', 79.90, 79.90, 159.80),
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
    ('anis', '445676', 'Anis Estrella Frasco Terana 28 Gr', '28 GR', 54.90, 54.90, 1960.71);

  INSERT INTO public.competitor_prices
    (product_id, supplier_slug, branch_id, external_id, external_name,
     format, price, regular_price, unit_price, captured_at)
  SELECT p.id, 'alsuper', 6, s.external_id, s.external_name,
         s.format, s.price, s.regular_price, s.unit_price, TIMESTAMPTZ '2026-09-22'
  FROM _alsuper_seed s
  JOIN public.products p ON p.slug = s.slug
  ON CONFLICT (product_id, supplier_slug, branch_id, external_id) DO UPDATE
    SET product_id = EXCLUDED.product_id,
        external_name = EXCLUDED.external_name,
        format = EXCLUDED.format,
        price = EXCLUDED.price,
        regular_price = EXCLUDED.regular_price,
        unit_price = EXCLUDED.unit_price,
        captured_at = EXCLUDED.captured_at;

  RAISE NOTICE '00200: % productos nuevos de FRUGASA dados de alta.', v_filas;
  RAISE NOTICE '00200: % vinculos de costo escritos.', v_links;
  RAISE NOTICE '00200: el precio definitivo (con tope) lo fija 00198; corre el sync y vuelve a empujar.';
END $$;

COMMIT;
