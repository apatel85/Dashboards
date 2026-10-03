# Simba Telemetry — Living Specification

> Canonical document for the Simba Telemetry PWA. Updated as the app evolves.
> Supersedes the 13-page Gemini blueprint PDF for implementation purposes; the
> PDF's clinical truth model (sections 2, 5, 6) remains the physiological reference.

## 1. What the app is

A standalone, installable **Progressive Web App** that replicates and extends the
Google Gemini telemetry workflow Ankit ran for Simba (28 days, 613+ events). It
tracks daily activity — food, water, pee, poop, naps/crate, training, weight —
models Simba's physiological state in real time, predicts what happens next, and
keeps a queryable longitudinal record for detailed analysis.

- **Stack:** vanilla HTML/CSS/JS, no build step. Hosted free on GitHub Pages.
- **Backend:** Supabase only (Postgres + Auth + Row Level Security). No app server.
- **Cost:** $0. No paid APIs, no paid services. AI clinical reasoning happens with
  Muse (the user's agent, which already holds Simba's full history) or the user's
  own Gemini free-tier key entered in-app.
- **Privacy:** Supabase project URL + anon key are entered on the app's Setup
  screen and stored in the device's `localStorage` only — never in the repo.
  RLS policies restrict every row to its owner (`owner_id = auth.uid()`).

## 2. Ankit's four requirements (2026-09-28)

1. **Daily activity tracking** — one-tap buttons for nap, food, water, pee, poop,
   training (+ weight, notes). One tap = timestamped event. Food/Water open a
   small sheet for amounts (tbsp/tsp) and topper notes. Voice dictation via the
   free Web Speech API, plus freeform text parsed into structured events.
2. **"What to expect" insights, both directions** — the app shows live state
   ("hold 49m vs 82m personal average — no urgency, skipping this trip is fine")
   *and* forward guidance ("post-breakfast filtration peaks in ~20 min — plan the
   8:30 outing"). Fewer false alarms, not just more alerts.
3. **Learned-schedule predictive alerts** — per-hour-of-day event probabilities per
   category, computed from the trailing 90 days and recomputed as data grows.
   High-probability windows (≥80%) trigger in-app nudges ~15 min before the
   window when no matching event is logged yet that day. The "in case I forget"
   backstop is a scheduled check-in by Muse (the agent), which reads the latest
   data and messages Ankit directly — no push server required.
4. **Rolling trend analysis** — in-app Trends view (7/30/90-day): pee probability
   by hour, average awake-hold trend, poop count/timing vs the 2/day quota,
   daily kcal vs target band, weight curve, accident count. Monthly deep-dives
   are done conversationally with Muse against the Supabase data.

## 3. Clinical model (from the blueprint, abridged)

- **Energetics:** RER = 70 × kg^0.75 (≈175 kcal at 3.40 kg); DER = 2.0 × RER
  (≈351 kcal); operational target **300–330 kcal/day**.
- **Urinary:** average awake hold 81.9m (IQR 68–95); fluid bolus peaks 30–45 min
  post-intake; postprandial full void at 65–75 min post-meal; sleep ADH enables
  8.5–10.3h overnight continence.
- **GI:** 15-minute dish pickup rule; CCK lipid delay (egg/fat → 4.5–5.5h gastric
  emptying; breakfast kibble capped at 3.0 tbsp with fat toppers); 2-poop circadian
  quota (morning 07:45–08:30, afternoon 12:45–17:00); Purina fecal score 1–7.
- **Deterministic engines** (`calculateBladderState`, `evaluateContingencyTriggers`)
  are ported 1:1 from the blueprint's Python into `app.js` and tick every 60s.
  Thresholds: CRITICAL at ≥75m awake hold or 30–45m post-fluid with >18 mL
  estimated; ELEVATED at ≥60m or >14 mL.

## 4. Adaptive layer (extends the blueprint)

The blueprint's triggers are fixed rules from the original 28 days. The app adds
a **learned probability model** on top: for each category (Pee, Poop, Meal),
`P(event in hour h) = days with event in h / days with data` over 90 days.
Windows ≥80% become nudges; the personal average hold replaces the 81.9m
constant once ≥5 hold samples exist. The model adapts as Simba matures.

## 5. AI-layer design

- **Primary:** Muse. "Generate clinical audit" assembles the spec §6.2 prompt +
  event + live state + knowledge excerpts into a copyable card.
- **Optional in-app:** user's own Gemini API key (free tier, device-local) calls
  `gemini-2.0-flash:generateContent` directly.
- **Knowledge precedence:** `knowledge/cavapoo-specialized.md` is consulted
  **first**, then `knowledge/general-canine.md`. Both refresh monthly; revision
  dates live at the top of each file.

## 6. Data model

One schema `simba_telemetry`: `subjects` (id, owner_id, name, breed, dob, sex,
weight_kg, target hold, clean streak) and `telemetry_events` (id, auto
`LOG-0001…` codes via trigger, subject/owner ids, timestamps, ingestion metrics,
elimination metrics, crate metrics, behavioral flags, computed state snapshots,
clinical audit fields, optional `walk_id`). Full DDL in `supabase/schema.sql` —
run once in the Supabase SQL editor.

**v2.0 additions** (DDL in `supabase/migration_v2.sql` — run after the base
schema): `household_members` (subject_id, user_id, email, role — invite by
email, claimed on first sign-in via JWT-email match); `medications`
(name, dose, frequency, time_of_day, next_due_at) + `med_logs` (per-dose log);
`vaccinations` (vaccine, given_at, next_due_at, vet); `walks`
(started_at, ended_at, distance_m, duration_mins, route JSON polyline).
RLS widened via `simba_telemetry.is_household(subject_id)`: the subject owner
*or* any claimed household member can read/write that subject's events, care
rows, and walks. Owner-only: managing household memberships.

## 7. Screens

Cockpit HUD · Voice/text log · Timeline · Trends · Insights · Ask/audit ·
Knowledge viewer · Meds & vaccines · Vet report (print/PDF) · Household
sharing · Export (CSV / Markdown / multi-sheet XLSX) · Setup & login.

### v2.0 feature notes

- **24-hour clockface dial** (Trends hero): SVG radial dial of pee/poop density
  per hour over the trailing 90 days; repeated times render as thickened green
  bands; filterable All/Pee/Poop. Peak hours labeled at the dial center.
- **Confidence & quiet start:** every learned window carries `confidence` =
  `round(prob × 100 × min(1, dataDays/14))`, shown on nudges and schedule
  cards. Nudges fire only when **prob ≥ 80% AND ≥14 days of data AND the
  cluster spans ≥3 separate days** (`shouldNudge`). Below 14 days a
  "🧠 Learning mode — N/14 days" banner shows on Cockpit and Insights; windows
  are displayed but no nudges fire.
- **Back-dated entries:** every manual log sheet has a log-time picker
  (default now); the Log screen has a "Log a past event" form (event +
  datetime + note). Voice/text parsing already honors explicit times in text.
- **Vet report:** printable pet summary + weight curve + vaccinations +
  medications + 30-day totals + accident count; print stylesheet renders
  report-only on white for Save-as-PDF.
- **Meds & vaccines:** recurring meds with next-due computation and "dose
  given" logging; due/overdue meds surface as Cockpit countdowns (✓ marks
  given); vaccinations with next-due dates. Local-storage fallback when the
  v2 tables aren't migrated yet or offline.
- **GPS walks:** start/stop on Cockpit; `watchPosition` with 3 m jitter guard;
  live km + duration; route drawn as a polyline on a plain canvas (no map
  tiles — $0, works offline); saved to `walks` (+ a summary Walk event;
  timeline items are tappable to re-view the route).
- **Multi-pet:** pet switcher in the subject card + "＋ Pet" (name, breed, DOB,
  sex, weight); per-pet dashboards via `st_active_pet`; household members see
  shared pets automatically.
- **Streaks & success (Cockpit):** accident-free day streak (consecutive logged
  days, anchored today/yesterday — an unlogged day conservatively breaks the
  counted streak), 7-day outdoor success %, 7-day poop-quota compliance %.

## 8. Open items

- Knowledge documents pending from the research track → drop into `knowledge/`.
- iOS: PWA countdown alerts are reliable only while the app is open; Android is
  fully capable. The Muse scheduled check-in covers the forget-case on both.
- **Background push when the app is closed is not possible for a PWA** (no
  push server at $0); the Muse morning/evening check-in backstop is the
  designed solution — not a gap to fix in-app.
- Native-only features (lock-screen widgets, Apple Watch complications) are
  deliberately out of scope for the PWA.
- Household Day-1 definition and the 3-3-4 feeding framework section still open
  in the bio file; fold in when Ankit provides them.

## Changelog

- **2026-09-29** — v2.0: 24-hour clockface pattern dial; household multi-user
  logging (`migration_v2.sql`); confidence scores + quiet-start gating (≥80%,
  ≥14d data, ≥3d clusters) with Learning-mode banner; back-dated entries;
  printable vet report; medication + vaccination tracking with due reminders;
  GPS walk tracking (offline canvas routes); multi-pet profiles with switcher;
  Cockpit streaks & success rates. 56/56 engine tests green
  (`tests/run-tests.js`).
- **2026-09-28** — v1.0 built: PWA shell, 8 screens, JS engines, parser, learned
  schedule, trends, audit builder, Supabase schema, GitHub Pages deploy.
