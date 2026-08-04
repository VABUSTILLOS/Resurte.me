-- Migration 00009: Allow anonymous orders (nullable user_id)
-- Supports guest/anonymous checkout without requiring a profile

ALTER TABLE orders
  ALTER COLUMN user_id DROP NOT NULL;
