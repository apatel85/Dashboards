# Supabase migrations

Ready-to-run SQL that closes the server-side risks from
[`docs/SECURITY_STRESS_REVIEW_2026-07.md`](../../docs/SECURITY_STRESS_REVIEW_2026-07.md).
Plain-English background and the `curl` checks are in
[`docs/SUPABASE_SECURITY_GUIDE.md`](../../docs/SUPABASE_SECURITY_GUIDE.md).

Run them **in order**. Each is idempotent (safe to re-run).

| # | File | What it does | Priority |
|---|------|--------------|----------|
| 1 | `20260704000001_verify_license.sql` | `verify_license` RPC + lock `pl_licensed_users` so the public key can't harvest emails/keys | **Critical** |
| 2 | `20260704000002_pin_lockout.sql` | Lock out PIN brute-force (adds helpers + a 3-line integration into your `verify_user_pin`) | High |
| 3 | `20260704000003_access_log_lockdown.sql` | `pl_access_log` becomes insert-only for the public key | Medium |

## ⚠️ Order matters for #1

The app HTML already calls `rpc/verify_license`. **Run migration 1 before
deploying the current HTML** — until the function exists, sign-in fails closed.
Running the SQL first (or at the same time) makes both sign-in paths work.

Migration 2 is additive and does **not** modify your existing PIN functions; it
only adds a table + helpers. You wire it in with the 3 lines shown at the bottom
of that file.

## How to apply

**Option A — Supabase SQL Editor (simplest):** open each file, paste its contents
into a New query, and Run — in numeric order.

**Option B — Supabase CLI:** these follow the `supabase/migrations/` naming
convention, so from the repo root:

```bash
supabase link --project-ref iknfvddnevudpjtyxkbh
supabase db push
```

After each one, run the `curl` check in that file's footer to confirm the door
is shut, then sign in through the app to confirm real users still get in.
