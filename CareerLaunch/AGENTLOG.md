# CareerLaunch — AGENTLOG

## 2026-11-24 — v1.0.0 — NEW APP
- **Ankit's request:** "Let's start with Phase 1. For AI Job search — create something for me for Job search as well as freelance program. Review workflow, path and make the github hosted app."
- **What changed:** New single-file static app `CareerLaunch/index.html` (v1.0.0) + this log. Two tracks in one dashboard: Job (full-time remote) and Freelance ($75–$100/hr toward $10,000/month, with rate/hours calculator). Workflow adapted from AI Job Search (MIT) as web steps — Setup → Find → Rank → Apply → Interview → Outcome; freelance Lead → Qualify → Proposal → Contract → Deliver → Invoice. Data is localStorage only, export/import JSON, no server, no Supabase in v1. Seed data is clearly marked SAMPLE; no real CV or PII in the repo. Design follows the Mock B baseline.
- **Verification status:** Awaiting on-phone confirmation. Local checks: file renders as a single HTML page, all tabs / calculator / add-role / add-lead / export wired in JS. Live Pages URL to be checked after push; Ankit's phone check is the final gate.

## Decisions
- Local-only in v1 by design — profile data must never go in the public repo.
- No scraping, no auto-send. Follow-ups are drafts only, max 2, after 10 days quiet.
- AI-enthusiast-not-expert line is baked into the default profile headline.
- DeepMind-style all-day AI-evaluation roles are flagged for Ankit's call, not pursued automatically.
