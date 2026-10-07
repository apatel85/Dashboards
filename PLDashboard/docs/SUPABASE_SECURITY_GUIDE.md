# Supabase Security — Check & Fix Guide

A plain-English walkthrough for closing the three server-side risks from
`SECURITY_STRESS_REVIEW_2026-07.md`. You do all of this in your own Supabase
dashboard — nothing here touches customer data, and every step is reversible.

**Time:** ~20 minutes. **You need:** access to the Supabase project
(`iknfvddnevudpjtyxkbh`) and the ability to run SQL in it.

> **In a hurry?** The SQL below is also packaged as ready-to-run, idempotent
> migration files in [`supabase/migrations/`](../supabase/migrations/) (verified
> against Postgres 16). Run them in order — see that folder's README — and skip
> to the `curl` checks to confirm. The rest of this guide explains what each one
> does and why.

---

## First, the one-minute background

Your app is a static HTML file. It talks to Supabase using the **anon key**,
which is baked into the page and therefore **public** — anyone who opens the app
can read it. That is normal and fine *by design*, but it means Supabase itself
must decide what that public key is allowed to do. The gatekeeper is
**Row-Level Security (RLS)** plus **table grants**. If those are loose, the public
key can do more than you intended.

There are three things to check:

| # | Risk | Worst case if left open |
|---|------|-------------------------|
| 1 | Anyone can read the `pl_licensed_users` table | Every customer's **email + license key** gets stolen |
| 2 | The PIN check has no lockout | A 4-digit PIN (10,000 tries) gets brute-forced |
| 3 | Anyone can write to `pl_access_log` | Fake/spam log entries |

Risk #1 is the important one. Start there.

---

## How to open the SQL Editor (used throughout)

1. Go to https://supabase.com/dashboard and open your project.
2. In the left sidebar, click **SQL Editor**.
3. Click **New query**, paste the SQL from a step below, and click **Run**.

---

## Risk 1 — Stop the public key from reading license keys

### Step 1a — Check whether you're exposed

**The definitive test** (run in a terminal — this is exactly what an attacker
would try). Replace `<ANON_KEY>` with the anon key from your app
(`SUPA_KEY` in the HTML, or Supabase → Project Settings → API):

```bash
curl "https://iknfvddnevudpjtyxkbh.supabase.co/rest/v1/pl_licensed_users?select=email,license_key&limit=5" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```

- If it prints **rows of real emails and keys** → you are exposed. Fix it below.
- If it prints `[]`, or a `permission denied` / RLS message → good, already locked.

You can also eyeball it in the dashboard: **Table Editor → `pl_licensed_users`**.
If the table shows a red **"RLS disabled"** (or "unrestricted") badge, it is open.

### Step 1b — The fix: read through a function, not the table

Right now the app reads the table directly and even asks for the `license_key`
column back (it never actually uses that value — it only needs it to look a user
up). The clean fix is to **never let the public key touch the table**, and instead
call a small function that returns only the safe fields. Supabase's own
recommended pattern, and the same one your PIN checks already use.

Paste this into the SQL Editor and Run:

```sql
-- 1) A verifier that runs with the table owner's rights (SECURITY DEFINER),
--    so the public/anon caller never needs direct access to the table.
--    It returns everything the app needs EXCEPT the license key.
create or replace function public.verify_license(p_email text, p_key text default null)
returns table (email text, name text, plan text, status text, expires_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select u.email, u.name, u.plan, u.status, u.expires_at
  from pl_licensed_users u
  where lower(u.email) = lower(p_email)
    and (p_key is null or u.license_key = p_key)
  limit 1;
$$;

-- 2) Only the app may call it; it can do nothing else.
revoke all on function public.verify_license(text, text) from public;
grant execute on function public.verify_license(text, text) to anon, authenticated;

-- 3) Lock the table itself so the public key can read NOTHING directly.
alter table pl_licensed_users enable row level security;   -- turn RLS on
revoke all on table pl_licensed_users from anon;            -- remove any direct grant
```

With no policy granting `anon` access, and RLS on, direct reads by the public key
return nothing — but `verify_license()` still works because it runs as the owner.

### Step 1c — Point the app at the function

This is a small change in the HTML (`index.html` / `pl-dashboard-v8.html`). Two
places currently read the table directly; both become a call to the new function.

**Google sign-in path** — replace the direct select:

```js
// OLD
const rows = await supaFetch(
  `/rest/v1/pl_licensed_users?email=eq.${encodeURIComponent(email)}&select=email,name,plan,status,expires_at,license_key`
);

// NEW
const rows = await supaFetch('/rest/v1/rpc/verify_license', {
  method: 'POST',
  body: JSON.stringify({ p_email: email })
});
```

**License-key sign-in path** — replace the direct select:

```js
// OLD
const rows = await supaFetch(
  '/rest/v1/pl_licensed_users?email=eq.' + encodeURIComponent(email) +
  '&license_key=eq.' + encodeURIComponent(key) +
  '&select=email,name,plan,status,expires_at,license_key'
);

// NEW
const rows = await supaFetch('/rest/v1/rpc/verify_license', {
  method: 'POST',
  body: JSON.stringify({ p_email: email, p_key: key })
});
```

Everything after these calls already uses `rows[0].status`, `.plan`,
`.expires_at`, `.name` — the function returns those exact fields, so nothing else
changes. You can also delete the now-unused `licenseKey: user.license_key` line
(the app never reads it back).

> **This client change is already applied** in both HTML files (a regression test
> asserts no direct `pl_licensed_users` read remains). It stays inert until you run
> the SQL in Step 1b — until the `verify_license` function exists, the calls will
> just fail closed. So: **run the SQL first, then the sign-in paths light up.**
> Once the function is live, test both Google and license-key sign-in.

### Step 1d — Confirm it worked

Re-run the `curl` from Step 1a → it should now return `[]` or a permission error.
Then sign in through the app (both Google and license-key) to confirm real logins
still succeed.

---

## Risk 2 — Add a lockout to the PIN check

A 4-digit PIN is only 10,000 possibilities. Without a limit, a script can try them
all. Add an attempts counter so repeated wrong guesses lock the account for a
while.

### Check
Look at your `verify_user_pin` function (SQL Editor → **Database → Functions**, or
`select prosrc from pg_proc where proname = 'verify_user_pin';`). If it just
compares the PIN and returns, there is no lockout.

### Fix (template — merge into your existing `verify_user_pin`)

```sql
-- A place to remember recent failures, per email.
create table if not exists pl_pin_attempts (
  email        text primary key,
  fails        int  not null default 0,
  locked_until timestamptz
);
alter table pl_pin_attempts enable row level security;   -- no anon policy: only functions touch it

-- Inside verify_user_pin, before checking the PIN:
--   * if locked_until is in the future -> return { success:false, error:'Too many attempts, try later' }
--   * on wrong PIN  -> fails = fails + 1; if fails >= 5 set locked_until = now() + interval '15 minutes'
--   * on correct PIN -> reset the row (fails = 0, locked_until = null)
```

If you paste your current `verify_user_pin` definition to me, I'll write the exact
merged version for you.

---

## Risk 3 — Let the log be written, but not read or dumped

`pl_access_log` should accept new entries from the app but never hand the whole log
back to the public key.

### Check
```bash
curl "https://iknfvddnevudpjtyxkbh.supabase.co/rest/v1/pl_access_log?select=*&limit=3" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```
If it returns log rows, reading is open.

### Fix
```sql
alter table pl_access_log enable row level security;

-- Allow inserts (the app logs sign-in attempts) ...
create policy "anon can insert logs" on pl_access_log
  for insert to anon with check (true);

-- ... but grant no SELECT policy, so the public key can never read the log back.
revoke select on table pl_access_log from anon;
```

Note: this still lets someone with the public key write *fake* entries (any email).
That's low-risk audit noise. If it matters, move logging inside the
`verify_license` function so only genuine checks are recorded.

---

## Quick recap

1. **Run the two `curl` tests** — they tell you in seconds what's actually open.
2. **Risk 1 is the one that matters** — do the `verify_license` function + table
   lockdown, then update the two calls in the HTML (I can do that part).
3. Risks 2 and 3 are hardening — add them when you can.
4. **After each fix, re-run its `curl` test** to confirm the door is shut, and sign
   in through the app to confirm real users still get in.
