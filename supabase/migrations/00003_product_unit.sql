-- Resurte.me — Add unit column to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT;
