# Research Receipt — WagWise redesign

Sprint: `wagwise-redesign-2026-11-12` · Date: 2026-11-12 · Status: receipt-ready
Live app: https://apatel85.github.io/Dashboards/WagWise/ · Intake: `AppSprints/sprints/wagwise-redesign-2026-11-12/intake.json`

## The job (one line)

"Know what Simba needs next — and log it in one tap."

## Words to use

what to expect right now · take him out in ~20 min · pee / poop · kibble · topper · crate · nap · streak · accident · hold (how long since the last pee) · poop quota (2 a day) · countdown · learning mode · vet-ready report · in case I forget

## Jargon — never bare (each needs a plain line on first use)

telemetry · bladder hold · filtration peak · RER / DER · CCK · ADH · Purina fecal score · visceral status · circadian quota · learned-schedule window · confidence score

## The app today (verified from the live app + SPEC.md, 2026-11-12)

- PWA, vanilla HTML/CSS/JS, no build step, GitHub Pages. Files: `index.html`, `app.js` (~310 KB), `styles.css`, `config.js`, `demo-data.js`, `manifest.json`, `sw.js`, `knowledge/`, `supabase/` (`schema.sql`, `migration_v2.sql`), `tests/`.
- 12 screens: Cockpit HUD · Voice/text log · Timeline · Trends · Insights · Ask/audit · Knowledge viewer · Meds & vaccines · Vet report (print/PDF) · Household sharing · Export (CSV / Markdown / XLSX) · Setup & login.
- Data: Supabase schema `simba_telemetry` — `subjects`, `telemetry_events`; v2 adds `household_members`, `medications`, `med_logs`, `vaccinations`, `walks`. RLS: owner or claimed household member (`is_household()`). Auth Google + email; offline localStorage fallback.
- Engines: deterministic bladder/contingency engines tick every 60s; learned per-hour probabilities over the trailing 90 days. Nudges fire only at prob ≥80% AND ≥14 days of data AND the cluster spans ≥3 days. Below 14 days a "Learning mode — N/14 days" banner shows; windows display but no nudges fire.
- Clinical model: target 300–330 kcal/day; average awake hold 81.9 min; 2-poop circadian quota (morning 07:45–08:30, afternoon 12:45–17:00); Purina fecal score 1–7.
- Current version v3.27.14 (Oct 17, 2026 quick-log fix; on-phone confirmation still pending). Standing rules: "what to expect" = compact action items with countdown windows from actual + historical data, never verbose briefings; trends from entered data only — unentered days never influence the math; remind about missed days. No background push for a PWA by design — the Muse check-in is the backstop. Native-only features (lock-screen widgets, watch) are out of scope.
- What the redesign keeps: everything above — data model, engines, all 12 screens. This is a presentation reorganization, not a rebuild.

## Current solutions (what WagWise replaces)

Fridge note / whiteboard ("who took him out last?") · memory · phone notes · spreadsheets (739-row master CSV) · the 28-day Gemini workflow · paper vet records · Google Calendar reminders. None of them predicts; all of them depend on someone remembering.

## Competitor audit (from published reviews, Nov 2026; 30-min cap)

1. **DogLog** — shared daily log: food, water, walks, pee, poop, training, medicine, custom. Pack sharing across household and sitters. Free; Premium $3.99/mo or $39.99/yr (vaccination/medical records sit in Premium). 4.8★ from ~1,400 US App Store ratings; 4.5★ on Google Play (1.2K); 100k+ installs. Does well: the simplest shared log; "who already went out" coordination; custom events (one user tracked seizures). Confuses: sync across devices is unreliable — users must close and reopen the app to see new entries, and reminders only fire if the app is opened; searching logged events costs $40/yr; hard to tell dogs apart (colors mark the activity, not the pet); no double-feed warning. Sources: medium.com/@graboosky/pet-health-apps-for-dogs-and-cats-compared-a0d24b88cab4; trymeo.app/alternatives/doglog-alternative; play.google.com (com.mobikode.dog).
2. **PetDesk** — vet-connected organizer: appointment/refill requests, reminders (Given / Snooze / Skip), records, weight tracker, loyalty points. Free for owners (practices pay); 12,000+ practices. 4.9★ from 511,000 US App Store ratings; 1M+ installs. Does well: clinic connection pulls appointments automatically; reminders are the best in the category; no owner paywall. Confuses: most value only arrives if your clinic uses it — without that it is a manual planner; North America only; occasional sync issues; no offline access. Sources: medium.com comparison (same as above); mobexer.com/petdesk-pet-health-reminders/com.locai.petpartner; technerdiness.com/apps/best-pet-care-apps-iphone-android/.
3. **11pets** — the most clinical self-run record: medical history, vaccines, medications, weight, vital signs, grooming, appointments, each with reminders. Free tier. Does well: the fullest health record you run yourself, no clinic needed. Confuses: US App Store rating ~3.3 from fewer than 100 ratings — noticeably lower than the others; try the free tier before relying on it. Sources: elevenapril.com/blog/best-pet-journal-apps; technerdiness.com (same as above).

## The gap

None of the three predicts. They log and remind on fixed schedules; none models the dog's physiology (bladder hold, filtration peaks), none learns per-hour probabilities from the dog's own history, and none turns a day's logs into a vet-ready clinical audit. WagWise's edge is prediction + physiology + vet audit. Its confusion risk is density: 12 screens, engines, dials, and a cold start ("waiting for data…") that shows the household an empty app until 14 days of history exist.

## Screen map

- **360px, one column:** Simba header → one big "what to expect" line with countdown ("take him out in ~20 min") → quick-log dock (one-tap buttons, 48px) → risk gauge + today's counts (kcal, poops 0/2) → everything else (Timeline, Trends dial, Meds, Vet report, Ask/audit) one tap away, collapsed by default. Voice button prominent.
- **768px, two columns:** countdowns + quick-log side by side; risk + counts as a row of cards; Timeline beside the Trends dial; meds/vaccines as full-width tables.
- **1024px+, Mock B baseline:** 348px sticky rail (Simba profile, today's totals, risk) + fluid main column, gap 28px; no bottom bar; same content at every width, reached by collapsing, never by deleting.

## Pattern Router

WagWise is an app: daily return + own data → app shell. The Cockpit is the daily front door ("what to expect right now"); the other 11 screens are the workbench/reference (dense, filters + drill-in, collapsed by default). One job per screen; the daily job (log + next-up) before theory (trends, audit).

## Style options (per the skill rule — Ankit picks)

1. **Soft rounded, warm** — rounded cards, warm cream/peach + soft green, big friendly type, large touch targets. Fit: matches a household puppy app; calm, one-thumb, feels like care, not a dashboard. Trade-off: can drift into "cute" and bury dense data (trends dial, kcal bank) if radii and spacing aren't disciplined — the Mock B baseline's density rules keep it honest. **Recommended.**
2. **Clean clinical (Apple Health-like)** — white, one accent, precise mono numbers, charts first. Fit: WagWise IS a telemetry/clinical app — the vet report, audit, kcal/hold numbers deserve precision. Trade-off: can feel cold and medical for a family puppy app; risks the "spreadsheet" feel the household already left behind.
3. **Playful illustrated (bold color, mascot, chunky shapes — Dogo/Rover style)** — the most recognizable "dog app" look; fun for the household, great for onboarding. Trade-off: illustration-heavy, fights the data density of 12 telemetry screens, ages fastest; the vet-report/audit side would clash with it.

## Assumptions (Ankit's to correct)

- Redesign is presentation-only: screens, navigation, density. Data model, Supabase schema, engines, and all 12 screens stay; no new features.
- Household = Ankit (owner: logs, trends, vet audit, settings) + wife (logs, checks what to expect); owner-only: household management, data-version rollback.
- Phone-first, one-handed while with the dog; "what to expect" stays compact action items with countdowns; trends from entered data only; missed-day reminders stay; no background push (PWA limit — Muse check-in is the backstop).
- Style is Ankit's pick from the three above; if he says "you pick," build soft rounded, warm.

## Done-test

Ankit opens the mockup on his phone and answers "what does Simba need next" in 10 seconds — and logs a pee in one tap.
