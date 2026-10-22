# AGENTLOG — VoiceInsight (meeting summarizer)
> AI agents: read this first. Newest entry at top. Per entry: date · request · change · version · verification.

## Decisions (standing — don't re-litigate)
- Free APIs only; LLM chain Gemini → Groq → OpenRouter with automatic fallback.
- Keys live in the user's browser only — never in the repo.

## 2026-10-21 — v1.0.1 model fix
- **Request:** app failed after pasting Gemini + AssemblyAI keys.
- **Change:** default Gemini model gemini-2.5-flash → gemini-3.5-flash-lite (2.5-flash returns 404 for new free keys since Oct 2026); one-time migration of the stored value; settings now autosave on input so pasted keys survive even if Save is never tapped.
- **Version:** v1.0.1.
- **Verified:** no — awaiting his on-phone retry.

## 2026-10-21 — v1.0.0 initial release
- **Request:** free-tier voice-to-insight pipeline (AssemblyAI-style): voice → polished transcript → summary → email draft; phone app that works with any app.
- **Change:** PWA — record (Web Speech API) / upload (AssemblyAI key) / paste or share-target → polish → summarize (decisions, action items w/ owner+deadline) → email draft (tone selector). PWA share_target for the Android share sheet; Capacitor wrapper later for overlay/keyboard.
- **Version:** v1.0.0.
- **Verified:** no — awaiting his on-phone test.
