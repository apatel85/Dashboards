# PINS — verified facts (spec rule 7). Only entries marked VERIFIED are trusted.
| Item | Value | Status |
|---|---|---|
| Flutter | 3.50.0 stable (Dart 3.14.0), from storage.googleapis.com releases json | VERIFIED 2026-11-13 |
| actions/checkout | v4.2.2 | VERIFIED 2026-11-14 (runs in every VoiceFlow workflow) |
| subosito/flutter-action | v2.18.0 | VERIFIED 2026-11-14 (Linux, Windows) |
| actions/setup-java v4.7.0, actions/upload-artifact v4.6.0, actions/download-artifact v4.1.8, reactivecircus/android-emulator-runner v2.33.0 | as named | VERIFIED 2026-11-14 (release + Android workflows ran green) |
| supabase/setup-cli | v1.5.0 | NOT-VERIFIED (only used by the optional `voiceflow-polish-deploy.yml`, never run) |
| Gemini model id | `gemini-3.5-flash-lite` (fallback; adapter lists models and picks newest flash-lite) | NOT-VERIFIED |
| Gemini endpoint/header | `v1beta/models/{m}:generateContent`, `x-goog-api-key` | NOT-VERIFIED against live API |
| sherpa_onnx (Flutter/Dart) | 2.0.1, Apache-2.0, has windows + android (arm64/armeabi/x86/x86_64) + linux packages | VERIFIED 2026-11-13 (pub.dev) |
| STT model (S1 baseline) | Whisper base.en int8, `sherpa-onnx-whisper-base.en.tar.bz2` from k2-fsa/sherpa-onnx `asr-models` release, sha256 `475bc7052ce299c007f6d5d5407ba8601f819a2867f6eecee510ed17df581542`; Whisper weights MIT | VERIFIED download + run on Linux, Windows runner and Android x86_64 emulator |
| Moonshine, Parakeet, Silero VAD, Piper voices, WASAPI pkg, Inno Setup, hotword support | — | pending |
| Android release manifest needs `INTERNET` | Flutter adds it only to debug/profile builds; main manifest now declares it, audited in CI | enforced by the APK audit in CI (see AGENTLOG M4 for the run) |
| Polish function reachable with the shipped URL + public key | `voiceflow-polish-check.yml` | see AGENTLOG M4 for the measured answer |
