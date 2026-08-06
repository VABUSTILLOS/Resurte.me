-- Migration 00022: Restore the last 2 old-store (GCS) photos still missing.
-- Both products were confirmed to use generic recipe/ images while the old
-- site (resurte.com) has real photos. URLs validated HTTP 200.
--   * 330 Chile Chipotle -> https://storage.googleapis.com/takeapp/media/cmikteilk000404l1go0y4u8m.png
--   * 397 Zarzamora      -> https://storage.googleapis.com/takeapp/media/cmimkbfo9000a04jr6g1d34ed.png
-- NOTE: uses jsonb_build_array to avoid JSON literals with embedded double
--       quotes (copy-paste into SQL editors can corrupt those quotes).

BEGIN;

-- 330 Chile Chipotle
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmikteilk000404l1go0y4u8m.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmikteilk000404l1go0y4u8m.png'), updated_at = now() WHERE id = 330;

-- 397 Zarzamora
UPDATE products SET image_url = 'https://storage.googleapis.com/takeapp/media/cmimkbfo9000a04jr6g1d34ed.png', images = jsonb_build_array('https://storage.googleapis.com/takeapp/media/cmimkbfo9000a04jr6g1d34ed.png'), updated_at = now() WHERE id = 397;

COMMIT;
