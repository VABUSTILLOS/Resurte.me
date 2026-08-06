-- Migration 00014: Remove the Carnemart store (Resurte.me is the sole provider)
-- Deletes product_stores rows for the Carnemart store and the store itself.
-- product_stores.store_id and store_cities.store_id both have ON DELETE CASCADE,
-- so deleting the store row cascades cleanly.
BEGIN;

DELETE FROM product_stores
WHERE store_id IN (SELECT id FROM stores WHERE slug = 'carnemart');

DELETE FROM store_cities
WHERE store_id IN (SELECT id FROM stores WHERE slug = 'carnemart');

DELETE FROM stores
WHERE slug = 'carnemart';

COMMIT;
