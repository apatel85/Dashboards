# AGENTLOG — Dashboards (repo root)

## 2026-11-24 — v1.0.0 — Shared PIN gate rolled out to static apps
- **Request:** Ankit asked for a password gate on every hosted app: PIN for the apps, portfolio stays open.
- **Change:** Added shared `gate.js` at the repo root (served at /Dashboards/gate.js) and injected `<script src="/Dashboards/gate.js"></script>` into the `<head>` of 36 entry pages. The gate prompts for a 6-digit PIN, compares its SHA-256 hash (no plaintext PIN anywhere in the repo), and unlocks for the tab session via sessionStorage — one entry unlocks all apps on apatel85.github.io.
- **Excluded:** SelectedWork (portfolio, stays open per Ankit's pick); TradeDesk, PLDashboard, CricMaxConnect, WagWise (already gated by Supabase Auth).
- **Notes:** The PIN is a curtain, not a lock — a 6-digit hash is brute-forceable and the gate is client-side only. It keeps casual visitors out; it does not protect sensitive data.
- **Verification:** Live curl checks run after push — see main-chat report Nov 24, 2026.
