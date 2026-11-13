# AGENTLOG — VoiceFlowAI (voice dictation: Windows, then Android)
> AI agents: read this first. Newest entry at top. Spec: `docs/VOICEFLOW_BUILD_SPEC.md`.

## Decisions (standing — don't re-litigate)
- **No API key in the app, ever.** The Gemini key is a server-side secret. Chain: GitHub secret `GEMINI_API_KEY` → workflow `voiceflow-polish-deploy.yml` → Supabase function secret → Edge Function `voiceflow-polish` → Gemini. The app only holds Supabase's public anon key and calls `ProxyPolishAdapter`. (Overrides spec §7.3 "enter keys in the app"; direct `GeminiAdapter` remains for tests/Ollama-style use.)
- Cloud polish is off by default and needs consent (`Settings.cloudActive`).
- iOS out of scope. English first. Flutter pinned 3.50.0 (Dart 3.14).
- Golden fixtures live in `packages/core/test_fixtures/formatting/<profile>/cases.json`.

## 2026-11-13 — S3 in progress
- Run 43481153722: release APK builds; emulator enabled+selected the IME; `VoiceFlowIME` service process started; Flutter engine started but failed `Dart_LookupLibrary: library 'package:voiceflow_app/ime_main.dart' not found` (library not in AOT program). Fix: `main.dart` imports `ime_main.dart`. Result of rerun: see next entry.

## 2026-11-13 — S2 PASS (Windows runner)
- **S2 — AUTOMATED-PASS** — https://github.com/apatel85/Dashboards/actions/runs/43471202540 (job `s2-windows`, artifact `s2-windows-log`). Harness `app/spike/s2/s2.ps1` (PowerShell 5.1 + C# P/Invoke): 5 consecutive runs of snapshot clipboard → write text with `ExcludeClipboardContentFromMonitorProcessing` / `CanIncludeInClipboardHistory=0` / `CanUploadToCloudClipboard=0` → `SendInput` Ctrl+V (4 events) → text appears in a WinForms TextBox → restore after 300 ms → original clipboard text equal. `KEYEVENTF_UNICODE` fallback typed `café 😀` correctly. `S2_FAILURES=0`.
- **Limits (do not overclaim):** target is a WinForms TextBox, not Word/Slack/VS Code (that is manual W3). Clipboard snapshot in the spike is text-only; M1b must snapshot all non-delayed formats. Whether Windows actually keeps the text out of Win+V history is NOT-VERIFIED (only that the exclusion formats were set). Elevated-window and password-field handling untested.
- Gotcha: `Add-Type` with `System.Threading` fails under pwsh 7 on the runner; use `shell: powershell` (5.1).
- **Next action:** S3 — Kotlin `InputMethodService` calling Dart through a headless `FlutterEngine` on the KVM Android emulator (≤2 s first call, ≤100 MB idle), plus S1 on the emulator; fallback = bound service in the main app.

## 2026-11-13 — S1 PASS on Windows runner
- **S1 Windows (windows-latest) — AUTOMATED-PASS** — https://github.com/apatel85/Dashboards/actions/runs/43468417249 (artifact `s1-windows-log`). Whisper base.en int8: load 506 ms; 6.6 s clip → 430 ms; 16.7 s clip → 1097 ms (≈0.07× realtime, well inside ≤3 s per 10 s). Text identical to Linux run. Reported RSS 38 MB is NOT trusted (Windows working-set under-reports model memory); real idle-memory number still NOT-VERIFIED.
- **Finding (matters for M1b):** `dart run` crashed first (run 43467300802) because Windows' System32 `onnxruntime.dll` v1.17.1 shadows sherpa's newer one ("API version 28 not available"). Fix: the app MUST ship `onnxruntime.dll` + `sherpa-onnx-c-api.dll` beside the exe (exe dir is searched first); the Flutter Windows build does this. Don't test the STT engine via `dart run` on Windows.
- **S1 Android emulator:** NOT-VERIFIED. **S2, S3:** not started.
- Note: `etl_refresh.yml` (another app's workflow) fails on every push to this branch within 1 s; unrelated to VoiceFlowAI, left untouched (scope fence).
- **Next action:** S2 (SendInput paste into a test window on the Windows runner, clipboard restored, 5 runs) in `app/spike/s2` + workflow job; then S3 (Kotlin IME + headless FlutterEngine on emulator).

## 2026-11-13 — S1 (Linux) + backup providers
- **Backup providers:** `voiceflow-polish` v2 chains Gemini → Groq (`GROQ_API_KEY`) → OpenRouter (`OPENROUTER_API_KEY` + `OPENROUTER_MODEL`); providers without a secret are skipped; one 2.8 s budget. Only `GEMINI_API_KEY` is known to exist; I did not look for or reuse other keys. Add Groq/OpenRouter as Supabase function secrets to enable. Deploy: ACTIVE v2. Live call NOT-VERIFIED.
- **S1 on Linux CPU — AUTOMATED-PASS (local command, `app/spike/s1`):** sherpa_onnx 2.0.1 + Whisper base.en int8. 6.6 s clip → 1065 ms decode; 16.7 s clip → 2528 ms; load 855 ms; RSS 356 MB with model loaded. Text matched references (only spelling variants, ~4% WER on clip 1). **Budget notes:** decode ≈ 0.15× realtime (OK vs ≤3 s per 10 s); memory with model loaded exceeds the 150 MB idle target → M4 idle unload is mandatory. Windows runner + Android emulator: NOT-VERIFIED (run `voiceflow-spike` workflow). Hotword biasing: NOT-VERIFIED.
- **Also:** `flutter create` app/ (windows, android) with deps voiceflow_core + sherpa_onnx. No UI yet.
- **Next action:** push, run `voiceflow-spike` on windows-latest, read the `s1-windows-log` artifact; then S2 (SendInput paste test) and S3 (Kotlin IME + headless FlutterEngine).

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
