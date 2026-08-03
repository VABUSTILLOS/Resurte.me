-- Migration: Update 84 product image_urls from Wikipedia to local images
-- and clean up duplicate image_url entries in images arrays

-- 1. Update image_url for products with local images (84 products)
UPDATE products SET image_url = '/images/products/7.png' WHERE slug = 'platano-macho';
UPDATE products SET image_url = '/images/products/8.png' WHERE slug = 'fresa';
UPDATE products SET image_url = '/images/products/10.png' WHERE slug = 'mango-ataulfo';
UPDATE products SET image_url = '/images/products/34.png' WHERE slug = 'epazote';
UPDATE products SET image_url = '/images/products/49.png' WHERE slug = 'hongo-portobello';
UPDATE products SET image_url = '/images/products/50.png' WHERE slug = 'champinon';
UPDATE products SET image_url = '/images/products/51.png' WHERE slug = 'arroz-blanco-1kg';
UPDATE products SET image_url = '/images/products/52.png' WHERE slug = 'arroz-blanco-5kg';
UPDATE products SET image_url = '/images/products/53.png' WHERE slug = 'frijol-negro-1kg';
UPDATE products SET image_url = '/images/products/54.png' WHERE slug = 'frijol-negro-5kg';
UPDATE products SET image_url = '/images/products/55.png' WHERE slug = 'frijol-bayo-1kg';
UPDATE products SET image_url = '/images/products/56.png' WHERE slug = 'frijol-peruano-1kg';
UPDATE products SET image_url = '/images/products/57.png' WHERE slug = 'lenteja-1kg';
UPDATE products SET image_url = '/images/products/59.png' WHERE slug = 'aceite-canola-1l';
UPDATE products SET image_url = '/images/products/60.png' WHERE slug = 'aceite-canola-5l';
UPDATE products SET image_url = '/images/products/61.png' WHERE slug = 'aceite-de-maiz-1l';
UPDATE products SET image_url = '/images/products/64.png' WHERE slug = 'pasta-spaghetti-500g';
UPDATE products SET image_url = '/images/products/68.png' WHERE slug = 'harina-de-trigo-1kg';
UPDATE products SET image_url = '/images/products/71.png' WHERE slug = 'sal-de-mar-fina-1kg';
UPDATE products SET image_url = '/images/products/72.png' WHERE slug = 'sal-gruesa-1kg';
UPDATE products SET image_url = '/images/products/75.png' WHERE slug = 'oregano-molido-100g';
UPDATE products SET image_url = '/images/products/77.png' WHERE slug = 'salsa-maggi-200ml';
UPDATE products SET image_url = '/images/products/80.png' WHERE slug = 'catsup-1kg';
UPDATE products SET image_url = '/images/products/81.png' WHERE slug = 'mayonesa-1kg';
UPDATE products SET image_url = '/images/products/83.png' WHERE slug = 'consome-de-pollo-1kg';
UPDATE products SET image_url = '/images/products/85.png' WHERE slug = 'vinagre-blanco-1l';
UPDATE products SET image_url = '/images/products/90.png' WHERE slug = 'leche-descremada-1l';
UPDATE products SET image_url = '/images/products/91.png' WHERE slug = 'leche-evaporada-360ml';
UPDATE products SET image_url = '/images/products/92.png' WHERE slug = 'media-crema-240ml';
UPDATE products SET image_url = '/images/products/93.png' WHERE slug = 'leche-condensada-370ml';
UPDATE products SET image_url = '/images/products/96.png' WHERE slug = 'huevo-rojo-18pz';
UPDATE products SET image_url = '/images/products/97.png' WHERE slug = 'queso-oaxaca-400g';
UPDATE products SET image_url = '/images/products/98.png' WHERE slug = 'queso-fresco-500g';
UPDATE products SET image_url = '/images/products/99.png' WHERE slug = 'queso-panela-400g';
UPDATE products SET image_url = '/images/products/100.png' WHERE slug = 'queso-manchego-400g';
UPDATE products SET image_url = '/images/products/102.png' WHERE slug = 'yogurt-natural-1l';
UPDATE products SET image_url = '/images/products/105.png' WHERE slug = 'pechuga-pollo';
UPDATE products SET image_url = '/images/products/106.png' WHERE slug = 'milanesa-de-pollo';
UPDATE products SET image_url = '/images/products/107.png' WHERE slug = 'pierna-muslo-pollo';
UPDATE products SET image_url = '/images/products/108.png' WHERE slug = 'alitas-de-pollo';
UPDATE products SET image_url = '/images/products/111.png' WHERE slug = 'milanesa-de-res';
UPDATE products SET image_url = '/images/products/112.png' WHERE slug = 'carne-molida-80-20';
UPDATE products SET image_url = '/images/products/113.png' WHERE slug = 'diezmillo-de-res';
UPDATE products SET image_url = '/images/products/116.png' WHERE slug = 'arrachera';
UPDATE products SET image_url = '/images/products/117.png' WHERE slug = 'ribeye';
UPDATE products SET image_url = '/images/products/118.png' WHERE slug = 't-bone';
UPDATE products SET image_url = '/images/products/119.png' WHERE slug = 'chuleta-de-cerdo';
UPDATE products SET image_url = '/images/products/120.png' WHERE slug = 'lomo-de-cerdo';
UPDATE products SET image_url = '/images/products/121.png' WHERE slug = 'costilla-de-cerdo';
UPDATE products SET image_url = '/images/products/122.png' WHERE slug = 'tocino';
UPDATE products SET image_url = '/images/products/123.png' WHERE slug = 'jamon-de-pierna';
UPDATE products SET image_url = '/images/products/124.png' WHERE slug = 'chorizo';
UPDATE products SET image_url = '/images/products/126.png' WHERE slug = 'filete-de-tilapia';
UPDATE products SET image_url = '/images/products/127.png' WHERE slug = 'filete-de-basa';
UPDATE products SET image_url = '/images/products/128.png' WHERE slug = 'camaron-pacotilla';
UPDATE products SET image_url = '/images/products/129.png' WHERE slug = 'camaron-u12-u15';
UPDATE products SET image_url = '/images/products/130.png' WHERE slug = 'pulpo';
UPDATE products SET image_url = '/images/products/131.png' WHERE slug = 'mojarra-entera';
UPDATE products SET image_url = '/images/products/132.png' WHERE slug = 'huachinango-entero';
UPDATE products SET image_url = '/images/products/133.png' WHERE slug = 'camaron-seco';
UPDATE products SET image_url = '/images/products/134.png' WHERE slug = 'salmon';
UPDATE products SET image_url = '/images/products/137.png' WHERE slug = 'pan-hot-dog';
UPDATE products SET image_url = '/images/products/138.png' WHERE slug = 'pan-hamburguesa';
UPDATE products SET image_url = '/images/products/147.png' WHERE slug = 'sprite-2l';
UPDATE products SET image_url = '/images/products/149.png' WHERE slug = 'sidral-mundet-2l';
UPDATE products SET image_url = '/images/products/150.png' WHERE slug = 'agua-bonafont-15l';
UPDATE products SET image_url = '/images/products/151.png' WHERE slug = 'agua-mineral-15l';
UPDATE products SET image_url = '/images/products/152.png' WHERE slug = 'agua-mineral-saborizada-15l';
UPDATE products SET image_url = '/images/products/160.png' WHERE slug = 'sabritas-clasicas-170g';
UPDATE products SET image_url = '/images/products/162.png' WHERE slug = 'cacahuate-salado-200g';
UPDATE products SET image_url = '/images/products/163.png' WHERE slug = 'galletas-marias-200g';
UPDATE products SET image_url = '/images/products/164.png' WHERE slug = 'galletas-saladas-200g';
UPDATE products SET image_url = '/images/products/169.png' WHERE slug = 'detergente-liquido-1l';
UPDATE products SET image_url = '/images/products/170.png' WHERE slug = 'detergente-en-polvo-1kg';
UPDATE products SET image_url = '/images/products/172.png' WHERE slug = 'limpiador-multiusos-500ml';
UPDATE products SET image_url = '/images/products/173.png' WHERE slug = 'limpiavidrios-500ml';
UPDATE products SET image_url = '/images/products/175.png' WHERE slug = 'fibras-para-trastes-3pz';
UPDATE products SET image_url = '/images/products/177.png' WHERE slug = 'servilletas-100pz';
UPDATE products SET image_url = '/images/products/178.png' WHERE slug = 'papel-de-cocina-2pz';
UPDATE products SET image_url = '/images/products/182.png' WHERE slug = 'helado-vainilla-1l';
UPDATE products SET image_url = '/images/products/183.png' WHERE slug = 'paletas-de-hielo-12pz';
UPDATE products SET image_url = '/images/products/184.png' WHERE slug = 'filete-tilapia-congelado-1kg';
UPDATE products SET image_url = '/images/products/185.png' WHERE slug = 'camaron-congelado-1kg';
UPDATE products SET image_url = '/images/products/186.png' WHERE slug = 'nuggets-de-pollo-1kg';

-- 2. Clean duplicate image_url entries from images arrays
-- Remove image_url from images JSONB array where it appears as a duplicate
UPDATE products
SET images = (
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements(images) AS elem
  WHERE elem::text <> to_jsonb(image_url)::text
)
WHERE images IS NOT NULL
  AND jsonb_typeof(images) = 'array'
  AND images::jsonb @> to_jsonb(image_url)::jsonb;

-- Set images to NULL for empty arrays after cleanup
UPDATE products SET images = NULL WHERE images = '[]'::jsonb;
