-- Migration 00008: Allow anonymous addresses (nullable user_id)
-- Supports guest/anonymous checkout without requiring a profile

ALTER TABLE addresses
  ALTER COLUMN user_id DROP NOT NULL;
