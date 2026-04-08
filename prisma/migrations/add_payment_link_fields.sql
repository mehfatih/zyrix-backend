-- Migration: Add new fields to payment_links + create link_payments
-- Run on Railway PostgreSQL dashboard → Query tab

ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS description  TEXT,
  ADD COLUMN IF NOT EXISTS min_amount   DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS max_amount   DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS paid_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS features     TEXT,
  ADD COLUMN IF NOT EXISTS faqs         TEXT,
  ADD COLUMN IF NOT EXISTS allow_note   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_qr      BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE payment_links ALTER COLUMN amount DROP NOT NULL;

CREATE TABLE IF NOT EXISTS link_payments (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  link_id      TEXT NOT NULL REFERENCES payment_links(id) ON DELETE CASCADE,
  tx_id        TEXT UNIQUE NOT NULL,
  amount       DECIMAL(18,2) NOT NULL,
  currency     TEXT NOT NULL,
  payer_name   TEXT NOT NULL,
  payer_phone  TEXT NOT NULL,
  payer_note   TEXT,
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  status       TEXT NOT NULL DEFAULT 'COMPLETED',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
