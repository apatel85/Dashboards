# v9 — Ankit's live verification checklist

These are the steps only you can do (they need your Google account + the
live Supabase project). Everything else is already tested: **93 automated
tests pass** (`bash tests/run.sh` in the working copy).

## 1. Supabase dashboard (5 min)

- [ ] SQL editor → run `supabase/migrations/20261007000001_v9_auth.sql`
      (see `supabase/APPLY_NOTES.md` for order + the admin RPC conversion recipe)
- [ ] Auth → URL Configuration → Redirect URLs: add BOTH
      `https://apatel85.github.io/Dashboards/PLDashboard/` and
      `https://apatel85.github.io/Dashboards/PLDashboard/index.html`
- [ ] Auth → URL Configuration → Site URL:
      `https://apatel85.github.io/Dashboards/PLDashboard/`
- [ ] Auth → Providers → Email: confirm enabled

## 2. Magic-link sign-in (2 min)

- [ ] Open the app → enter your email → "Email me a sign-in link"
- [ ] Click the link in your inbox → app boots to the dashboard (free tier)

## 3. Google Sheets as the data store (5 min)

- [ ] Backup view → connect Google Sheets (consent screen should now ask only
      for "see, create, and edit your Google Sheets files" — the narrowed
      `drive.file` scope, not full Drive)
- [ ] The app creates "<Business> P&L — FYxx" in YOUR Google Drive — open it
      in a desktop browser tab and keep it visible
- [ ] In the app: add one transaction → within ~3s the new row appears in
      your sheet's `PL_Transactions` tab (11 columns: ID…Deleted)
- [ ] Edit that transaction in the app → the same sheet row updates in place
- [ ] Delete it in the app → the sheet row's `Deleted` column becomes TRUE
      (the row stays — that keeps row numbers stable for syncing)
- [ ] Edit a row DIRECTLY in the Google Sheet → wait ~60s (or refocus the tab)
      → the app pulls it in
- [ ] Offline test: turn on airplane mode → add a transaction → turn it off
      → the row syncs within seconds, nothing lost

## 4. License key (admin)

- [ ] Open `admin.html` → sign in with the admin PIN (one-time; afterwards it
      uses a session token, PIN is never re-sent)
- [ ] Issue a license key for your email → in the app, "Redeem it here" →
      enter email + key → you get a sign-in link, and after clicking it the
      app shows the Pro tier

## Known v9.0 limitations (by design, not bugs)

- Monthly Summary / Settings & Info sheet tabs refresh on full syncs
  (import, restore, manual "Sync now"), not on every single edit.
- Two tabs open at once editing the same sheet: last write wins per row.
- A static app can't be made unbypassable by a determined tinkerer — the
  real protection is server-validated sessions + account-tied value.
