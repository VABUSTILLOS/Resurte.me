-- Migration: Update 84 product image_urls from Wikipedia to local images
-- and clean up duplicate image_url entries in images arrays

-- 1. Update image_url for products with local images (84 products)
UPDATE products SET image_url = '/images/products/7.webp' WHERE slug = 'platano-macho';
UPDATE products SET image_url = '/images/products/8.webp' WHERE slug = 'fresa';
UPDATE products SET image_url = '/images/products/10.webp' WHERE slug = 'mango-ataulfo';
UPDATE products SET image_url = '/images/products/34.webp' WHERE slug = 'epazote';
UPDATE products SET image_url = '/images/products/49.webp' WHERE slug = 'hongo-portobello';
UPDATE products SET image_url = '/images/products/50.webp' WHERE slug = 'champinon';
UPDATE products SET image_url = '/images/products/51.webp' WHERE slug = 'arroz-blanco-1kg';
UPDATE products SET image_url = '/images/products/52.webp' WHERE slug = 'arroz-blanco-5kg';
UPDATE products SET image_url = '/images/products/53.webp' WHERE slug = 'frijol-negro-1kg';
UPDATE products SET image_url = '/images/products/54.webp' WHERE slug = 'frijol-negro-5kg';
UPDATE products SET image_url = '/images/products/55.webp' WHERE slug = 'frijol-bayo-1kg';
UPDATE products SET image_url = '/images/products/56.webp' WHERE slug = 'frijol-peruano-1kg';
UPDATE products SET image_url = '/images/products/57.webp' WHERE slug = 'lenteja-1kg';
UPDATE products SET image_url = '/images/products/59.webp' WHERE slug = 'aceite-canola-1l';
UPDATE products SET image_url = '/images/products/60.webp' WHERE slug = 'aceite-canola-5l';
UPDATE products SET image_url = '/images/products/61.webp' WHERE slug = 'aceite-de-maiz-1l';
UPDATE products SET image_url = '/images/products/64.webp' WHERE slug = 'pasta-spaghetti-500g';
UPDATE products SET image_url = '/images/products/68.webp' WHERE slug = 'harina-de-trigo-1kg';
UPDATE products SET image_url = '/images/products/71.webp' WHERE slug = 'sal-de-mar-fina-1kg';
UPDATE products SET image_url = '/images/products/72.webp' WHERE slug = 'sal-gruesa-1kg';
UPDATE products SET image_url = '/images/products/75.webp' WHERE slug = 'oregano-molido-100g';
UPDATE products SET image_url = '/images/products/77.webp' WHERE slug = 'salsa-maggi-200ml';
UPDATE products SET image_url = '/images/products/80.webp' WHERE slug = 'catsup-1kg';
UPDATE products SET image_url = '/images/products/81.webp' WHERE slug = 'mayonesa-1kg';
UPDATE products SET image_url = '/images/products/83.webp' WHERE slug = 'consome-de-pollo-1kg';
UPDATE products SET image_url = '/images/products/85.webp' WHERE slug = 'vinagre-blanco-1l';
UPDATE products SET image_url = '/images/products/90.webp' WHERE slug = 'leche-descremada-1l';
UPDATE products SET image_url = '/images/products/91.webp' WHERE slug = 'leche-evaporada-360ml';
UPDATE products SET image_url = '/images/products/92.webp' WHERE slug = 'media-crema-240ml';
UPDATE products SET image_url = '/images/products/93.webp' WHERE slug = 'leche-condensada-370ml';
UPDATE products SET image_url = '/images/products/96.webp' WHERE slug = 'huevo-rojo-18pz';
UPDATE products SET image_url = '/images/products/97.webp' WHERE slug = 'queso-oaxaca-400g';
UPDATE products SET image_url = '/images/products/98.webp' WHERE slug = 'queso-fresco-500g';
UPDATE products SET image_url = '/images/products/99.webp' WHERE slug = 'queso-panela-400g';
UPDATE products SET image_url = '/images/products/100.webp' WHERE slug = 'queso-manchego-400g';
UPDATE products SET image_url = '/images/products/102.webp' WHERE slug = 'yogurt-natural-1l';
UPDATE products SET image_url = '/images/products/105.webp' WHERE slug = 'pechuga-pollo';
UPDATE products SET image_url = '/images/products/106.webp' WHERE slug = 'milanesa-de-pollo';
UPDATE products SET image_url = '/images/products/107.webp' WHERE slug = 'pierna-muslo-pollo';
UPDATE products SET image_url = '/images/products/108.webp' WHERE slug = 'alitas-de-pollo';
UPDATE products SET image_url = '/images/products/111.webp' WHERE slug = 'milanesa-de-res';
UPDATE products SET image_url = '/images/products/112.webp' WHERE slug = 'carne-molida-80-20';
UPDATE products SET image_url = '/images/products/113.webp' WHERE slug = 'diezmillo-de-res';
UPDATE products SET image_url = '/images/products/116.webp' WHERE slug = 'arrachera';
UPDATE products SET image_url = '/images/products/117.webp' WHERE slug = 'ribeye';
UPDATE products SET image_url = '/images/products/118.webp' WHERE slug = 't-bone';
UPDATE products SET image_url = '/images/products/119.webp' WHERE slug = 'chuleta-de-cerdo';
UPDATE products SET image_url = '/images/products/120.webp' WHERE slug = 'lomo-de-cerdo';
UPDATE products SET image_url = '/images/products/121.webp' WHERE slug = 'costilla-de-cerdo';
UPDATE products SET image_url = '/images/products/122.webp' WHERE slug = 'tocino';
UPDATE products SET image_url = '/images/products/123.webp' WHERE slug = 'jamon-de-pierna';
UPDATE products SET image_url = '/images/products/124.webp' WHERE slug = 'chorizo';
UPDATE products SET image_url = '/images/products/126.webp' WHERE slug = 'filete-de-tilapia';
UPDATE products SET image_url = '/images/products/127.webp' WHERE slug = 'filete-de-basa';
UPDATE products SET image_url = '/images/products/128.webp' WHERE slug = 'camaron-pacotilla';
UPDATE products SET image_url = '/images/products/129.webp' WHERE slug = 'camaron-u12-u15';
UPDATE products SET image_url = '/images/products/130.webp' WHERE slug = 'pulpo';
UPDATE products SET image_url = '/images/products/131.webp' WHERE slug = 'mojarra-entera';
UPDATE products SET image_url = '/images/products/132.webp' WHERE slug = 'huachinango-entero';
UPDATE products SET image_url = '/images/products/133.webp' WHERE slug = 'camaron-seco';
UPDATE products SET image_url = '/images/products/134.webp' WHERE slug = 'salmon';
UPDATE products SET image_url = '/images/products/137.webp' WHERE slug = 'pan-hot-dog';
UPDATE products SET image_url = '/images/products/138.webp' WHERE slug = 'pan-hamburguesa';
UPDATE products SET image_url = '/images/products/147.webp' WHERE slug = 'sprite-2l';
UPDATE products SET image_url = '/images/products/149.webp' WHERE slug = 'sidral-mundet-2l';
UPDATE products SET image_url = '/images/products/150.webp' WHERE slug = 'agua-bonafont-15l';
UPDATE products SET image_url = '/images/products/151.webp' WHERE slug = 'agua-mineral-15l';
UPDATE products SET image_url = '/images/products/152.webp' WHERE slug = 'agua-mineral-saborizada-15l';
UPDATE products SET image_url = '/images/products/160.webp' WHERE slug = 'sabritas-clasicas-170g';
UPDATE products SET image_url = '/images/products/162.webp' WHERE slug = 'cacahuate-salado-200g';
UPDATE products SET image_url = '/images/products/163.webp' WHERE slug = 'galletas-marias-200g';
UPDATE products SET image_url = '/images/products/164.webp' WHERE slug = 'galletas-saladas-200g';
UPDATE products SET image_url = '/images/products/169.webp' WHERE slug = 'detergente-liquido-1l';
UPDATE products SET image_url = '/images/products/170.webp' WHERE slug = 'detergente-en-polvo-1kg';
UPDATE products SET image_url = '/images/products/172.webp' WHERE slug = 'limpiador-multiusos-500ml';
UPDATE products SET image_url = '/images/products/173.webp' WHERE slug = 'limpiavidrios-500ml';
UPDATE products SET image_url = '/images/products/175.webp' WHERE slug = 'fibras-para-trastes-3pz';
UPDATE products SET image_url = '/images/products/177.webp' WHERE slug = 'servilletas-100pz';
UPDATE products SET image_url = '/images/products/178.webp' WHERE slug = 'papel-de-cocina-2pz';
UPDATE products SET image_url = '/images/products/182.webp' WHERE slug = 'helado-vainilla-1l';
UPDATE products SET image_url = '/images/products/183.webp' WHERE slug = 'paletas-de-hielo-12pz';
UPDATE products SET image_url = '/images/products/184.webp' WHERE slug = 'filete-tilapia-congelado-1kg';
UPDATE products SET image_url = '/images/products/185.webp' WHERE slug = 'camaron-congelado-1kg';
UPDATE products SET image_url = '/images/products/186.webp' WHERE slug = 'nuggets-de-pollo-1kg';

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
