-- Replace all Unsplash product image URLs with resurte.me product detail pages
-- Each product gets https://resurte.me/es/p/{product_id}
UPDATE products
SET image_url = 'https://resurte.me/es/p/' || id::text,
    updated_at = now()
WHERE image_url LIKE '%images.unsplash.com%';

-- Replace store logo/banner Unsplash URLs with Wikimedia Commons
UPDATE stores
SET logo_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Mexican_central_de_abastos.jpg/640px-Mexican_central_de_abastos.jpg',
    banner_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Grocery_store_produce_section.jpg/1280px-Grocery_store_produce_section.jpg',
    updated_at = now()
WHERE slug = 'resurte-me' AND (logo_url LIKE '%images.unsplash.com%' OR banner_url LIKE '%images.unsplash.com%');

-- Verify: should return 0 rows
-- SELECT id, name, image_url FROM products WHERE image_url LIKE '%images.unsplash.com%';
-- SELECT id, name, logo_url, banner_url FROM stores WHERE logo_url LIKE '%images.unsplash.com%' OR banner_url LIKE '%images.unsplash.com%';
