# Supabase Keep-Alive

`supabase-keepalive.yml` sends a tiny read request to the Supabase REST API on a
schedule so the free-tier project never gets **paused** (Supabase pauses free
projects after ~7 days of no database activity). The workflow runs every 3 days.

## One-time setup

### 1. Add two repository secrets

Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name | Value |
|---|---|
| `SUPABASE_URL` | `https://iknfvddnevudpjtyxkbh.supabase.co` |
| `SUPABASE_ANON_KEY` | Your project's **anon / public** API key (Supabase → Project Settings → API → `anon` `public`). This is the same key already embedded in the client app, so it is not sensitive. |

*(Optional)* If `pl_licensed_users` is not readable by the `anon` role, add a
**Variable** (not a secret) named `SUPABASE_KEEPALIVE_TABLE` set to any table the
anon role can `SELECT` from.

### 2. Merge this workflow to `main`

Scheduled (`cron`) workflows **only run from the default branch**. The keep-alive
won't fire on a feature branch — merge it into `main` first.

### 3. Test it now

**Actions** tab → **Supabase Keep-Alive** → **Run workflow**. A green run with
`✓ Keep-alive query ran against Supabase` confirms it works.

## Notes

- The response body is discarded (`-o /dev/null`), so no data appears in the
  (public) Actions logs — only the HTTP status.
- GitHub disables scheduled workflows if the repo has **no activity for 60 days**.
  As long as you push occasionally, it stays enabled.
- A failed run emails the repo admins, so you'll know if the ping ever breaks.
