-- Migration 00020: Remove rival supermarket references and the SuKarne brand
-- Scope (confirmed with user): ONLY rival supermarket chains
-- (Carnemart, Alsuper, Soriana, HEB, Walmart, Costco, Sam's, Smart)
-- plus the SuKarne brand. Other commercial brands (Lala, Bachoco,
-- Coca-Cola, etc.) are intentionally left untouched.
--
-- Steps:
--   1) Replace SuKarne in products.name / description / brand -> 'Local'
--   2) Strip rival-supermarket names from products.tags (JSONB array)
--   3) Remove the "Carnemart" store and its product_stores / store_cities
--
-- Idempotent: safe to run again.

BEGIN;

-- 1) SuKarne -> 'Local' in products
UPDATE products
SET brand = 'Local'
WHERE brand ILIKE '%sukarne%';

UPDATE products
SET name = regexp_replace(name, 'SuKarne', 'Local', 'gi')
WHERE name ILIKE '%sukarne%';

UPDATE products
SET description = regexp_replace(description, 'SuKarne', 'Local', 'gi')
WHERE description ILIKE '%sukarne%';

-- 2) Strip rival-supermarket tags from products.tags
UPDATE products
SET tags = COALESCE(
  (
    SELECT jsonb_agg(tag)
    FROM jsonb_array_elements_text(tags) AS t(tag)
    WHERE NOT (
      tag ILIKE '%carnemart%' OR
      tag ILIKE '%alsuper%' OR
      tag ILIKE '%soriana%' OR
      tag ILIKE '%heb%' OR
      tag ILIKE '%walmart%' OR
      tag ILIKE '%costco%' OR
      tag ILIKE '%sams%' OR
      tag ILIKE '%sam''s%' OR
      tag ILIKE '%smart%'
    )
  ),
  '[]'::jsonb
)
WHERE tags IS NOT NULL;

-- 3) Remove the Carnemart store (idempotent; migration 00014 may already
-- have removed it). ON DELETE CASCADE covers product_stores / store_cities.
DELETE FROM product_stores
WHERE store_id IN (SELECT id FROM stores WHERE slug = 'carnemart');

DELETE FROM store_cities
WHERE store_id IN (SELECT id FROM stores WHERE slug = 'carnemart');

DELETE FROM stores
WHERE slug = 'carnemart';

COMMIT;
