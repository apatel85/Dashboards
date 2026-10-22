# AGENTLOG — VoiceInsight (meeting summarizer)
> AI agents: read this first. Newest entry at top. Per entry: date · request · change · version · verification.

## Decisions (standing — don't re-litigate)
- Free APIs only; LLM chain Gemini → Groq → OpenRouter with automatic fallback.
- Keys live in the user's browser only — never in the repo.

## 2026-10-21 — v1.0.3 custom vocabulary
- **Request:** primary English with Indian names/terms — model should handle accent + name variations.
- **Change:** new "Custom vocabulary" field (step 1): sent to AssemblyAI as `keyterms_prompt` (up to 200 terms) for Upload transcription, and fed to the Polish step so misheard names get corrected to listed spellings. Saved on-device.
- **Version:** v1.0.3.
- **Verified:** no — awaiting his on-phone test. Note: Record path (Web Speech API) can't take vocabulary hints — polish step covers it there.

## 2026-10-21 — v1.0.2 cache strategy
- **Request:** "not seeing new update" — phone held v1.0.0 despite v1.0.1 live (Pages build verified 23:05 ET).
- **Change:** service worker now network-first for HTML (updates appear on next load), cache-first for other assets. Version pill v1.0.2.
- **Version:** v1.0.2.
- **Verified:** no — needs his cache clear + reload to confirm pill shows v1.0.2.

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
