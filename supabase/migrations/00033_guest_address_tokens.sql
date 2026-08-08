-- Migration 00033: Guest address tokens
-- Lets anonymous checkouts reuse their last address (same browser) and claim
-- those addresses after creating an account / signing in.
--
-- guest_token: UUID generated server-side during an anonymous checkout. NULL
-- for logged-in users (their addresses are already tied to user_id).
-- A token is single-tenant per browser: the client persists it in localStorage
-- and sends it back on the next guest order so the API can reuse the address.
-- When the user signs in, POST /api/addresses/claim links the rows to their
-- account and clears the token.

ALTER TABLE public.addresses
  ADD COLUMN guest_token TEXT;

CREATE INDEX IF NOT EXISTS idx_addresses_guest_token
  ON public.addresses (guest_token);
