# TradeDesk

Stock research terminal: a login-gated dashboard with four tabs — **Daily Brief**,
**Earnings**, **Congress & Gov**, and **Research**. Each tab reads a static JSON
file from `public/data/` written by scheduled data pipelines.

- Stack: Vite + React 18 + TypeScript, no UI framework (hand-rolled dark
  terminal CSS in `src/styles.css`).
- Hosting: GitHub Pages project site at
  `https://apatel85.github.io/Dashboards/TradeDesk/` (`base: '/Dashboards/TradeDesk/'`
  in `vite.config.ts`, build output in `dist/`).
- Auth: the entire app sits behind Supabase Auth (Google OAuth + email
  magic link). See "Login-gate setup" below.
- Posture: research and education only — not financial advice. Nothing here
  executes trades.

## Project structure

```
TradeDesk/
├── index.html
├── vite.config.ts            # base '/Dashboards/TradeDesk/', outDir dist/
├── tsconfig.json
├── DATA_CONTRACTS.md         # JSON shapes each tab reads (human-readable)
├── public/
│   └── data/
│       ├── daily-brief.json  # placeholder until the brief pipeline lands
│       ├── earnings.json     # [] placeholder
│       ├── congress.json     # [] placeholder
│       └── research.json     # [] placeholder
└── src/
    ├── main.tsx              # React entry
    ├── App.tsx               # authed shell: header, tab nav, footer
    ├── types.ts              # TS interfaces for the data contracts (source of truth)
    ├── styles.css            # dark trading-terminal theme, responsive
    ├── lib/
    │   ├── supabase.ts       # Supabase client (shared project, anon key)
    │   └── useJsonData.ts    # fetch hook for public/data/*.json
    ├── auth/
    │   └── AuthGate.tsx      # session gate + Google / magic-link login UI
    ├── components/
    │   └── EmptyState.tsx    # "no data yet" panel with per-tab roadmap
    └── tabs/
        ├── DailyBrief.tsx
        ├── Earnings.tsx
        ├── CongressGov.tsx
        └── Research.tsx
```

## Local development

```bash
cd TradeDesk
npm install
npm run dev      # http://localhost:5173/Dashboards/TradeDesk/
npm run build    # outputs dist/
```

## Login-gate setup

TradeDesk reuses the team's shared Supabase project
(`https://iknfvddnevudpjtyxkbh.supabase.co`). The anon ("publishable") key is
**public by design** and is baked into `src/lib/supabase.ts` — the same key
already ships in the other apps (e.g. WagWise's `config.js`). Row Level
Security is the security boundary, not the key. The `sb_secret_*` key must
never appear in client code or the repo.

`src/auth/AuthGate.tsx` blocks the whole app until `supabase.auth.getSession()`
returns a session. Sign-in options:

1. **Google OAuth** — `signInWithOAuth({ provider: 'google' })`.
2. **Email magic link** — `signInWithOtp({ email })`; the link expires in 1 hour.

### One-time Supabase dashboard steps

1. **Authentication → Providers**: enable Google and Email (magic link).
   For Google, create the OAuth client in Google Cloud Console and paste the
   client ID/secret into Supabase.
2. **Authentication → URL Configuration**:
   - Site URL: `https://apatel85.github.io`
   - Redirect URLs: add `https://apatel85.github.io/Dashboards/TradeDesk/`
     (and `http://localhost:5173/Dashboards/TradeDesk/` for local dev).
   The app redirects back to `window.location.origin + window.location.pathname`,
   so both OAuth and magic-link flows must have the deployed path allow-listed.
3. No database tables are required for the gate itself — auth-only. If a future
   watchlist/prefs feature needs storage, add tables with RLS gated on
   `auth.uid()`.

## Data pipelines (to be built)

Each tab fetches `${BASE_URL}data/<file>` via `useJsonData`. The pipelines
(write side) are not part of this scaffold; they must:

- Write atomically (temp file + rename) and keep the last good file on failure.
- Never emit hardcoded filler values — uncomputable fields stay `null`.
- Conform to `src/types.ts` / `DATA_CONTRACTS.md`.

## Design notes

- Dark terminal aesthetic: near-black background (`#0a0e14`), green (`#00d084`)
  / red (`#ff4d5e`) accents, tabular numerals for figures.
- Compact density; tab bar scrolls horizontally on small screens; layout
  collapses cleanly at ≤640px.
- No emojis in the UI. The header shows "TradeDesk"; the footer carries the
  "research only, not financial advice" notice.
