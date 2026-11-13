# AGENTLOG — VoiceFlow AI (voice dictation app)
> AI agents: read this first. Newest entry at top. Per entry: date · request · change · version · verification.

## Decisions (standing — don't re-litigate)
- Build from `docs/VOICEFLOW_BUILD_SPEC.md` (v2). Windows then Android; no iOS (owner has no Mac).
- English first; other languages are added as data.
- $0 only. On-device by default; Cloud polish is opt-in with the owner's own free keys (Gemini Flash-Lite → Groq), entered in the app, never in the repo.
- Owner accepts that text sent to Google's free tier may be used for product improvement when Cloud polish is on.

## 2026-11-13 — spec v2 (planning only)
- **Request:** review the build spec, close gaps, move the app into this repo, add free API options, UX design, owner-input checklist, automation and token-efficiency rules.
- **Change:** added `docs/VOICEFLOW_BUILD_SPEC.md` v2. No app code yet.
- **Version:** none.
- **Verified:** n/a (document only). Items marked ⚠ in the spec are unverified facts for the builder to check.
- **Next action:** owner completes spec §1.1 tasks A–B and the §1.2 answers form; then start M0.
