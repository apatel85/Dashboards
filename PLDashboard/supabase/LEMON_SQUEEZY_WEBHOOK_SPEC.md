# Lemon Squeezy webhook → license key automation (SPEC — not yet implemented)

v9.0 ships with **manual** license-key issuance: Ankit creates the Lemon
Squeezy store + product, and issues keys via `admin.html` after each sale.
This spec describes the later automation so a future pass can implement it
without redesigning the data model.

## Goal

When a customer buys Pro on Lemon Squeezy, a license key is created
automatically and emailed to them — no manual admin step.

## Data model (already in `supabase/migrations/20261007000001_v9_auth.sql`)

- `pl_license_keys`: inventory of keys (`key`, `tier`, `status`,
  `issued_to_email`, `issued_at`, `redeemed_by`, `redeemed_at`).
- `redeem_license_key(p_email, p_key)`: marks a key redeemed and upserts the
  license row that `verify_license` reads at boot.

## Webhook flow (to build)

1. Lemon Squeezy → `POST /functions/v1/lemon-webhook` (Supabase Edge Function,
   not yet written) on `order_created`.
2. Verify the `X-Signature` header against the webhook secret (stored as an
   Edge Function secret — never in the repo).
3. On verification: generate a key (`PLV9-XXXX-XXXX`, crypto-random),
   `INSERT INTO pl_license_keys (key, tier, status) VALUES (..., 'pro', 'issued')`
   with `issued_to_email` = the order's customer email.
4. Email the key to the customer (Lemon Squeezy's built-in "license key"
   delivery can do this if the product is configured for license keys —
   preferred, zero code).
5. The customer redeems in-app (existing gate flow) → `redeem_license_key`
   activates their tier.

## Refunds / chargebacks

- On `order_refunded`: set the license row `status = 'suspended'`
  (v9 boot denies suspended licenses) and mark the key `status = 'revoked'`.
- Do NOT delete rows — keep the audit trail.

## Why manual first

Webhook automation needs an Edge Function + secret management + email
delivery testing. Manual issuance via the existing admin panel works today
and keeps v9.0 shippable; this spec is the build doc for v9.1+.
