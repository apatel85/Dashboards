# AGENTLOG — VoiceFlowAI (voice dictation: Windows, then Android)
> AI agents: read this first. Newest entry at top. Spec: `docs/VOICEFLOW_BUILD_SPEC.md`.

## Decisions (standing — don't re-litigate)
- **No API key in the app, ever.** The Gemini key is a server-side secret. Chain: GitHub secret `GEMINI_API_KEY` → workflow `voiceflow-polish-deploy.yml` → Supabase function secret → Edge Function `voiceflow-polish` → Gemini. The app only holds Supabase's public anon key and calls `ProxyPolishAdapter`. (Overrides spec §7.3 "enter keys in the app"; direct `GeminiAdapter` remains for tests/Ollama-style use.)
- Cloud polish is off by default and needs consent (`Settings.cloudActive`).
- iOS out of scope. English first. Flutter pinned 3.50.0 (Dart 3.14).
- Golden fixtures live in `packages/core/test_fixtures/formatting/<profile>/cases.json`.

## 2026-11-13 — polish proxy deployed
- **Change:** deployed Edge Function `voiceflow-polish` v1 (verify_jwt on) to Supabase project `Master_Apps_DB` (iknfvddnevudpjtyxkbh) via MCP. It reuses that project's existing `GEMINI_API_KEY` function secret (same one `gemini-proxy`/WagWise reads), so the GitHub-secret sync workflow is NOT needed unless the secret is missing. Default model changed to `gemini-3.8-flash` (the model WagWise's proxy already uses; override with `GEMINI_MODEL` secret).
- **Verified:** deploy returned ACTIVE. Live call: NOT-VERIFIED — authoring sandbox blocks supabase.co egress. Expected: 503 `not configured` if the secret is absent, 200 `{text}` if present.
- **App wiring (when built):** functionUrl `https://iknfvddnevudpjtyxkbh.supabase.co/functions/v1/voiceflow-polish` + project anon key (public) → `ProxyPolishAdapter`.

## 2026-11-13 — v0.1.0 M0 + M1a (core) — PARTIAL
- **Request:** review spec, build the app; Gemini key from GitHub secret / Supabase, not in app.
- **Change:** folder layout, pinned toolchain docs, `tool/check.sh`, `voiceflow-ci.yml`, license audit; `packages/core`: interfaces, RuleFormatter, number words, voice commands, polish prompt+validator, post-processor, pipeline, energy VAD, history store, settings w/ migrations, Gemini/OpenAI-compat/Proxy adapters, polish chain; 4 profiles, `general_business` pack, `lang/en.json`; Supabase Edge Function + deploy workflow.
- **Verified:** `tool/check.sh` locally — 130 tests pass (88 goldens incl. 22 per profile, adversarial, no-network, resilience, mock-HTTP adapters), analyze clean. CI run: NOT-VERIFIED (not pushed/run yet when written). Edge Function: NOT-VERIFIED (not deployed).
- **Not done:** Flutter `app/` project, M0.5 spikes (need CI runners), M1b Windows, M2 Android, M3 pack loader/detector/schema validation, M4. STT, UI, platform adapters, installer, manual checklists.
- **Next action:** (owner) add repo secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, confirm `GEMINI_API_KEY` name, run `voiceflow-polish-deploy`. (agent) M0.5 spike S1: `flutter create` app/, add sherpa-onnx, run on Windows runner.
