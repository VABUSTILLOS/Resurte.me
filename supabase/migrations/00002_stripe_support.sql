-- Resurte.me — Stripe payment support
-- Adds 'stripe' payment method and Stripe tracking columns to orders

-- 1. Add 'stripe' to payment_method enum
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'stripe';

-- 2. Add Stripe tracking columns to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

-- 3. Index for Stripe webhook lookups
CREATE INDEX IF NOT EXISTS idx_orders_stripe_pi ON orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_stripe_cs ON orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
