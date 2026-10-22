# AGENTLOG — VoiceInsight (meeting summarizer)
> AI agents: read this first. Newest entry at top. Per entry: date · request · change · version · verification.

## Decisions (standing — don't re-litigate)
- Free APIs only; LLM chain Gemini → Groq → OpenRouter with automatic fallback.
- Keys live in the user's browser only — never in the repo.

## 2026-10-21 — v1.0.0 initial release
- **Request:** free-tier voice-to-insight pipeline (AssemblyAI-style): voice → polished transcript → summary → email draft; phone app that works with any app.
- **Change:** PWA — record (Web Speech API) / upload (AssemblyAI key) / paste or share-target → polish → summarize (decisions, action items w/ owner+deadline) → email draft (tone selector). PWA share_target for the Android share sheet; Capacitor wrapper later for overlay/keyboard.
- **Version:** v1.0.0.
- **Verified:** no — awaiting his on-phone test.
