-- Migration 00015: Fix broken product images (48 products) + store logo/banner
-- Replaces broken Wikimedia thumbnail URLs with local branded WebP placeholders.
-- Generated: 2026-08-06T05:48:41.756Z

BEGIN;

UPDATE products SET image_url = '/images/products/generic/aceite-de-oliva-1l.webp', images = jsonb_build_array('/images/products/generic/aceite-de-oliva-1l.webp'), updated_at = now() WHERE slug = 'aceite-de-oliva-1l';
UPDATE products SET image_url = '/images/products/generic/azucar-estandar-1kg.webp', images = jsonb_build_array('/images/products/generic/azucar-estandar-1kg.webp'), updated_at = now() WHERE slug = 'azucar-estandar-1kg';
UPDATE products SET image_url = '/images/products/generic/azucar-glass-500g.webp', images = jsonb_build_array('/images/products/generic/azucar-glass-500g.webp'), updated_at = now() WHERE slug = 'azucar-glass-500g';
UPDATE products SET image_url = '/images/products/generic/bistec-de-res.webp', images = jsonb_build_array('/images/products/generic/bistec-de-res.webp'), updated_at = now() WHERE slug = 'bistec-de-res';
UPDATE products SET image_url = '/images/products/generic/bolillo.webp', images = jsonb_build_array('/images/products/generic/bolillo.webp'), updated_at = now() WHERE slug = 'bolillo';
UPDATE products SET image_url = '/images/products/generic/bolsas-de-basura-50pz.webp', images = jsonb_build_array('/images/products/generic/bolsas-de-basura-50pz.webp'), updated_at = now() WHERE slug = 'bolsas-de-basura-50pz';
UPDATE products SET image_url = '/images/products/generic/cerveza-corona-355ml.webp', images = jsonb_build_array('/images/products/generic/cerveza-corona-355ml.webp'), updated_at = now() WHERE slug = 'cerveza-corona-355ml';
UPDATE products SET image_url = '/images/products/generic/cerveza-modelo-355ml.webp', images = jsonb_build_array('/images/products/generic/cerveza-modelo-355ml.webp'), updated_at = now() WHERE slug = 'cerveza-modelo-355ml';
UPDATE products SET image_url = '/images/products/generic/cerveza-pacifico-355ml.webp', images = jsonb_build_array('/images/products/generic/cerveza-pacifico-355ml.webp'), updated_at = now() WHERE slug = 'cerveza-pacifico-355ml';
UPDATE products SET image_url = '/images/products/generic/cerveza-victoria-355ml.webp', images = jsonb_build_array('/images/products/generic/cerveza-victoria-355ml.webp'), updated_at = now() WHERE slug = 'cerveza-victoria-355ml';
UPDATE products SET image_url = '/images/products/generic/chocolate-abuelita.webp', images = jsonb_build_array('/images/products/generic/chocolate-abuelita.webp'), updated_at = now() WHERE slug = 'chocolate-abuelita';
UPDATE products SET image_url = '/images/products/generic/cloro-1l.webp', images = jsonb_build_array('/images/products/generic/cloro-1l.webp'), updated_at = now() WHERE slug = 'cloro-1l';
UPDATE products SET image_url = '/images/products/generic/cloro-5l.webp', images = jsonb_build_array('/images/products/generic/cloro-5l.webp'), updated_at = now() WHERE slug = 'cloro-5l';
UPDATE products SET image_url = '/images/products/generic/coca-cola-25l.webp', images = jsonb_build_array('/images/products/generic/coca-cola-25l.webp'), updated_at = now() WHERE slug = 'coca-cola-25l';
UPDATE products SET image_url = '/images/products/generic/coca-cola-light-25l.webp', images = jsonb_build_array('/images/products/generic/coca-cola-light-25l.webp'), updated_at = now() WHERE slug = 'coca-cola-light-25l';
UPDATE products SET image_url = '/images/products/generic/comino-molido-100g.webp', images = jsonb_build_array('/images/products/generic/comino-molido-100g.webp'), updated_at = now() WHERE slug = 'comino-molido-100g';
UPDATE products SET image_url = '/images/products/generic/concentrado-horchata-1l.webp', images = jsonb_build_array('/images/products/generic/concentrado-horchata-1l.webp'), updated_at = now() WHERE slug = 'concentrado-horchata-1l';
UPDATE products SET image_url = '/images/products/generic/consome-de-res-1kg.webp', images = jsonb_build_array('/images/products/generic/consome-de-res-1kg.webp'), updated_at = now() WHERE slug = 'consome-de-res-1kg';
UPDATE products SET image_url = '/images/products/generic/deditos-de-pescado-1kg.webp', images = jsonb_build_array('/images/products/generic/deditos-de-pescado-1kg.webp'), updated_at = now() WHERE slug = 'deditos-de-pescado-1kg';
UPDATE products SET image_url = '/images/products/generic/desengrasante-1l.webp', images = jsonb_build_array('/images/products/generic/desengrasante-1l.webp'), updated_at = now() WHERE slug = 'desengrasante-1l';
UPDATE products SET image_url = '/images/products/generic/falda-de-res.webp', images = jsonb_build_array('/images/products/generic/falda-de-res.webp'), updated_at = now() WHERE slug = 'falda-de-res';
UPDATE products SET image_url = '/images/products/generic/fanta-naranja-2l.webp', images = jsonb_build_array('/images/products/generic/fanta-naranja-2l.webp'), updated_at = now() WHERE slug = 'fanta-naranja-2l';
UPDATE products SET image_url = '/images/products/generic/garbanzo-1kg.webp', images = jsonb_build_array('/images/products/generic/garbanzo-1kg.webp'), updated_at = now() WHERE slug = 'garbanzo-1kg';
UPDATE products SET image_url = '/images/products/generic/guantes-de-latex-100pz.webp', images = jsonb_build_array('/images/products/generic/guantes-de-latex-100pz.webp'), updated_at = now() WHERE slug = 'guantes-de-latex-100pz';
UPDATE products SET image_url = '/images/products/generic/harina-de-maiz-1kg.webp', images = jsonb_build_array('/images/products/generic/harina-de-maiz-1kg.webp'), updated_at = now() WHERE slug = 'harina-de-maiz-1kg';
UPDATE products SET image_url = '/images/products/generic/jabon-lavaplatos-750ml.webp', images = jsonb_build_array('/images/products/generic/jabon-lavaplatos-750ml.webp'), updated_at = now() WHERE slug = 'jabon-lavaplatos-750ml';
UPDATE products SET image_url = '/images/products/generic/jabon-zote-400g.webp', images = jsonb_build_array('/images/products/generic/jabon-zote-400g.webp'), updated_at = now() WHERE slug = 'jabon-zote-400g';
UPDATE products SET image_url = '/images/products/generic/jugo-jumex-1l.webp', images = jsonb_build_array('/images/products/generic/jugo-jumex-1l.webp'), updated_at = now() WHERE slug = 'jugo-jumex-1l';
UPDATE products SET image_url = '/images/products/generic/longaniza.webp', images = jsonb_build_array('/images/products/generic/longaniza.webp'), updated_at = now() WHERE slug = 'longaniza';
UPDATE products SET image_url = '/images/products/generic/maicena-500g.webp', images = jsonb_build_array('/images/products/generic/maicena-500g.webp'), updated_at = now() WHERE slug = 'maicena-500g';
UPDATE products SET image_url = '/images/products/generic/manteca-vegetal.webp', images = jsonb_build_array('/images/products/generic/manteca-vegetal.webp'), updated_at = now() WHERE slug = 'manteca-vegetal';
UPDATE products SET image_url = '/images/products/generic/mole-dona-maria-500g.webp', images = jsonb_build_array('/images/products/generic/mole-dona-maria-500g.webp'), updated_at = now() WHERE slug = 'mole-dona-maria-500g';
UPDATE products SET image_url = '/images/products/generic/mostaza-400g.webp', images = jsonb_build_array('/images/products/generic/mostaza-400g.webp'), updated_at = now() WHERE slug = 'mostaza-400g';
UPDATE products SET image_url = '/images/products/generic/pan-bimbo-blanco.webp', images = jsonb_build_array('/images/products/generic/pan-bimbo-blanco.webp'), updated_at = now() WHERE slug = 'pan-bimbo-blanco';
UPDATE products SET image_url = '/images/products/generic/pan-integral.webp', images = jsonb_build_array('/images/products/generic/pan-integral.webp'), updated_at = now() WHERE slug = 'pan-integral';
UPDATE products SET image_url = '/images/products/generic/papas-a-la-francesa-1kg.webp', images = jsonb_build_array('/images/products/generic/papas-a-la-francesa-1kg.webp'), updated_at = now() WHERE slug = 'papas-a-la-francesa-1kg';
UPDATE products SET image_url = '/images/products/generic/pasta-codito-500g.webp', images = jsonb_build_array('/images/products/generic/pasta-codito-500g.webp'), updated_at = now() WHERE slug = 'pasta-codito-500g';
UPDATE products SET image_url = '/images/products/generic/pasta-fideo-500g.webp', images = jsonb_build_array('/images/products/generic/pasta-fideo-500g.webp'), updated_at = now() WHERE slug = 'pasta-fideo-500g';
UPDATE products SET image_url = '/images/products/generic/pimienta-negra-molida-100g.webp', images = jsonb_build_array('/images/products/generic/pimienta-negra-molida-100g.webp'), updated_at = now() WHERE slug = 'pimienta-negra-molida-100g';
UPDATE products SET image_url = '/images/products/generic/pollo-entero.webp', images = jsonb_build_array('/images/products/generic/pollo-entero.webp'), updated_at = now() WHERE slug = 'pollo-entero';
UPDATE products SET image_url = '/images/products/generic/salsa-de-soya-500ml.webp', images = jsonb_build_array('/images/products/generic/salsa-de-soya-500ml.webp'), updated_at = now() WHERE slug = 'salsa-de-soya-500ml';
UPDATE products SET image_url = '/images/products/generic/salsa-inglesa-250ml.webp', images = jsonb_build_array('/images/products/generic/salsa-inglesa-250ml.webp'), updated_at = now() WHERE slug = 'salsa-inglesa-250ml';
UPDATE products SET image_url = '/images/products/generic/salsa-valentina-370ml.webp', images = jsonb_build_array('/images/products/generic/salsa-valentina-370ml.webp'), updated_at = now() WHERE slug = 'salsa-valentina-370ml';
UPDATE products SET image_url = '/images/products/generic/telera.webp', images = jsonb_build_array('/images/products/generic/telera.webp'), updated_at = now() WHERE slug = 'telera';
UPDATE products SET image_url = '/images/products/generic/tostadas.webp', images = jsonb_build_array('/images/products/generic/tostadas.webp'), updated_at = now() WHERE slug = 'tostadas';
UPDATE products SET image_url = '/images/products/generic/totopos-200g.webp', images = jsonb_build_array('/images/products/generic/totopos-200g.webp'), updated_at = now() WHERE slug = 'totopos-200g';
UPDATE products SET image_url = '/images/products/generic/verduras-congeladas-500g.webp', images = jsonb_build_array('/images/products/generic/verduras-congeladas-500g.webp'), updated_at = now() WHERE slug = 'verduras-congeladas-500g';
UPDATE products SET image_url = '/images/products/generic/vinagre-de-manzana-1l.webp', images = jsonb_build_array('/images/products/generic/vinagre-de-manzana-1l.webp'), updated_at = now() WHERE slug = 'vinagre-de-manzana-1l';

-- Store logo/banner: replace broken Wikimedia thumbnails with local WebP
UPDATE stores SET logo_url = '/images/store/logo.webp', banner_url = '/images/store/banner.webp', updated_at = now() WHERE slug = 'resurte-me';

COMMIT;
