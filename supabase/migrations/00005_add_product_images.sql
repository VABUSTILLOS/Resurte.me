-- Add JSONB images column to products table for multi-image support
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- Backfill images array from existing image_url for products that have one
UPDATE products SET images = jsonb_build_array(image_url) WHERE image_url IS NOT NULL AND (images IS NULL OR images = '[]'::jsonb);

COMMENT ON COLUMN products.images IS 'Array of image URLs for product gallery. First image is primary.';
