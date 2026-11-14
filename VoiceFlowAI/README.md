# VoiceFlow AI

Hold a key (Windows) or tap the mic (Android keyboard), speak, and clean text appears in the app you are typing in. Personal, free ($0), private by default. English first.

**Status:** pre-release. Everything below is covered by automated tests on real Windows and Android-emulator runners (see `AGENTLOG.md` for exactly what is and is not verified). **Nothing has been tried yet with a real voice on a real PC or phone**: the owner checklists in `docs/MANUAL_TEST_CHECKLIST.md` (W1–W12, A1–A9) are still to be run.

## Install on Windows
1. Open the download page (`index.html`) or the GitHub Releases entry named `voiceflow-v…` and download **VoiceFlow-Setup-x.y.z.exe** (or the portable zip).
2. **SmartScreen will warn** ("Windows protected your PC") because the app is **not code-signed**. Click **More info → Run anyway**. Compare the file with the SHA-256 in the release notes if you want to be sure.
3. Some antivirus tools may flag it: it installs a global keyboard hook and synthesises keystrokes so it can type into other apps. That is how dictation works; the source is in this repo.
4. First run: pick your microphone, then download the speech model once (≈160 MB, verified by SHA-256). After that it works offline.

## Install on Android (sideload)
1. On the phone, open the release page and download **VoiceFlow-x.y.z-arm64.apk** (64-bit ARM phones, Android 8+). Check it against the SHA-256 in the release notes.
2. Open the file. Android asks you to allow **Install unknown apps** for your browser or file manager: allow it for that one app. **Play Protect may warn** because the build is signed with a debug key, not a store key.
3. Open **VoiceFlow**. A checklist guides you: turn the keyboard on → choose it as your keyboard → allow the microphone → download the speech model once (≈160 MB) → try it.
4. In any text box, tap the microphone on the VoiceFlow keyboard, speak, tap it again.
If a properly signed build replaces this one later, uninstall and reinstall once.

## Use
**Windows**

| Key | Action |
|---|---|
| hold **F9** | talk; release to insert at the cursor of whatever app has focus |
| double-tap **F9** | hands-free; tap again to stop |
| **Esc** | cancel |
| **Ctrl+Alt+Z** | undo the last insertion (same window, within 30 s) |
| **Ctrl+Alt+P** | next style: Casual · Business · Professional · AI Prompting |

The tray icon menu switches style, copies the last dictation, and toggles *Start with Windows*. The main window has a Record button and a "Try it" box that always work.

**Android keyboard:** the chip at top left is the style (tap to change; remembered per app), the mic starts and stops dictation (✕ cancels, ↶ undoes, auto-stops at 28 s), email, web-address and number fields get literal text, and **password fields are blocked** (the mic shows a lock). A second chip may suggest a pack for the app you are in.

**Both:** *Packs* teach VoiceFlow the words, abbreviations and note templates of your work (two illustrative samples ship: General Business and Healthcare Clinic; you can import your own `.json` pack, invalid ones are refused with a plain reason). *Settings* holds cloud polish, a backup/restore of your settings, and the licenses.

## Privacy (what leaves your device, exactly)
* **Audio never leaves your device** and is not saved. No accounts, analytics, telemetry or crash reports. Dictated text is not stored anywhere (there is no history yet).
* **One download:** the speech model, once, from GitHub (pinned address and SHA-256, refused if it does not match).
* **Cloud polish is off by default.** If you turn it on (asks you first), only the *text* is sent, to a function run for this app which forwards it to an AI service and returns a tidier version. The AI provider keys are server-side secrets; **no API key is stored in or shipped with the app**. It is never used while a pack that keeps data on the device (such as Healthcare Clinic) is on. You can instead point it at a model on your own computer (Ollama): then nothing leaves the device.
* Settings backups never contain keys or dictated text, and a settings file cannot turn cloud polish on: you do that on each device.
* Windows keeps your clipboard around each paste and keeps dictated text out of Win+V history and cloud clipboard sync.

## Known limits
* Not code-signed (SmartScreen warning on Windows, Play Protect warning on Android, possible antivirus heuristics). The APK is signed with a debug key.
* Windows: password fields are only detected in classic text boxes; **browser password fields are not detected**: do not dictate while one is focused. Windows running as administrator cannot receive typed text from a non-admin VoiceFlow: you get a notice and the text is saved.
* Android: no hold-to-talk mode yet; the style chip only cycles; the microphone permission is requested from the app's checklist, not from the keyboard.
* English only. Whisper "base.en" model. Utterances over about 28 s are cut off rather than split at pauses.
* Pack suggestions use the app (and, on Windows, the last thing you said); matching on window titles is not wired up yet. The sample packs are illustrative and make no clinical or legal accuracy claim.
* No history page and no Dictionary page yet. The hotkey is configurable in code but not in Settings.
* While the speech model is loaded the app uses roughly 0.5 GB more memory; it unloads itself after 5 idle minutes (the Android keyboard drops its whole engine).

## Remove
Windows: uninstall from *Settings → Apps*; settings and the model stay in `%APPDATA%\dev.voiceflow`: delete that folder to remove everything. Android: uninstall the app (this removes its data and the model).

## Build from source
Flutter 3.50 (Dart 3.14). `packages/core` is pure Dart (`dart test`). `app/` is the Flutter app (`flutter test`, `flutter build windows --release`, `flutter build apk --release --flavor prod`; the `e2e` flavor is a test build with a test seam and is never published). `tool/check.sh` runs the core checks; `tool/license_audit.dart` audits licenses. CI definitions are in `/.github/workflows/voiceflow-*.yml`. See `docs/VOICEFLOW_BUILD_SPEC.md` and `AGENTLOG.md`.

## Licenses
See `docs/THIRD_PARTY.md`. Speech model: OpenAI Whisper weights (MIT) via the sherpa-onnx project (Apache-2.0).
