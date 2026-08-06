-- Migration 00021: Restore old-store (GCS) images and fix broken .png image_urls
-- 1) 84 products whose image_url points at /images/products/{id}.png (404) are remapped to the
--    equivalent .webp file that exists locally and serves HTTP 200.
-- 2) 51 products that should use their original resurte.me store photos (storage.googleapis.com)
--    are re-pointed to the GCS URLs defined in update-images/route.ts IMAGE_UPDATES.
-- Generated: 2026-08-06T19:04:40.261374+00:00

BEGIN;

-- ============ Part 1: .png image_url -> .webp (84 products) ============
-- 7 Plátano Macho
UPDATE products SET image_url = '/images/products/7.webp', updated_at = now() WHERE image_url = '/images/products/7.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/7.png' THEN '/images/products/7.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/7.png"]'::jsonb;

-- 8 Fresa
UPDATE products SET image_url = '/images/products/8.webp', updated_at = now() WHERE image_url = '/images/products/8.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/8.png' THEN '/images/products/8.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/8.png"]'::jsonb;

-- 10 Mango Ataúlfo
UPDATE products SET image_url = '/images/products/10.webp', updated_at = now() WHERE image_url = '/images/products/10.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/10.png' THEN '/images/products/10.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/10.png"]'::jsonb;

-- 34 Epazote
UPDATE products SET image_url = '/images/products/34.webp', updated_at = now() WHERE image_url = '/images/products/34.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/34.png' THEN '/images/products/34.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/34.png"]'::jsonb;

-- 49 Hongo Portobello
UPDATE products SET image_url = '/images/products/49.webp', updated_at = now() WHERE image_url = '/images/products/49.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/49.png' THEN '/images/products/49.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/49.png"]'::jsonb;

-- 50 Champiñón
UPDATE products SET image_url = '/images/products/50.webp', updated_at = now() WHERE image_url = '/images/products/50.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/50.png' THEN '/images/products/50.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/50.png"]'::jsonb;

-- 51 Arroz Blanco 1kg
UPDATE products SET image_url = '/images/products/51.webp', updated_at = now() WHERE image_url = '/images/products/51.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/51.png' THEN '/images/products/51.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/51.png"]'::jsonb;

-- 52 Arroz Blanco 5kg
UPDATE products SET image_url = '/images/products/52.webp', updated_at = now() WHERE image_url = '/images/products/52.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/52.png' THEN '/images/products/52.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/52.png"]'::jsonb;

-- 53 Frijol Negro 1kg
UPDATE products SET image_url = '/images/products/53.webp', updated_at = now() WHERE image_url = '/images/products/53.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/53.png' THEN '/images/products/53.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/53.png"]'::jsonb;

-- 54 Frijol Negro 5kg
UPDATE products SET image_url = '/images/products/54.webp', updated_at = now() WHERE image_url = '/images/products/54.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/54.png' THEN '/images/products/54.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/54.png"]'::jsonb;

-- 55 Frijol Bayo 1kg
UPDATE products SET image_url = '/images/products/55.webp', updated_at = now() WHERE image_url = '/images/products/55.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/55.png' THEN '/images/products/55.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/55.png"]'::jsonb;

-- 56 Frijol Peruano 1kg
UPDATE products SET image_url = '/images/products/56.webp', updated_at = now() WHERE image_url = '/images/products/56.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/56.png' THEN '/images/products/56.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/56.png"]'::jsonb;

-- 57 Lenteja 1kg
UPDATE products SET image_url = '/images/products/57.webp', updated_at = now() WHERE image_url = '/images/products/57.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/57.png' THEN '/images/products/57.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/57.png"]'::jsonb;

-- 59 Aceite de Canola 1L
UPDATE products SET image_url = '/images/products/59.webp', updated_at = now() WHERE image_url = '/images/products/59.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/59.png' THEN '/images/products/59.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/59.png"]'::jsonb;

-- 60 Aceite de Canola 5L
UPDATE products SET image_url = '/images/products/60.webp', updated_at = now() WHERE image_url = '/images/products/60.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/60.png' THEN '/images/products/60.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/60.png"]'::jsonb;

-- 61 Aceite de Maíz 1L
UPDATE products SET image_url = '/images/products/61.webp', updated_at = now() WHERE image_url = '/images/products/61.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/61.png' THEN '/images/products/61.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/61.png"]'::jsonb;

-- 64 Pasta Spaghetti 500g
UPDATE products SET image_url = '/images/products/64.webp', updated_at = now() WHERE image_url = '/images/products/64.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/64.png' THEN '/images/products/64.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/64.png"]'::jsonb;

-- 68 Harina de Trigo 1kg
UPDATE products SET image_url = '/images/products/68.webp', updated_at = now() WHERE image_url = '/images/products/68.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/68.png' THEN '/images/products/68.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/68.png"]'::jsonb;

-- 71 Sal de Mar Fina 1kg
UPDATE products SET image_url = '/images/products/71.webp', updated_at = now() WHERE image_url = '/images/products/71.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/71.png' THEN '/images/products/71.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/71.png"]'::jsonb;

-- 72 Sal Gruesa 1kg
UPDATE products SET image_url = '/images/products/72.webp', updated_at = now() WHERE image_url = '/images/products/72.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/72.png' THEN '/images/products/72.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/72.png"]'::jsonb;

-- 75 Orégano Molido 100g
UPDATE products SET image_url = '/images/products/75.webp', updated_at = now() WHERE image_url = '/images/products/75.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/75.png' THEN '/images/products/75.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/75.png"]'::jsonb;

-- 77 Salsa Maggi 200ml
UPDATE products SET image_url = '/images/products/77.webp', updated_at = now() WHERE image_url = '/images/products/77.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/77.png' THEN '/images/products/77.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/77.png"]'::jsonb;

-- 80 Catsup 1kg
UPDATE products SET image_url = '/images/products/80.webp', updated_at = now() WHERE image_url = '/images/products/80.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/80.png' THEN '/images/products/80.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/80.png"]'::jsonb;

-- 81 Mayonesa 1kg
UPDATE products SET image_url = '/images/products/81.webp', updated_at = now() WHERE image_url = '/images/products/81.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/81.png' THEN '/images/products/81.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/81.png"]'::jsonb;

-- 83 Consomé de Pollo 1kg
UPDATE products SET image_url = '/images/products/83.webp', updated_at = now() WHERE image_url = '/images/products/83.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/83.png' THEN '/images/products/83.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/83.png"]'::jsonb;

-- 85 Vinagre Blanco 1L
UPDATE products SET image_url = '/images/products/85.webp', updated_at = now() WHERE image_url = '/images/products/85.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/85.png' THEN '/images/products/85.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/85.png"]'::jsonb;

-- 90 Leche Descremada 1L
UPDATE products SET image_url = '/images/products/90.webp', updated_at = now() WHERE image_url = '/images/products/90.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/90.png' THEN '/images/products/90.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/90.png"]'::jsonb;

-- 91 Leche Evaporada 360ml
UPDATE products SET image_url = '/images/products/91.webp', updated_at = now() WHERE image_url = '/images/products/91.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/91.png' THEN '/images/products/91.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/91.png"]'::jsonb;

-- 92 Media Crema 240ml
UPDATE products SET image_url = '/images/products/92.webp', updated_at = now() WHERE image_url = '/images/products/92.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/92.png' THEN '/images/products/92.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/92.png"]'::jsonb;

-- 93 Leche Condensada 370ml
UPDATE products SET image_url = '/images/products/93.webp', updated_at = now() WHERE image_url = '/images/products/93.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/93.png' THEN '/images/products/93.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/93.png"]'::jsonb;

-- 96 Huevo Rojo 18pz
UPDATE products SET image_url = '/images/products/96.webp', updated_at = now() WHERE image_url = '/images/products/96.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/96.png' THEN '/images/products/96.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/96.png"]'::jsonb;

-- 97 Queso Oaxaca 400g
UPDATE products SET image_url = '/images/products/97.webp', updated_at = now() WHERE image_url = '/images/products/97.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/97.png' THEN '/images/products/97.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/97.png"]'::jsonb;

-- 98 Queso Fresco 500g
UPDATE products SET image_url = '/images/products/98.webp', updated_at = now() WHERE image_url = '/images/products/98.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/98.png' THEN '/images/products/98.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/98.png"]'::jsonb;

-- 99 Queso Panela 400g
UPDATE products SET image_url = '/images/products/99.webp', updated_at = now() WHERE image_url = '/images/products/99.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/99.png' THEN '/images/products/99.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/99.png"]'::jsonb;

-- 100 Queso Manchego 400g
UPDATE products SET image_url = '/images/products/100.webp', updated_at = now() WHERE image_url = '/images/products/100.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/100.png' THEN '/images/products/100.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/100.png"]'::jsonb;

-- 102 Yogurt Natural 1L
UPDATE products SET image_url = '/images/products/102.webp', updated_at = now() WHERE image_url = '/images/products/102.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/102.png' THEN '/images/products/102.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/102.png"]'::jsonb;

-- 105 Pechuga de Pollo
UPDATE products SET image_url = '/images/products/105.webp', updated_at = now() WHERE image_url = '/images/products/105.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/105.png' THEN '/images/products/105.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/105.png"]'::jsonb;

-- 106 Milanesa de Pollo
UPDATE products SET image_url = '/images/products/106.webp', updated_at = now() WHERE image_url = '/images/products/106.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/106.png' THEN '/images/products/106.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/106.png"]'::jsonb;

-- 107 Pierna y Muslo de Pollo
UPDATE products SET image_url = '/images/products/107.webp', updated_at = now() WHERE image_url = '/images/products/107.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/107.png' THEN '/images/products/107.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/107.png"]'::jsonb;

-- 108 Alitas de Pollo
UPDATE products SET image_url = '/images/products/108.webp', updated_at = now() WHERE image_url = '/images/products/108.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/108.png' THEN '/images/products/108.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/108.png"]'::jsonb;

-- 111 Milanesa de Res
UPDATE products SET image_url = '/images/products/111.webp', updated_at = now() WHERE image_url = '/images/products/111.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/111.png' THEN '/images/products/111.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/111.png"]'::jsonb;

-- 112 Carne Molida 80/20
UPDATE products SET image_url = '/images/products/112.webp', updated_at = now() WHERE image_url = '/images/products/112.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/112.png' THEN '/images/products/112.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/112.png"]'::jsonb;

-- 113 Diezmillo de Res
UPDATE products SET image_url = '/images/products/113.webp', updated_at = now() WHERE image_url = '/images/products/113.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/113.png' THEN '/images/products/113.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/113.png"]'::jsonb;

-- 116 Arrachera
UPDATE products SET image_url = '/images/products/116.webp', updated_at = now() WHERE image_url = '/images/products/116.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/116.png' THEN '/images/products/116.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/116.png"]'::jsonb;

-- 117 Ribeye
UPDATE products SET image_url = '/images/products/117.webp', updated_at = now() WHERE image_url = '/images/products/117.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/117.png' THEN '/images/products/117.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/117.png"]'::jsonb;

-- 118 T-Bone
UPDATE products SET image_url = '/images/products/118.webp', updated_at = now() WHERE image_url = '/images/products/118.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/118.png' THEN '/images/products/118.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/118.png"]'::jsonb;

-- 119 Chuleta de Cerdo
UPDATE products SET image_url = '/images/products/119.webp', updated_at = now() WHERE image_url = '/images/products/119.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/119.png' THEN '/images/products/119.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/119.png"]'::jsonb;

-- 120 Lomo de Cerdo
UPDATE products SET image_url = '/images/products/120.webp', updated_at = now() WHERE image_url = '/images/products/120.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/120.png' THEN '/images/products/120.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/120.png"]'::jsonb;

-- 121 Costilla de Cerdo
UPDATE products SET image_url = '/images/products/121.webp', updated_at = now() WHERE image_url = '/images/products/121.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/121.png' THEN '/images/products/121.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/121.png"]'::jsonb;

-- 122 Tocino
UPDATE products SET image_url = '/images/products/122.webp', updated_at = now() WHERE image_url = '/images/products/122.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/122.png' THEN '/images/products/122.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/122.png"]'::jsonb;

-- 123 Jamón de Pierna
UPDATE products SET image_url = '/images/products/123.webp', updated_at = now() WHERE image_url = '/images/products/123.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/123.png' THEN '/images/products/123.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/123.png"]'::jsonb;

-- 124 Chorizo
UPDATE products SET image_url = '/images/products/124.webp', updated_at = now() WHERE image_url = '/images/products/124.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/124.png' THEN '/images/products/124.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/124.png"]'::jsonb;

-- 126 Filete de Tilapia
UPDATE products SET image_url = '/images/products/126.webp', updated_at = now() WHERE image_url = '/images/products/126.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/126.png' THEN '/images/products/126.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/126.png"]'::jsonb;

-- 127 Filete de Basa
UPDATE products SET image_url = '/images/products/127.webp', updated_at = now() WHERE image_url = '/images/products/127.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/127.png' THEN '/images/products/127.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/127.png"]'::jsonb;

-- 128 Camarón Pacotilla
UPDATE products SET image_url = '/images/products/128.webp', updated_at = now() WHERE image_url = '/images/products/128.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/128.png' THEN '/images/products/128.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/128.png"]'::jsonb;

-- 129 Camarón U12-U15
UPDATE products SET image_url = '/images/products/129.webp', updated_at = now() WHERE image_url = '/images/products/129.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/129.png' THEN '/images/products/129.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/129.png"]'::jsonb;

-- 130 Pulpo
UPDATE products SET image_url = '/images/products/130.webp', updated_at = now() WHERE image_url = '/images/products/130.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/130.png' THEN '/images/products/130.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/130.png"]'::jsonb;

-- 131 Mojarra Entera
UPDATE products SET image_url = '/images/products/131.webp', updated_at = now() WHERE image_url = '/images/products/131.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/131.png' THEN '/images/products/131.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/131.png"]'::jsonb;

-- 132 Huachinango Entero
UPDATE products SET image_url = '/images/products/132.webp', updated_at = now() WHERE image_url = '/images/products/132.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/132.png' THEN '/images/products/132.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/132.png"]'::jsonb;

-- 133 Camarón Seco
UPDATE products SET image_url = '/images/products/133.webp', updated_at = now() WHERE image_url = '/images/products/133.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/133.png' THEN '/images/products/133.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/133.png"]'::jsonb;

-- 134 Salmón
UPDATE products SET image_url = '/images/products/134.webp', updated_at = now() WHERE image_url = '/images/products/134.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/134.png' THEN '/images/products/134.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/134.png"]'::jsonb;

-- 137 Pan para Hot Dog
UPDATE products SET image_url = '/images/products/137.webp', updated_at = now() WHERE image_url = '/images/products/137.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/137.png' THEN '/images/products/137.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/137.png"]'::jsonb;

-- 138 Pan para Hamburguesa
UPDATE products SET image_url = '/images/products/138.webp', updated_at = now() WHERE image_url = '/images/products/138.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/138.png' THEN '/images/products/138.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/138.png"]'::jsonb;

-- 147 Sprite 2L
UPDATE products SET image_url = '/images/products/147.webp', updated_at = now() WHERE image_url = '/images/products/147.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/147.png' THEN '/images/products/147.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/147.png"]'::jsonb;

-- 149 Sidral Mundet 2L
UPDATE products SET image_url = '/images/products/149.webp', updated_at = now() WHERE image_url = '/images/products/149.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/149.png' THEN '/images/products/149.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/149.png"]'::jsonb;

-- 150 Agua Bonafont 1.5L
UPDATE products SET image_url = '/images/products/150.webp', updated_at = now() WHERE image_url = '/images/products/150.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/150.png' THEN '/images/products/150.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/150.png"]'::jsonb;

-- 151 Agua Mineral 1.5L
UPDATE products SET image_url = '/images/products/151.webp', updated_at = now() WHERE image_url = '/images/products/151.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/151.png' THEN '/images/products/151.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/151.png"]'::jsonb;

-- 152 Agua Mineral Saborizada 1.5L
UPDATE products SET image_url = '/images/products/152.webp', updated_at = now() WHERE image_url = '/images/products/152.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/152.png' THEN '/images/products/152.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/152.png"]'::jsonb;

-- 160 Sabritas Clásicas 170g
UPDATE products SET image_url = '/images/products/160.webp', updated_at = now() WHERE image_url = '/images/products/160.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/160.png' THEN '/images/products/160.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/160.png"]'::jsonb;

-- 162 Cacahuate Salado 200g
UPDATE products SET image_url = '/images/products/162.webp', updated_at = now() WHERE image_url = '/images/products/162.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/162.png' THEN '/images/products/162.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/162.png"]'::jsonb;

-- 163 Galletas Marías 200g
UPDATE products SET image_url = '/images/products/163.webp', updated_at = now() WHERE image_url = '/images/products/163.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/163.png' THEN '/images/products/163.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/163.png"]'::jsonb;

-- 164 Galletas Saladas 200g
UPDATE products SET image_url = '/images/products/164.webp', updated_at = now() WHERE image_url = '/images/products/164.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/164.png' THEN '/images/products/164.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/164.png"]'::jsonb;

-- 169 Detergente Líquido 1L
UPDATE products SET image_url = '/images/products/169.webp', updated_at = now() WHERE image_url = '/images/products/169.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/169.png' THEN '/images/products/169.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/169.png"]'::jsonb;

-- 170 Detergente en Polvo 1kg
UPDATE products SET image_url = '/images/products/170.webp', updated_at = now() WHERE image_url = '/images/products/170.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/170.png' THEN '/images/products/170.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/170.png"]'::jsonb;

-- 172 Limpiador Multiusos 500ml
UPDATE products SET image_url = '/images/products/172.webp', updated_at = now() WHERE image_url = '/images/products/172.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/172.png' THEN '/images/products/172.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/172.png"]'::jsonb;

-- 173 Limpiavidrios 500ml
UPDATE products SET image_url = '/images/products/173.webp', updated_at = now() WHERE image_url = '/images/products/173.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/173.png' THEN '/images/products/173.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/173.png"]'::jsonb;

-- 175 Fibras para Trastes 3pz
UPDATE products SET image_url = '/images/products/175.webp', updated_at = now() WHERE image_url = '/images/products/175.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/175.png' THEN '/images/products/175.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/175.png"]'::jsonb;

-- 177 Servilletas 100pz
UPDATE products SET image_url = '/images/products/177.webp', updated_at = now() WHERE image_url = '/images/products/177.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/177.png' THEN '/images/products/177.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/177.png"]'::jsonb;

-- 178 Papel de Cocina 2pz
UPDATE products SET image_url = '/images/products/178.webp', updated_at = now() WHERE image_url = '/images/products/178.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/178.png' THEN '/images/products/178.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/178.png"]'::jsonb;

-- 182 Helado Vainilla 1L
UPDATE products SET image_url = '/images/products/182.webp', updated_at = now() WHERE image_url = '/images/products/182.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/182.png' THEN '/images/products/182.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/182.png"]'::jsonb;

-- 183 Paletas de Hielo 12pz
UPDATE products SET image_url = '/images/products/183.webp', updated_at = now() WHERE image_url = '/images/products/183.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/183.png' THEN '/images/products/183.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/183.png"]'::jsonb;

-- 184 Filete de Tilapia Congelado 1kg
UPDATE products SET image_url = '/images/products/184.webp', updated_at = now() WHERE image_url = '/images/products/184.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/184.png' THEN '/images/products/184.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/184.png"]'::jsonb;

-- 185 Camarón Congelado 1kg
UPDATE products SET image_url = '/images/products/185.webp', updated_at = now() WHERE image_url = '/images/products/185.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/185.png' THEN '/images/products/185.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/185.png"]'::jsonb;

-- 186 Nuggets de Pollo 1kg
UPDATE products SET image_url = '/images/products/186.webp', updated_at = now() WHERE image_url = '/images/products/186.png';
UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/186.png' THEN '/images/products/186.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/186.png"]'::jsonb;


-- ============ Part 2: restore old-store GCS photos (51 products) ============
-- 1 Manzana Roja
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihp02pp000604l43fzq2ed7.png', images = '["https://storage.googleapis.com/takeapp/media/cmihp02pp000604l43fzq2ed7.png"]', updated_at = now() WHERE id = 1;

-- 2 Manzana Verde
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihov9fh001304ju8yfi21dq.png', images = '["https://storage.googleapis.com/takeapp/media/cmihov9fh001304ju8yfi21dq.png"]', updated_at = now() WHERE id = 2;

-- 3 Aguacate Hass
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihon5gm000f04jo8q5f7jdf.png', images = '["https://storage.googleapis.com/takeapp/media/cmihon5gm000f04jo8q5f7jdf.png"]', updated_at = now() WHERE id = 3;

-- 4 Naranja Valencia
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijnpm2z000904lbg1e59xve.png', images = '["https://storage.googleapis.com/takeapp/media/cmijnpm2z000904lbg1e59xve.png"]', updated_at = now() WHERE id = 4;

-- 5 Limón Agrio
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijp7zpj000404l40mtkbyuh.png', images = '["https://storage.googleapis.com/takeapp/media/cmijp7zpj000404l40mtkbyuh.png"]', updated_at = now() WHERE id = 5;

-- 6 Plátano Tabasco
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijo779j000204jz2yrwe753.png', images = '["https://storage.googleapis.com/takeapp/media/cmijo779j000204jz2yrwe753.png"]', updated_at = now() WHERE id = 6;

-- 9 Papaya Maradol
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijostxx001o04jv3tl8b2v9.png', images = '["https://storage.googleapis.com/takeapp/media/cmijostxx001o04jv3tl8b2v9.png"]', updated_at = now() WHERE id = 9;

-- 11 Mango Manila
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijwgf7r000904l738kc1xwb.png', images = '["https://storage.googleapis.com/takeapp/media/cmijwgf7r000904l738kc1xwb.png"]', updated_at = now() WHERE id = 11;

-- 12 Sandía
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijq38em001604l7hja83595.png', images = '["https://storage.googleapis.com/takeapp/media/cmijq38em001604l7hja83595.png"]', updated_at = now() WHERE id = 12;

-- 13 Melón Chino
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijy9mol000104jr05q555i9.png', images = '["https://storage.googleapis.com/takeapp/media/cmijy9mol000104jr05q555i9.png"]', updated_at = now() WHERE id = 13;

-- 14 Piña Miel
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijt78vd000304l7gky09s9z.png', images = '["https://storage.googleapis.com/takeapp/media/cmijt78vd000304l7gky09s9z.png"]', updated_at = now() WHERE id = 14;

-- 15 Toronja
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmil8aa8y001b04jodgx5fcbu.png', images = '["https://storage.googleapis.com/takeapp/media/cmil8aa8y001b04jodgx5fcbu.png"]', updated_at = now() WHERE id = 15;

-- 16 Uvas Verdes
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmikmo2xq000304l8d0pmawqd.png', images = '["https://storage.googleapis.com/takeapp/media/cmikmo2xq000304l8d0pmawqd.png"]', updated_at = now() WHERE id = 16;

-- 17 Uvas Rojas
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmikmw51n000304jz0r6shapj.png', images = '["https://storage.googleapis.com/takeapp/media/cmikmw51n000304jz0r6shapj.png"]', updated_at = now() WHERE id = 17;

-- 18 Guayaba
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijqtay4000604js048vejxu.png', images = '["https://storage.googleapis.com/takeapp/media/cmijqtay4000604js048vejxu.png"]', updated_at = now() WHERE id = 18;

-- 19 Mandarina
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijtu4fq000204jy1h4p53xa.png', images = '["https://storage.googleapis.com/takeapp/media/cmijtu4fq000204jy1h4p53xa.png"]', updated_at = now() WHERE id = 19;

-- 20 Jitomate Saladet
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihqyxja000b04l5h1s4euob.png', images = '["https://storage.googleapis.com/takeapp/media/cmihqyxja000b04l5h1s4euob.png"]', updated_at = now() WHERE id = 20;

-- 21 Jitomate Bola
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijjlfbn000504ie32jadi6o.png', images = '["https://storage.googleapis.com/takeapp/media/cmijjlfbn000504ie32jadi6o.png"]', updated_at = now() WHERE id = 21;

-- 22 Tomate Verde
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmigud8dq000n04jp1kc96rqk.png', images = '["https://storage.googleapis.com/takeapp/media/cmigud8dq000n04jp1kc96rqk.png"]', updated_at = now() WHERE id = 22;

-- 23 Cebolla Blanca
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihm7h13000104jsc7rz709l.png', images = '["https://storage.googleapis.com/takeapp/media/cmihm7h13000104jsc7rz709l.png"]', updated_at = now() WHERE id = 23;

-- 24 Cebolla Morada
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihm9eva000804kwbbsuf58x.png', images = '["https://storage.googleapis.com/takeapp/media/cmihm9eva000804kwbbsuf58x.png"]', updated_at = now() WHERE id = 24;

-- 25 Papa Blanca
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmifgtjlp000b04l5a5r89mmc.jpg', images = '["https://storage.googleapis.com/takeapp/media/cmifgtjlp000b04l5a5r89mmc.jpg"]', updated_at = now() WHERE id = 25;

-- 26 Papa Cambray
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmil9723z002s04jobceb395t.png', images = '["https://storage.googleapis.com/takeapp/media/cmil9723z002s04jobceb395t.png"]', updated_at = now() WHERE id = 26;

-- 27 Zanahoria
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmigh1lun000104lfbmdi5wgm.jpg', images = '["https://storage.googleapis.com/takeapp/media/cmigh1lun000104lfbmdi5wgm.jpg"]', updated_at = now() WHERE id = 27;

-- 28 Brócoli
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihn1bq8000604l53jdqdh3t.png', images = '["https://storage.googleapis.com/takeapp/media/cmihn1bq8000604l53jdqdh3t.png"]', updated_at = now() WHERE id = 28;

-- 29 Coliflor
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihlx4ko000004jp6pn34jcc.png', images = '["https://storage.googleapis.com/takeapp/media/cmihlx4ko000004jp6pn34jcc.png"]', updated_at = now() WHERE id = 29;

-- 30 Lechuga Romana
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmiguf9xj000c04ih2kpi7szc.png', images = '["https://storage.googleapis.com/takeapp/media/cmiguf9xj000c04ih2kpi7szc.png"]', updated_at = now() WHERE id = 30;

-- 31 Espinaca
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihgsazp000204ib1z4gae1g.png', images = '["https://storage.googleapis.com/takeapp/media/cmihgsazp000204ib1z4gae1g.png"]', updated_at = now() WHERE id = 31;

-- 32 Cilantro
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmilwesph000704ikfang4orw.png', images = '["https://storage.googleapis.com/takeapp/media/cmilwesph000704ikfang4orw.png"]', updated_at = now() WHERE id = 32;

-- 33 Perejil
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmilw6t51000104jq0du3blee.png', images = '["https://storage.googleapis.com/takeapp/media/cmilw6t51000104jq0du3blee.png"]', updated_at = now() WHERE id = 33;

-- 35 Chile Serrano
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmikw8rii000104l7e1vfbfw3.png', images = '["https://storage.googleapis.com/takeapp/media/cmikw8rii000104l7e1vfbfw3.png"]', updated_at = now() WHERE id = 35;

-- 36 Chile Jalapeño
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijm5teg000704lbgiuf2ua2.png', images = '["https://storage.googleapis.com/takeapp/media/cmijm5teg000704lbgiuf2ua2.png"]', updated_at = now() WHERE id = 36;

-- 37 Chile Poblano
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmikz37kb000004l5d2653hrg.png', images = '["https://storage.googleapis.com/takeapp/media/cmikz37kb000004l5d2653hrg.png"]', updated_at = now() WHERE id = 37;

-- 38 Ajo
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihqf2pi000704la16zb486c.png', images = '["https://storage.googleapis.com/takeapp/media/cmihqf2pi000704la16zb486c.png"]', updated_at = now() WHERE id = 38;

-- 39 Pepino
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmij91iox000804l6hp3j6ul8.png', images = '["https://storage.googleapis.com/takeapp/media/cmij91iox000804l6hp3j6ul8.png"]', updated_at = now() WHERE id = 39;

-- 40 Calabacita
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijj1878000004k0bji0clqu.png', images = '["https://storage.googleapis.com/takeapp/media/cmijj1878000004k0bji0clqu.png"]', updated_at = now() WHERE id = 40;

-- 41 Chayote
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijn2j9r000304js6krldwj1.png', images = '["https://storage.googleapis.com/takeapp/media/cmijn2j9r000304js6krldwj1.png"]', updated_at = now() WHERE id = 41;

-- 42 Elote
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihhifyb000004jv1j7x5wbp.png', images = '["https://storage.googleapis.com/takeapp/media/cmihhifyb000004jv1j7x5wbp.png"]', updated_at = now() WHERE id = 42;

-- 43 Nopal
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmigufsl3000604l59l4of2yy.png', images = '["https://storage.googleapis.com/takeapp/media/cmigufsl3000604l59l4of2yy.png"]', updated_at = now() WHERE id = 43;

-- 44 Apio
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmijmdkue000004l5cl6t57qd.png', images = '["https://storage.googleapis.com/takeapp/media/cmijmdkue000004l5cl6t57qd.png"]', updated_at = now() WHERE id = 44;

-- 45 Betabel
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmikm2eyl000g04l9h841dwam.png', images = '["https://storage.googleapis.com/takeapp/media/cmikm2eyl000g04l9h841dwam.png"]', updated_at = now() WHERE id = 45;

-- 46 Col Blanca
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmihhsrrr000004jfc58l4cxz.png', images = '["https://storage.googleapis.com/takeapp/media/cmihhsrrr000004jfc58l4cxz.png"]', updated_at = now() WHERE id = 46;

-- 47 Chile Habanero
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmigr3lni000004l281j40gvp.jpg', images = '["https://storage.googleapis.com/takeapp/media/cmigr3lni000004l281j40gvp.jpg"]', updated_at = now() WHERE id = 47;

-- 48 Rábano
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmifh7a6k000004jpa7or85li.jpg', images = '["https://storage.googleapis.com/takeapp/media/cmifh7a6k000004jpa7or85li.jpg"]', updated_at = now() WHERE id = 48;

-- 94 Huevo Blanco 18pz
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp', images = '["https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp"]', updated_at = now() WHERE id = 94;

-- 95 Huevo Blanco Caja 30pz
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp', images = '["https://storage.googleapis.com/takeapp/media/cmidk59fi00000imqacaggoal.webp"]', updated_at = now() WHERE id = 95;

-- 101 Queso Crema 200g
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmidk5taj00000igwdgi364t0.webp', images = '["https://storage.googleapis.com/takeapp/media/cmidk5taj00000igwdgi364t0.webp"]', updated_at = now() WHERE id = 101;

-- 103 Crema Ácida 1L
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmidk5ahb00000ikx1fo4ebab.webp', images = '["https://storage.googleapis.com/takeapp/media/cmidk5ahb00000ikx1fo4ebab.webp"]', updated_at = now() WHERE id = 103;

-- 104 Mantequilla sin Sal 200g
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmidk5ucg00000ijff55kb0k6.webp', images = '["https://storage.googleapis.com/takeapp/media/cmidk5ucg00000ijff55kb0k6.webp"]', updated_at = now() WHERE id = 104;

-- 115 Costilla de Res
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmigudmvx000p04jp7knq43u4.png', images = '["https://storage.googleapis.com/takeapp/media/cmigudmvx000p04jp7knq43u4.png"]', updated_at = now() WHERE id = 115;

-- 140 Tortillas de Harina
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmidk5ovr00000hka85jr5bzf.webp', images = '["https://storage.googleapis.com/takeapp/media/cmidk5ovr00000hka85jr5bzf.webp"]', updated_at = now() WHERE id = 140;

COMMIT;