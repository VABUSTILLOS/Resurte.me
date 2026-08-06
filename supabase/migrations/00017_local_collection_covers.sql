-- Migration 00017: Point collection covers to local compressed WebP
-- Replaces remote Wikimedia image_url values with bundled /images/collections/*.webp
-- Generated: 2026-08-06T06:02:21.114Z

BEGIN;

UPDATE restaurant_collections SET image_url = '/images/collections/burger.webp', updated_at = now() WHERE slug = 'hamburguesas-hot-dogs' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Hamburger_and_onion_rings.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/taqueria.webp', updated_at = now() WHERE slug = 'taquerias-antojitos' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/7/73/001_Tacos_de_carnitas%2C_carne_asada_y_al_pastor.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/sushi.webp', updated_at = now() WHERE slug = 'sushi-comida-asiatica' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/3/37/Sushi_roll.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/pizza.webp', updated_at = now() WHERE slug = 'pizzas-comida-italiana' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/a/a3/Eq_it-na_pizza-margherita_sep2005_sml.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/pollo.webp', updated_at = now() WHERE slug = 'pollo-alitas' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/6/69/Home-Made-Fried-Chicken-Wings-2008.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/fonda.webp', updated_at = now() WHERE slug = 'comida-mexicana-corrida' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Chileajo.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/mariscos.webp', updated_at = now() WHERE slug = 'mariscos-pescados' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Seafood_and_fish_dish.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/cortes.webp', updated_at = now() WHERE slug = 'cortes-carne-asaderos' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/6/69/Steak_dinner.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/cafe.webp', updated_at = now() WHERE slug = 'cafeterias-crepas-desayunos' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/7/76/Coffee_cup.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/saludable.webp', updated_at = now() WHERE slug = 'saludable-ensaladas-pokes' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/8/89/Food-salad-healthy-vegetables-1_%2823959011279%29.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/postres.webp', updated_at = now() WHERE slug = 'postres-panaderia-helados' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Dessert-_coffee_jelly%2C_ginger_ice_cream_and_banana%2C_matcha_cake%2C_mochi_and_fruit.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/arabe.webp', updated_at = now() WHERE slug = 'comida-arabe-griega' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Shawarma.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/latina.webp', updated_at = now() WHERE slug = 'comida-venezolana-latina' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/0/05/Arepa.jpg';
UPDATE restaurant_collections SET image_url = '/images/collections/bebidas.webp', updated_at = now() WHERE slug = 'bebidas-bares-botanas' AND image_url = 'https://upload.wikimedia.org/wikipedia/commons/9/95/Beer_glass.jpg';

COMMIT;
