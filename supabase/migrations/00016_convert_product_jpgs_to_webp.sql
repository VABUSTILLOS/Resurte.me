-- Migration 00016: Convert legacy product .jpg images to compressed WebP
-- Remaps any product image_url / images array entries pointing at
-- /images/products/{slug}.jpg to the equivalent .webp (files converted locally).
-- Generated: 2026-08-06T06:01:06.052Z

BEGIN;

-- aceite-oliva-extra-virgen
UPDATE products SET image_url = '/images/products/aceite-oliva-extra-virgen.webp', updated_at = now() WHERE image_url = '/images/products/aceite-oliva-extra-virgen.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/aceite-oliva-extra-virgen.jpg' THEN '/images/products/aceite-oliva-extra-virgen.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/aceite-oliva-extra-virgen.jpg"]'::jsonb;

-- aceite-vegetal-5l
UPDATE products SET image_url = '/images/products/aceite-vegetal-5l.webp', updated_at = now() WHERE image_url = '/images/products/aceite-vegetal-5l.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/aceite-vegetal-5l.jpg' THEN '/images/products/aceite-vegetal-5l.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/aceite-vegetal-5l.jpg"]'::jsonb;

-- achiote-en-pasta-200g
UPDATE products SET image_url = '/images/products/achiote-en-pasta-200g.webp', updated_at = now() WHERE image_url = '/images/products/achiote-en-pasta-200g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/achiote-en-pasta-200g.jpg' THEN '/images/products/achiote-en-pasta-200g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/achiote-en-pasta-200g.jpg"]'::jsonb;

-- agua-mineral-1-5l
UPDATE products SET image_url = '/images/products/agua-mineral-1-5l.webp', updated_at = now() WHERE image_url = '/images/products/agua-mineral-1-5l.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/agua-mineral-1-5l.jpg' THEN '/images/products/agua-mineral-1-5l.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/agua-mineral-1-5l.jpg"]'::jsonb;

-- ajonjoli-500g
UPDATE products SET image_url = '/images/products/ajonjoli-500g.webp', updated_at = now() WHERE image_url = '/images/products/ajonjoli-500g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/ajonjoli-500g.jpg' THEN '/images/products/ajonjoli-500g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/ajonjoli-500g.jpg"]'::jsonb;

-- albahaca-seca-100g
UPDATE products SET image_url = '/images/products/albahaca-seca-100g.webp', updated_at = now() WHERE image_url = '/images/products/albahaca-seca-100g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/albahaca-seca-100g.jpg' THEN '/images/products/albahaca-seca-100g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/albahaca-seca-100g.jpg"]'::jsonb;

-- apio-fresco
UPDATE products SET image_url = '/images/products/apio-fresco.webp', updated_at = now() WHERE image_url = '/images/products/apio-fresco.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/apio-fresco.jpg' THEN '/images/products/apio-fresco.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/apio-fresco.jpg"]'::jsonb;

-- arrachera-marinada-1kg
UPDATE products SET image_url = '/images/products/arrachera-marinada-1kg.webp', updated_at = now() WHERE image_url = '/images/products/arrachera-marinada-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/arrachera-marinada-1kg.jpg' THEN '/images/products/arrachera-marinada-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/arrachera-marinada-1kg.jpg"]'::jsonb;

-- arroz-sushi-2kg
UPDATE products SET image_url = '/images/products/arroz-sushi-2kg.webp', updated_at = now() WHERE image_url = '/images/products/arroz-sushi-2kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/arroz-sushi-2kg.jpg' THEN '/images/products/arroz-sushi-2kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/arroz-sushi-2kg.jpg"]'::jsonb;

-- azucar-glass-1kg
UPDATE products SET image_url = '/images/products/azucar-glass-1kg.webp', updated_at = now() WHERE image_url = '/images/products/azucar-glass-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/azucar-glass-1kg.jpg' THEN '/images/products/azucar-glass-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/azucar-glass-1kg.jpg"]'::jsonb;

-- cafe-en-grano-1kg
UPDATE products SET image_url = '/images/products/cafe-en-grano-1kg.webp', updated_at = now() WHERE image_url = '/images/products/cafe-en-grano-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/cafe-en-grano-1kg.jpg' THEN '/images/products/cafe-en-grano-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/cafe-en-grano-1kg.jpg"]'::jsonb;

-- camaron-pacotilla-1kg
UPDATE products SET image_url = '/images/products/camaron-pacotilla-1kg.webp', updated_at = now() WHERE image_url = '/images/products/camaron-pacotilla-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/camaron-pacotilla-1kg.jpg' THEN '/images/products/camaron-pacotilla-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/camaron-pacotilla-1kg.jpg"]'::jsonb;

-- carbon-vegetal-5kg
UPDATE products SET image_url = '/images/products/carbon-vegetal-5kg.webp', updated_at = now() WHERE image_url = '/images/products/carbon-vegetal-5kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/carbon-vegetal-5kg.jpg' THEN '/images/products/carbon-vegetal-5kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/carbon-vegetal-5kg.jpg"]'::jsonb;

-- catsup-1l
UPDATE products SET image_url = '/images/products/catsup-1l.webp', updated_at = now() WHERE image_url = '/images/products/catsup-1l.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/catsup-1l.jpg' THEN '/images/products/catsup-1l.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/catsup-1l.jpg"]'::jsonb;

-- cebolla-blanca-1kg
UPDATE products SET image_url = '/images/products/cebolla-blanca-1kg.webp', updated_at = now() WHERE image_url = '/images/products/cebolla-blanca-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/cebolla-blanca-1kg.jpg' THEN '/images/products/cebolla-blanca-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/cebolla-blanca-1kg.jpg"]'::jsonb;

-- cerveza-clara-six
UPDATE products SET image_url = '/images/products/cerveza-clara-six.webp', updated_at = now() WHERE image_url = '/images/products/cerveza-clara-six.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/cerveza-clara-six.jpg' THEN '/images/products/cerveza-clara-six.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/cerveza-clara-six.jpg"]'::jsonb;

-- cerveza-oscura-six
UPDATE products SET image_url = '/images/products/cerveza-oscura-six.webp', updated_at = now() WHERE image_url = '/images/products/cerveza-oscura-six.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/cerveza-oscura-six.jpg' THEN '/images/products/cerveza-oscura-six.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/cerveza-oscura-six.jpg"]'::jsonb;

-- chile-ancho-seco-1kg
UPDATE products SET image_url = '/images/products/chile-ancho-seco-1kg.webp', updated_at = now() WHERE image_url = '/images/products/chile-ancho-seco-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/chile-ancho-seco-1kg.jpg' THEN '/images/products/chile-ancho-seco-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/chile-ancho-seco-1kg.jpg"]'::jsonb;

-- chile-en-polvo-500g
UPDATE products SET image_url = '/images/products/chile-en-polvo-500g.webp', updated_at = now() WHERE image_url = '/images/products/chile-en-polvo-500g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/chile-en-polvo-500g.jpg' THEN '/images/products/chile-en-polvo-500g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/chile-en-polvo-500g.jpg"]'::jsonb;

-- chile-guajillo-seco-1kg
UPDATE products SET image_url = '/images/products/chile-guajillo-seco-1kg.webp', updated_at = now() WHERE image_url = '/images/products/chile-guajillo-seco-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/chile-guajillo-seco-1kg.jpg' THEN '/images/products/chile-guajillo-seco-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/chile-guajillo-seco-1kg.jpg"]'::jsonb;

-- chile-jalapeno-1kg
UPDATE products SET image_url = '/images/products/chile-jalapeno-1kg.webp', updated_at = now() WHERE image_url = '/images/products/chile-jalapeno-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/chile-jalapeno-1kg.jpg' THEN '/images/products/chile-jalapeno-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/chile-jalapeno-1kg.jpg"]'::jsonb;

-- chile-poblano-1kg
UPDATE products SET image_url = '/images/products/chile-poblano-1kg.webp', updated_at = now() WHERE image_url = '/images/products/chile-poblano-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/chile-poblano-1kg.jpg' THEN '/images/products/chile-poblano-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/chile-poblano-1kg.jpg"]'::jsonb;

-- chile-serrano-1kg
UPDATE products SET image_url = '/images/products/chile-serrano-1kg.webp', updated_at = now() WHERE image_url = '/images/products/chile-serrano-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/chile-serrano-1kg.jpg' THEN '/images/products/chile-serrano-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/chile-serrano-1kg.jpg"]'::jsonb;

-- chimichurri-500ml
UPDATE products SET image_url = '/images/products/chimichurri-500ml.webp', updated_at = now() WHERE image_url = '/images/products/chimichurri-500ml.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/chimichurri-500ml.jpg' THEN '/images/products/chimichurri-500ml.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/chimichurri-500ml.jpg"]'::jsonb;

-- chispas-chocolate-1kg
UPDATE products SET image_url = '/images/products/chispas-chocolate-1kg.webp', updated_at = now() WHERE image_url = '/images/products/chispas-chocolate-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/chispas-chocolate-1kg.jpg' THEN '/images/products/chispas-chocolate-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/chispas-chocolate-1kg.jpg"]'::jsonb;

-- chocolate-de-mesa-1kg
UPDATE products SET image_url = '/images/products/chocolate-de-mesa-1kg.webp', updated_at = now() WHERE image_url = '/images/products/chocolate-de-mesa-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/chocolate-de-mesa-1kg.jpg' THEN '/images/products/chocolate-de-mesa-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/chocolate-de-mesa-1kg.jpg"]'::jsonb;

-- chorizo-argentino-1kg
UPDATE products SET image_url = '/images/products/chorizo-argentino-1kg.webp', updated_at = now() WHERE image_url = '/images/products/chorizo-argentino-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/chorizo-argentino-1kg.jpg' THEN '/images/products/chorizo-argentino-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/chorizo-argentino-1kg.jpg"]'::jsonb;

-- cilantro-fresco
UPDATE products SET image_url = '/images/products/cilantro-fresco.webp', updated_at = now() WHERE image_url = '/images/products/cilantro-fresco.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/cilantro-fresco.jpg' THEN '/images/products/cilantro-fresco.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/cilantro-fresco.jpg"]'::jsonb;

-- cocoa-en-polvo-1kg
UPDATE products SET image_url = '/images/products/cocoa-en-polvo-1kg.webp', updated_at = now() WHERE image_url = '/images/products/cocoa-en-polvo-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/cocoa-en-polvo-1kg.jpg' THEN '/images/products/cocoa-en-polvo-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/cocoa-en-polvo-1kg.jpg"]'::jsonb;

-- comino-molido-250g
UPDATE products SET image_url = '/images/products/comino-molido-250g.webp', updated_at = now() WHERE image_url = '/images/products/comino-molido-250g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/comino-molido-250g.jpg' THEN '/images/products/comino-molido-250g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/comino-molido-250g.jpg"]'::jsonb;

-- crema-acida-1l
UPDATE products SET image_url = '/images/products/crema-acida-1l.webp', updated_at = now() WHERE image_url = '/images/products/crema-acida-1l.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/crema-acida-1l.jpg' THEN '/images/products/crema-acida-1l.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/crema-acida-1l.jpg"]'::jsonb;

-- espinaca-fresca-500g
UPDATE products SET image_url = '/images/products/espinaca-fresca-500g.webp', updated_at = now() WHERE image_url = '/images/products/espinaca-fresca-500g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/espinaca-fresca-500g.jpg' THEN '/images/products/espinaca-fresca-500g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/espinaca-fresca-500g.jpg"]'::jsonb;

-- filete-tilapia-1kg
UPDATE products SET image_url = '/images/products/filete-tilapia-1kg.webp', updated_at = now() WHERE image_url = '/images/products/filete-tilapia-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/filete-tilapia-1kg.jpg' THEN '/images/products/filete-tilapia-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/filete-tilapia-1kg.jpg"]'::jsonb;

-- fresas-congeladas-2-5kg
UPDATE products SET image_url = '/images/products/fresas-congeladas-2-5kg.webp', updated_at = now() WHERE image_url = '/images/products/fresas-congeladas-2-5kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/fresas-congeladas-2-5kg.jpg' THEN '/images/products/fresas-congeladas-2-5kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/fresas-congeladas-2-5kg.jpg"]'::jsonb;

-- frijoles-refritos-lata-3
UPDATE products SET image_url = '/images/products/frijoles-refritos-lata-3.webp', updated_at = now() WHERE image_url = '/images/products/frijoles-refritos-lata-3.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/frijoles-refritos-lata-3.jpg' THEN '/images/products/frijoles-refritos-lata-3.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/frijoles-refritos-lata-3.jpg"]'::jsonb;

-- garbanzos-1kg
UPDATE products SET image_url = '/images/products/garbanzos-1kg.webp', updated_at = now() WHERE image_url = '/images/products/garbanzos-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/garbanzos-1kg.jpg' THEN '/images/products/garbanzos-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/garbanzos-1kg.jpg"]'::jsonb;

-- harina-pan-1kg
UPDATE products SET image_url = '/images/products/harina-pan-1kg.webp', updated_at = now() WHERE image_url = '/images/products/harina-pan-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/harina-pan-1kg.jpg' THEN '/images/products/harina-pan-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/harina-pan-1kg.jpg"]'::jsonb;

-- harina-preparada-pastel-5
UPDATE products SET image_url = '/images/products/harina-preparada-pastel-5.webp', updated_at = now() WHERE image_url = '/images/products/harina-preparada-pastel-5.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/harina-preparada-pastel-5.jpg' THEN '/images/products/harina-preparada-pastel-5.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/harina-preparada-pastel-5.jpg"]'::jsonb;

-- hot-cake-mix-5kg
UPDATE products SET image_url = '/images/products/hot-cake-mix-5kg.webp', updated_at = now() WHERE image_url = '/images/products/hot-cake-mix-5kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/hot-cake-mix-5kg.jpg' THEN '/images/products/hot-cake-mix-5kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/hot-cake-mix-5kg.jpg"]'::jsonb;

-- jarabe-caramelo-1l
UPDATE products SET image_url = '/images/products/jarabe-caramelo-1l.webp', updated_at = now() WHERE image_url = '/images/products/jarabe-caramelo-1l.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/jarabe-caramelo-1l.jpg' THEN '/images/products/jarabe-caramelo-1l.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/jarabe-caramelo-1l.jpg"]'::jsonb;

-- jarabe-natural-limonada-1
UPDATE products SET image_url = '/images/products/jarabe-natural-limonada-1.webp', updated_at = now() WHERE image_url = '/images/products/jarabe-natural-limonada-1.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/jarabe-natural-limonada-1.jpg' THEN '/images/products/jarabe-natural-limonada-1.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/jarabe-natural-limonada-1.jpg"]'::jsonb;

-- jarabe-vainilla-1l
UPDATE products SET image_url = '/images/products/jarabe-vainilla-1l.webp', updated_at = now() WHERE image_url = '/images/products/jarabe-vainilla-1l.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/jarabe-vainilla-1l.jpg' THEN '/images/products/jarabe-vainilla-1l.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/jarabe-vainilla-1l.jpg"]'::jsonb;

-- jengibre-fresco-500g
UPDATE products SET image_url = '/images/products/jengibre-fresco-500g.webp', updated_at = now() WHERE image_url = '/images/products/jengibre-fresco-500g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/jengibre-fresco-500g.jpg' THEN '/images/products/jengibre-fresco-500g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/jengibre-fresco-500g.jpg"]'::jsonb;

-- jitomate-bola
UPDATE products SET image_url = '/images/products/jitomate-bola.webp', updated_at = now() WHERE image_url = '/images/products/jitomate-bola.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/jitomate-bola.jpg' THEN '/images/products/jitomate-bola.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/jitomate-bola.jpg"]'::jsonb;

-- kale-fresco-500g
UPDATE products SET image_url = '/images/products/kale-fresco-500g.webp', updated_at = now() WHERE image_url = '/images/products/kale-fresco-500g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/kale-fresco-500g.jpg' THEN '/images/products/kale-fresco-500g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/kale-fresco-500g.jpg"]'::jsonb;

-- lechuga-iceberg
UPDATE products SET image_url = '/images/products/lechuga-iceberg.webp', updated_at = now() WHERE image_url = '/images/products/lechuga-iceberg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/lechuga-iceberg.jpg' THEN '/images/products/lechuga-iceberg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/lechuga-iceberg.jpg"]'::jsonb;

-- lechuga-romana
UPDATE products SET image_url = '/images/products/lechuga-romana.webp', updated_at = now() WHERE image_url = '/images/products/lechuga-romana.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/lechuga-romana.jpg' THEN '/images/products/lechuga-romana.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/lechuga-romana.jpg"]'::jsonb;

-- limon-agrio-2kg
UPDATE products SET image_url = '/images/products/limon-agrio-2kg.webp', updated_at = now() WHERE image_url = '/images/products/limon-agrio-2kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/limon-agrio-2kg.jpg' THEN '/images/products/limon-agrio-2kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/limon-agrio-2kg.jpg"]'::jsonb;

-- manteca-de-cerdo-1kg
UPDATE products SET image_url = '/images/products/manteca-de-cerdo-1kg.webp', updated_at = now() WHERE image_url = '/images/products/manteca-de-cerdo-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/manteca-de-cerdo-1kg.jpg' THEN '/images/products/manteca-de-cerdo-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/manteca-de-cerdo-1kg.jpg"]'::jsonb;

-- mermelada-fresa-1kg
UPDATE products SET image_url = '/images/products/mermelada-fresa-1kg.webp', updated_at = now() WHERE image_url = '/images/products/mermelada-fresa-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/mermelada-fresa-1kg.jpg' THEN '/images/products/mermelada-fresa-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/mermelada-fresa-1kg.jpg"]'::jsonb;

-- miel-abeja-1kg
UPDATE products SET image_url = '/images/products/miel-abeja-1kg.webp', updated_at = now() WHERE image_url = '/images/products/miel-abeja-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/miel-abeja-1kg.jpg' THEN '/images/products/miel-abeja-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/miel-abeja-1kg.jpg"]'::jsonb;

-- nutella-1kg
UPDATE products SET image_url = '/images/products/nutella-1kg.webp', updated_at = now() WHERE image_url = '/images/products/nutella-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/nutella-1kg.jpg' THEN '/images/products/nutella-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/nutella-1kg.jpg"]'::jsonb;

-- oregano-seco-250g
UPDATE products SET image_url = '/images/products/oregano-seco-250g.webp', updated_at = now() WHERE image_url = '/images/products/oregano-seco-250g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/oregano-seco-250g.jpg' THEN '/images/products/oregano-seco-250g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/oregano-seco-250g.jpg"]'::jsonb;

-- pan-molido-1kg
UPDATE products SET image_url = '/images/products/pan-molido-1kg.webp', updated_at = now() WHERE image_url = '/images/products/pan-molido-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/pan-molido-1kg.jpg' THEN '/images/products/pan-molido-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/pan-molido-1kg.jpg"]'::jsonb;

-- pasta-penne-5kg
UPDATE products SET image_url = '/images/products/pasta-penne-5kg.webp', updated_at = now() WHERE image_url = '/images/products/pasta-penne-5kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/pasta-penne-5kg.jpg' THEN '/images/products/pasta-penne-5kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/pasta-penne-5kg.jpg"]'::jsonb;

-- pasta-spaghetti-5kg
UPDATE products SET image_url = '/images/products/pasta-spaghetti-5kg.webp', updated_at = now() WHERE image_url = '/images/products/pasta-spaghetti-5kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/pasta-spaghetti-5kg.jpg' THEN '/images/products/pasta-spaghetti-5kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/pasta-spaghetti-5kg.jpg"]'::jsonb;

-- pimenton-dulce-250g
UPDATE products SET image_url = '/images/products/pimenton-dulce-250g.webp', updated_at = now() WHERE image_url = '/images/products/pimenton-dulce-250g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/pimenton-dulce-250g.jpg' THEN '/images/products/pimenton-dulce-250g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/pimenton-dulce-250g.jpg"]'::jsonb;

-- platano-macho-maduro-1k
UPDATE products SET image_url = '/images/products/platano-macho-maduro-1k.webp', updated_at = now() WHERE image_url = '/images/products/platano-macho-maduro-1k.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/platano-macho-maduro-1k.jpg' THEN '/images/products/platano-macho-maduro-1k.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/platano-macho-maduro-1k.jpg"]'::jsonb;

-- platano-macho-verde-1
UPDATE products SET image_url = '/images/products/platano-macho-verde-1.webp', updated_at = now() WHERE image_url = '/images/products/platano-macho-verde-1.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/platano-macho-verde-1.jpg' THEN '/images/products/platano-macho-verde-1.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/platano-macho-verde-1.jpg"]'::jsonb;

-- queso-americano-rebanado
UPDATE products SET image_url = '/images/products/queso-americano-rebanado.webp', updated_at = now() WHERE image_url = '/images/products/queso-americano-rebanado.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/queso-americano-rebanado.jpg' THEN '/images/products/queso-americano-rebanado.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/queso-americano-rebanado.jpg"]'::jsonb;

-- queso-fresco-1kg
UPDATE products SET image_url = '/images/products/queso-fresco-1kg.webp', updated_at = now() WHERE image_url = '/images/products/queso-fresco-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/queso-fresco-1kg.jpg' THEN '/images/products/queso-fresco-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/queso-fresco-1kg.jpg"]'::jsonb;

-- queso-provolone-parrilla
UPDATE products SET image_url = '/images/products/queso-provolone-parrilla.webp', updated_at = now() WHERE image_url = '/images/products/queso-provolone-parrilla.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/queso-provolone-parrilla.jpg' THEN '/images/products/queso-provolone-parrilla.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/queso-provolone-parrilla.jpg"]'::jsonb;

-- quinoa-1kg
UPDATE products SET image_url = '/images/products/quinoa-1kg.webp', updated_at = now() WHERE image_url = '/images/products/quinoa-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/quinoa-1kg.jpg' THEN '/images/products/quinoa-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/quinoa-1kg.jpg"]'::jsonb;

-- sal-de-grano-1kg
UPDATE products SET image_url = '/images/products/sal-de-grano-1kg.webp', updated_at = now() WHERE image_url = '/images/products/sal-de-grano-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/sal-de-grano-1kg.jpg' THEN '/images/products/sal-de-grano-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/sal-de-grano-1kg.jpg"]'::jsonb;

-- salsa-bbq-ahumada-1l
UPDATE products SET image_url = '/images/products/salsa-bbq-ahumada-1l.webp', updated_at = now() WHERE image_url = '/images/products/salsa-bbq-ahumada-1l.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/salsa-bbq-ahumada-1l.jpg' THEN '/images/products/salsa-bbq-ahumada-1l.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/salsa-bbq-ahumada-1l.jpg"]'::jsonb;

-- salsa-buffalo-1l
UPDATE products SET image_url = '/images/products/salsa-buffalo-1l.webp', updated_at = now() WHERE image_url = '/images/products/salsa-buffalo-1l.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/salsa-buffalo-1l.jpg' THEN '/images/products/salsa-buffalo-1l.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/salsa-buffalo-1l.jpg"]'::jsonb;

-- salsa-inglesa-500ml
UPDATE products SET image_url = '/images/products/salsa-inglesa-500ml.webp', updated_at = now() WHERE image_url = '/images/products/salsa-inglesa-500ml.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/salsa-inglesa-500ml.jpg' THEN '/images/products/salsa-inglesa-500ml.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/salsa-inglesa-500ml.jpg"]'::jsonb;

-- salsa-mango-habanero-50
UPDATE products SET image_url = '/images/products/salsa-mango-habanero-50.webp', updated_at = now() WHERE image_url = '/images/products/salsa-mango-habanero-50.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/salsa-mango-habanero-50.jpg' THEN '/images/products/salsa-mango-habanero-50.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/salsa-mango-habanero-50.jpg"]'::jsonb;

-- salsa-ostion-500ml
UPDATE products SET image_url = '/images/products/salsa-ostion-500ml.webp', updated_at = now() WHERE image_url = '/images/products/salsa-ostion-500ml.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/salsa-ostion-500ml.jpg' THEN '/images/products/salsa-ostion-500ml.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/salsa-ostion-500ml.jpg"]'::jsonb;

-- salsa-ranch-1l
UPDATE products SET image_url = '/images/products/salsa-ranch-1l.webp', updated_at = now() WHERE image_url = '/images/products/salsa-ranch-1l.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/salsa-ranch-1l.jpg' THEN '/images/products/salsa-ranch-1l.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/salsa-ranch-1l.jpg"]'::jsonb;

-- salsa-tomate-pizza-3kg
UPDATE products SET image_url = '/images/products/salsa-tomate-pizza-3kg.webp', updated_at = now() WHERE image_url = '/images/products/salsa-tomate-pizza-3kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/salsa-tomate-pizza-3kg.jpg' THEN '/images/products/salsa-tomate-pizza-3kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/salsa-tomate-pizza-3kg.jpg"]'::jsonb;

-- semillas-chia-500g
UPDATE products SET image_url = '/images/products/semillas-chia-500g.webp', updated_at = now() WHERE image_url = '/images/products/semillas-chia-500g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/semillas-chia-500g.jpg' THEN '/images/products/semillas-chia-500g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/semillas-chia-500g.jpg"]'::jsonb;

-- tahini-500g
UPDATE products SET image_url = '/images/products/tahini-500g.webp', updated_at = now() WHERE image_url = '/images/products/tahini-500g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/tahini-500g.jpg' THEN '/images/products/tahini-500g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/tahini-500g.jpg"]'::jsonb;

-- tocino-ahumado-1kg
UPDATE products SET image_url = '/images/products/tocino-ahumado-1kg.webp', updated_at = now() WHERE image_url = '/images/products/tocino-ahumado-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/tocino-ahumado-1kg.jpg' THEN '/images/products/tocino-ahumado-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/tocino-ahumado-1kg.jpg"]'::jsonb;

-- tomate-triturado-lata-2
UPDATE products SET image_url = '/images/products/tomate-triturado-lata-2.webp', updated_at = now() WHERE image_url = '/images/products/tomate-triturado-lata-2.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/tomate-triturado-lata-2.jpg' THEN '/images/products/tomate-triturado-lata-2.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/tomate-triturado-lata-2.jpg"]'::jsonb;

-- tomate-verde-1kg
UPDATE products SET image_url = '/images/products/tomate-verde-1kg.webp', updated_at = now() WHERE image_url = '/images/products/tomate-verde-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/tomate-verde-1kg.jpg' THEN '/images/products/tomate-verde-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/tomate-verde-1kg.jpg"]'::jsonb;

-- tortillas-harina-20pz
UPDATE products SET image_url = '/images/products/tortillas-harina-20pz.webp', updated_at = now() WHERE image_url = '/images/products/tortillas-harina-20pz.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/tortillas-harina-20pz.jpg' THEN '/images/products/tortillas-harina-20pz.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/tortillas-harina-20pz.jpg"]'::jsonb;

-- tostadas-ceviche-20pz
UPDATE products SET image_url = '/images/products/tostadas-ceviche-20pz.webp', updated_at = now() WHERE image_url = '/images/products/tostadas-ceviche-20pz.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/tostadas-ceviche-20pz.jpg' THEN '/images/products/tostadas-ceviche-20pz.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/tostadas-ceviche-20pz.jpg"]'::jsonb;

-- totopos-1kg
UPDATE products SET image_url = '/images/products/totopos-1kg.webp', updated_at = now() WHERE image_url = '/images/products/totopos-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/totopos-1kg.jpg' THEN '/images/products/totopos-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/totopos-1kg.jpg"]'::jsonb;

-- vasos-termicos-cafe-50pz
UPDATE products SET image_url = '/images/products/vasos-termicos-cafe-50pz.webp', updated_at = now() WHERE image_url = '/images/products/vasos-termicos-cafe-50pz.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/vasos-termicos-cafe-50pz.jpg' THEN '/images/products/vasos-termicos-cafe-50pz.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/vasos-termicos-cafe-50pz.jpg"]'::jsonb;

-- vinagre-balsamico-500ml
UPDATE products SET image_url = '/images/products/vinagre-balsamico-500ml.webp', updated_at = now() WHERE image_url = '/images/products/vinagre-balsamico-500ml.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/vinagre-balsamico-500ml.jpg' THEN '/images/products/vinagre-balsamico-500ml.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/vinagre-balsamico-500ml.jpg"]'::jsonb;

-- vinagre-blanco-1l
UPDATE products SET image_url = '/images/products/vinagre-blanco-1l.webp', updated_at = now() WHERE image_url = '/images/products/vinagre-blanco-1l.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/vinagre-blanco-1l.jpg' THEN '/images/products/vinagre-blanco-1l.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/vinagre-blanco-1l.jpg"]'::jsonb;

-- wasabi-en-polvo-100g
UPDATE products SET image_url = '/images/products/wasabi-en-polvo-100g.webp', updated_at = now() WHERE image_url = '/images/products/wasabi-en-polvo-100g.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wasabi-en-polvo-100g.jpg' THEN '/images/products/wasabi-en-polvo-100g.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wasabi-en-polvo-100g.jpg"]'::jsonb;

-- wiki-197
UPDATE products SET image_url = '/images/products/wiki-197.webp', updated_at = now() WHERE image_url = '/images/products/wiki-197.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-197.jpg' THEN '/images/products/wiki-197.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-197.jpg"]'::jsonb;

-- wiki-198
UPDATE products SET image_url = '/images/products/wiki-198.webp', updated_at = now() WHERE image_url = '/images/products/wiki-198.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-198.jpg' THEN '/images/products/wiki-198.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-198.jpg"]'::jsonb;

-- wiki-199
UPDATE products SET image_url = '/images/products/wiki-199.webp', updated_at = now() WHERE image_url = '/images/products/wiki-199.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-199.jpg' THEN '/images/products/wiki-199.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-199.jpg"]'::jsonb;

-- wiki-200
UPDATE products SET image_url = '/images/products/wiki-200.webp', updated_at = now() WHERE image_url = '/images/products/wiki-200.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-200.jpg' THEN '/images/products/wiki-200.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-200.jpg"]'::jsonb;

-- wiki-201
UPDATE products SET image_url = '/images/products/wiki-201.webp', updated_at = now() WHERE image_url = '/images/products/wiki-201.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-201.jpg' THEN '/images/products/wiki-201.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-201.jpg"]'::jsonb;

-- wiki-202
UPDATE products SET image_url = '/images/products/wiki-202.webp', updated_at = now() WHERE image_url = '/images/products/wiki-202.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-202.jpg' THEN '/images/products/wiki-202.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-202.jpg"]'::jsonb;

-- wiki-203
UPDATE products SET image_url = '/images/products/wiki-203.webp', updated_at = now() WHERE image_url = '/images/products/wiki-203.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-203.jpg' THEN '/images/products/wiki-203.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-203.jpg"]'::jsonb;

-- wiki-204
UPDATE products SET image_url = '/images/products/wiki-204.webp', updated_at = now() WHERE image_url = '/images/products/wiki-204.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-204.jpg' THEN '/images/products/wiki-204.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-204.jpg"]'::jsonb;

-- wiki-205
UPDATE products SET image_url = '/images/products/wiki-205.webp', updated_at = now() WHERE image_url = '/images/products/wiki-205.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-205.jpg' THEN '/images/products/wiki-205.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-205.jpg"]'::jsonb;

-- wiki-206
UPDATE products SET image_url = '/images/products/wiki-206.webp', updated_at = now() WHERE image_url = '/images/products/wiki-206.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-206.jpg' THEN '/images/products/wiki-206.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-206.jpg"]'::jsonb;

-- wiki-207
UPDATE products SET image_url = '/images/products/wiki-207.webp', updated_at = now() WHERE image_url = '/images/products/wiki-207.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-207.jpg' THEN '/images/products/wiki-207.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-207.jpg"]'::jsonb;

-- wiki-208
UPDATE products SET image_url = '/images/products/wiki-208.webp', updated_at = now() WHERE image_url = '/images/products/wiki-208.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-208.jpg' THEN '/images/products/wiki-208.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-208.jpg"]'::jsonb;

-- wiki-209
UPDATE products SET image_url = '/images/products/wiki-209.webp', updated_at = now() WHERE image_url = '/images/products/wiki-209.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-209.jpg' THEN '/images/products/wiki-209.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-209.jpg"]'::jsonb;

-- wiki-210
UPDATE products SET image_url = '/images/products/wiki-210.webp', updated_at = now() WHERE image_url = '/images/products/wiki-210.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-210.jpg' THEN '/images/products/wiki-210.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-210.jpg"]'::jsonb;

-- wiki-211
UPDATE products SET image_url = '/images/products/wiki-211.webp', updated_at = now() WHERE image_url = '/images/products/wiki-211.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-211.jpg' THEN '/images/products/wiki-211.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-211.jpg"]'::jsonb;

-- wiki-212
UPDATE products SET image_url = '/images/products/wiki-212.webp', updated_at = now() WHERE image_url = '/images/products/wiki-212.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-212.jpg' THEN '/images/products/wiki-212.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-212.jpg"]'::jsonb;

-- wiki-213
UPDATE products SET image_url = '/images/products/wiki-213.webp', updated_at = now() WHERE image_url = '/images/products/wiki-213.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-213.jpg' THEN '/images/products/wiki-213.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-213.jpg"]'::jsonb;

-- wiki-214
UPDATE products SET image_url = '/images/products/wiki-214.webp', updated_at = now() WHERE image_url = '/images/products/wiki-214.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-214.jpg' THEN '/images/products/wiki-214.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-214.jpg"]'::jsonb;

-- wiki-215
UPDATE products SET image_url = '/images/products/wiki-215.webp', updated_at = now() WHERE image_url = '/images/products/wiki-215.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-215.jpg' THEN '/images/products/wiki-215.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-215.jpg"]'::jsonb;

-- wiki-216
UPDATE products SET image_url = '/images/products/wiki-216.webp', updated_at = now() WHERE image_url = '/images/products/wiki-216.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-216.jpg' THEN '/images/products/wiki-216.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-216.jpg"]'::jsonb;

-- wiki-217
UPDATE products SET image_url = '/images/products/wiki-217.webp', updated_at = now() WHERE image_url = '/images/products/wiki-217.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-217.jpg' THEN '/images/products/wiki-217.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-217.jpg"]'::jsonb;

-- wiki-218
UPDATE products SET image_url = '/images/products/wiki-218.webp', updated_at = now() WHERE image_url = '/images/products/wiki-218.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-218.jpg' THEN '/images/products/wiki-218.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-218.jpg"]'::jsonb;

-- wiki-219
UPDATE products SET image_url = '/images/products/wiki-219.webp', updated_at = now() WHERE image_url = '/images/products/wiki-219.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-219.jpg' THEN '/images/products/wiki-219.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-219.jpg"]'::jsonb;

-- wiki-220
UPDATE products SET image_url = '/images/products/wiki-220.webp', updated_at = now() WHERE image_url = '/images/products/wiki-220.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-220.jpg' THEN '/images/products/wiki-220.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-220.jpg"]'::jsonb;

-- wiki-221
UPDATE products SET image_url = '/images/products/wiki-221.webp', updated_at = now() WHERE image_url = '/images/products/wiki-221.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/wiki-221.jpg' THEN '/images/products/wiki-221.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/wiki-221.jpg"]'::jsonb;

-- yogur-griego-natural-1k
UPDATE products SET image_url = '/images/products/yogur-griego-natural-1k.webp', updated_at = now() WHERE image_url = '/images/products/yogur-griego-natural-1k.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/yogur-griego-natural-1k.jpg' THEN '/images/products/yogur-griego-natural-1k.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/yogur-griego-natural-1k.jpg"]'::jsonb;

-- zanahoria-1kg
UPDATE products SET image_url = '/images/products/zanahoria-1kg.webp', updated_at = now() WHERE image_url = '/images/products/zanahoria-1kg.jpg';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/zanahoria-1kg.jpg' THEN '/images/products/zanahoria-1kg.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/zanahoria-1kg.jpg"]'::jsonb;

COMMIT;
