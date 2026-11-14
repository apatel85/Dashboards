# VoiceFlow AI

Hold a key, speak, and clean text appears in the app you are typing in. Personal, free ($0), private by default.

**Status:** Windows app works end to end in automated tests (see `AGENTLOG.md` for exactly what is and is not verified). Android keyboard is a proven prototype only; not released.

## Install (Windows)
1. Open the download page (`index.html`, or the GitHub Releases entry named `voiceflow-v…`) and download **VoiceFlow-Setup-x.y.z.exe** (or the portable zip).
2. **SmartScreen will warn** ("Windows protected your PC") because the app is **not code-signed**. Click **More info → Run anyway**. Check the file against the SHA-256 in the release notes if you want to be sure.
3. Some antivirus tools may flag it: it installs a global keyboard hook and synthesises keystrokes so it can type into other apps. That is how dictation works; the source is in this repo.
4. First run: pick your microphone, then download the speech model once (≈160 MB, verified by SHA-256). After that it works offline.

## Use
| Key | Action |
|---|---|
| hold **F9** | talk; release to insert at the cursor of whatever app has focus |
| double-tap **F9** | hands-free; tap again to stop |
| **Esc** | cancel |
| **Ctrl+Alt+Z** | undo the last insertion (same window, within 30 s) |
| **Ctrl+Alt+P** | next style: Casual · Business · Professional · AI Prompting |

The tray icon menu switches style, copies the last dictation, and toggles *Start with Windows*. The main window has a Record button and a "Try it" box that always work (copy mode).

## Privacy
* Audio never leaves your computer and is not saved.
* No accounts, analytics, or telemetry.
* **Cloud polish is off by default.** If you turn it on, only *text* is sent, through a Supabase Edge Function that holds the API key as a server-side secret. **No API key is stored in or shipped with the app.**
* Your clipboard is saved and restored around each paste, and dictated text is kept out of Win+V history and cloud clipboard sync.

## Known limits
* Not code-signed (SmartScreen warning, possible antivirus heuristics).
* Password fields are only detected in classic Windows text boxes; **browser password fields are not detected**: do not dictate while one is focused.
* Windows that run as administrator cannot receive typed text from a non-admin VoiceFlow; you get a notice and the text is saved.
* English only. Whisper "base.en" model; very long utterances (> ~28 s) are not yet split at pauses.
* While the speech model is loaded the app uses roughly 0.5 GB more memory; it unloads itself after 5 idle minutes.

## Remove
Uninstall from *Settings → Apps*. Settings and the downloaded model stay in your profile (`%APPDATA%\dev.voiceflow`); delete that folder to remove everything.

## Build from source
Flutter 3.50 (Dart 3.14). `packages/core` is pure Dart (`dart test`). `app/` is the Flutter app (`flutter test`, `flutter build windows --release`). CI definitions are in `/.github/workflows/voiceflow-*.yml`. See `docs/VOICEFLOW_BUILD_SPEC.md` and `AGENTLOG.md`.

## Licenses
See `docs/THIRD_PARTY.md`. Speech model: OpenAI Whisper weights (MIT) via the sherpa-onnx project (Apache-2.0).
