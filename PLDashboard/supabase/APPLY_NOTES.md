# APPLY NOTES — P&L Dashboard v9 auth migration

Run these steps **in order** in the Supabase dashboard (project `iknfvddnevudpjtyxkbh`
→ SQL editor → New query). The v9 admin panel and app depend on this SQL.

---

## Step 1 — Apply the pre-v9 migrations (if not already applied)

They are idempotent — safe to re-run. Run each file's full contents as one query:

1. `supabase/migrations/20260704000001_verify_license.sql`
2. `supabase/migrations/20260704000002_pin_lockout.sql`
3. `supabase/migrations/20260704000003_access_log_lockdown.sql`

(The v9 migration calls the lockout helpers from #2 — it must exist first.)

## Step 2 — Apply the v9 migration

Run the full contents of `supabase/migrations/20260704000001_v9_auth.sql`
(actually named `20261007000001_v9_auth.sql`) as one query.

What it creates:
- Columns on `pl_licensed_users`: `tier` (default `'free'`), `redeemed_at`,
  `pin_hash`; uniqueness guard on `license_key`.
- `pl_license_keys` — mintable/redeemable key inventory.
- `pl_admins` — admin emails with **bcrypt-hashed** PINs (no plaintext anywhere).
- `pl_admin_sessions` — 12-hour session tokens.
- `pl_pin_reset_tokens` — single-use 1-hour PIN-reset tokens.
- Functions: `admin_login`, `admin_require_token` (server-side only),
  `admin_logout`, `admin_mint_license_key`, `admin_reset_user_pin` (v9 rewrite),
  `redeem_license_key`, `set_user_pin` / `verify_user_pin` /
  `check_user_has_pin` / `complete_pin_reset` (all bcrypt), and an extended
  `verify_license` that also returns `tier`.
- RLS on all new tables with **no** policies + `REVOKE` from anon/authenticated,
  so the public key can execute the RPCs but can never `SELECT` the tables.

## Step 3 — Seed your admin PIN (run once)

Replace the email and choose a 4-digit PIN. The PIN is hashed inside the
database — it is never stored or transmitted in plaintext afterwards.

```sql
insert into public.pl_admins(email, pin_hash)
values ('you@example.com',
        extensions.crypt('4821', extensions.gen_salt('bf')));
```

To change the PIN later, re-run with the new PIN (it overwrites via primary key):

```sql
insert into public.pl_admins(email, pin_hash)
values ('you@example.com',
        extensions.crypt('NEW_PIN', extensions.gen_salt('bf')))
on conflict (email) do update set pin_hash = excluded.pin_hash;
```

## Step 4 — Convert the live `admin_*` functions to the token flow

The hardened `admin.html` now sends `{p_token}` instead of `{p_email, p_pin}`.
Each live function below must be updated. (Their definitions were never checked
into the repo, so this step is manual — see "what I could not verify".)

**Functions to convert** (found from the admin panel's call sites):
`admin_get_stats`, `admin_list_users`, `admin_add_user`, `admin_update_user`,
`admin_delete_user`, `admin_create_coupon`, `admin_update_coupon`,
`admin_list_coupons`, `admin_list_access_log`.

**Do NOT convert** `admin_reset_user_pin` — the v9 migration already replaced it
with the `(p_token uuid, p_user_email text)` signature.

**Conversion recipe per function** (example with `admin_get_stats`):

```sql
-- 1) Drop the old signature (arg names/types change, so REPLACE is not enough):
drop function if exists public.admin_get_stats(text, text);

-- 2) Re-create with p_token as the first arg, keeping all other args identical:
create or replace function public.admin_get_stats(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- 3) First line: replaces the old PIN check. Raises on bad/expired token,
  --    so a forgotten check fails closed, never open:
  perform public.admin_require_token(p_token);

  -- ... rest of your existing function body, unchanged ...
end $$;

-- 4) Re-apply the execute grant (DROP removed it):
revoke all on function public.admin_get_stats(uuid) from public;
grant execute on function public.admin_get_stats(uuid) to anon, authenticated;
```

Apply the same pattern to each function: `(p_email text, p_pin text, …)` →
`(p_token uuid, …)`, first line `perform public.admin_require_token(p_token);`,
delete the old PIN-verification block, re-grant.

## Step 5 — Deploy the hardened `admin.html`

Only after Steps 2–4: the new `admin.html` calls `admin_login` once (PIN sent a
single time, hashed server-side), stores the returned **token** in
`sessionStorage` (never the PIN), and sends `{p_token}` on every admin call.
Deploying it before Step 4 will break the panel (old functions won't accept
`p_token`).

## Step 6 — Verification queries

Run in the SQL editor (you are `postgres` there):

```sql
-- 1) Admin PIN hash verifies (replace with your email/PIN):
select (pin_hash = extensions.crypt('4821', pin_hash)) as pin_ok
from public.pl_admins where email = 'you@example.com';
-- expect: pin_ok = true

-- 2) admin_login mints a token:
select public.admin_login('you@example.com', '4821');
-- expect: {"success": true, "token": "<uuid>"}

-- 3) The token validates server-side (paste the uuid from step 2):
select public.admin_require_token('<uuid>');
-- expect: your email. A bad/expired uuid raises 'Invalid or expired admin token.'

-- 4) Lockout still works: call admin_login with a wrong PIN 5 times, the 6th
--    call returns {"success": false, "error": "Too many attempts..."}.
--    (Then wait 15 min, or as postgres: delete from public.pl_pin_attempts
--     where email = 'admin:you@example.com';)

-- 5) User-PIN round trip (replace email; row must exist in pl_licensed_users):
select public.set_user_pin('customer@example.com', '1234');
select public.verify_user_pin('customer@example.com', '1234');   -- success:true
select public.verify_user_pin('customer@example.com', '0000');   -- success:false
select public.check_user_has_pin('customer@example.com');        -- true

-- 6) License-key mint + redeem (needs an admin token from step 2):
select public.admin_mint_license_key('<uuid>', 'paid', 'test key');
select public.redeem_license_key('customer@example.com', '<KEY_FROM_ABOVE>');
-- expect: {"success": true, "tier": "paid", ...}
-- redeeming the same key again -> "already been redeemed".

-- 7) verify_license now returns tier:
select * from public.verify_license('customer@example.com', null);
```

Verify the anon key **cannot** read tables directly (run in a terminal):

```bash
SUPA_URL="https://iknfvddnevudpjtyxkbh.supabase.co"
ANON="<your anon key>"
for t in pl_licensed_users pl_admins pl_admin_sessions pl_license_keys pl_pin_reset_tokens; do
  echo "== $t =="
  curl -s "$SUPA_URL/rest/v1/$t?select=*&limit=1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" | head -c 200
  echo
done
# expect: [] or a permission error for every table — never rows.

# And the RPC is reachable with the anon key:
curl -s -X POST "$SUPA_URL/rest/v1/rpc/redeem_license_key" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"p_email":"nobody@example.com","p_key":"NOPE"}'
# expect: {"success":false,"error":"This license key was not recognized."}
```

---

## Rollback

The migration is additive except for `verify_license` (dropped + recreated with
an extra `tier` column). To revert:

```sql
drop function if exists public.admin_reset_user_pin(uuid, text);
drop function if exists public.admin_mint_license_key(uuid, text, text);
drop function if exists public.admin_logout(uuid);
drop function if exists public.admin_require_token(uuid);
drop function if exists public.admin_login(text, text);
drop function if exists public.redeem_license_key(text, text);
drop function if exists public.complete_pin_reset(uuid, text);
drop function if exists public.check_user_has_pin(text);
drop function if exists public.verify_user_pin(text, text);
drop function if exists public.set_user_pin(text, text);
drop table if exists public.pl_pin_reset_tokens;
drop table if exists public.pl_admin_sessions;
drop table if exists public.pl_admins;
drop table if exists public.pl_license_keys;
alter table public.pl_licensed_users
  drop column if exists pin_hash,
  drop column if exists redeemed_at,
  drop column if exists tier;
-- then re-run 20260704000001_verify_license.sql to restore the old verify_license
```

## What this migration does NOT do (follow-ups)

- It does not convert the live `admin_*` bodies (Step 4 is manual — see above).
- It does not change `index.html` (separate workstream).
- `pl_pin_attempts` rows for lockout are keyed by plain email for users and by
  `'admin:' || email` for admins — they never collide.
- Old app builds that send `{p_email, p_pin}` to admin_* functions will stop
  working once Step 4 is done — deploy the new `admin.html` at the same time.

## v9 magic-link auth — Supabase dashboard config (no SQL)

The v9 app signs users in with Supabase Auth email magic links. Two dashboard
settings are required (no code changes needed):

1. **Auth → URL Configuration → Redirect URLs** — add BOTH:
   - `https://apatel85.github.io/Dashboards/PLDashboard/`
   - `https://apatel85.github.io/Dashboards/PLDashboard/index.html`
   Without these, the magic link will refuse to redirect back to the app.

2. **Auth → URL Configuration → Site URL** — set to
   `https://apatel85.github.io/Dashboards/PLDashboard/`

3. **Auth → Providers → Email** — confirm enabled (it is by default).
   Magic-link (OTP) emails are sent by Supabase; no SMTP setup needed to start.

Verify: open the app, enter any email, click "Email me a sign-in link",
click the link in the inbox — the app should boot straight into the
dashboard (free tier until a license row exists for that email).
