# PINS — verified facts (spec rule 7). Only entries marked VERIFIED are trusted.
| Item | Value | Status |
|---|---|---|
| Flutter | 3.50.0 stable (Dart 3.14.0), from storage.googleapis.com releases json | VERIFIED 2026-11-13 |
| actions/checkout | v4.2.2 | NOT-VERIFIED (no access to action repos from authoring env; CI will show) |
| subosito/flutter-action | v2.18.0 | NOT-VERIFIED |
| supabase/setup-cli | v1.5.0 | NOT-VERIFIED |
| Gemini model id | `gemini-3.5-flash-lite` (fallback; adapter lists models and picks newest flash-lite) | NOT-VERIFIED |
| Gemini endpoint/header | `v1beta/models/{m}:generateContent`, `x-goog-api-key` | NOT-VERIFIED against live API |
| sherpa_onnx (Flutter/Dart) | 2.0.1, Apache-2.0, has windows + android (arm64/armeabi/x86/x86_64) + linux packages | VERIFIED 2026-11-13 (pub.dev) |
| STT model (S1 baseline) | Whisper base.en int8, `sherpa-onnx-whisper-base.en.tar.bz2` from k2-fsa/sherpa-onnx `asr-models` release, sha256 `475bc7052ce299c007f6d5d5407ba8601f819a2867f6eecee510ed17df581542`; Whisper weights MIT | VERIFIED download + run on Linux, Windows runner and Android x86_64 emulator |
| Moonshine, Parakeet, Silero VAD, Piper voices, WASAPI pkg, Inno Setup, hotword support | — | pending |
