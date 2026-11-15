# VoiceFlow AI

Hold a key (Windows) or tap the floating mic button (Android), speak, and clean text appears in the app you are typing in. Personal, free ($0), private by default. English first.

**Status:** pre-release. Everything below is covered by automated tests on real Windows and Android-emulator runners (see `AGENTLOG.md` for exactly what is and is not verified). **Nothing has been tried yet with a real voice on a real PC or phone**: the owner checklists in `docs/MANUAL_TEST_CHECKLIST.md` (W1–W12, A1–A12) are still to be run.

## Install on Windows
1. Open the download page (`index.html`) or the GitHub Releases entry named `voiceflow-v…` and download **VoiceFlow-Setup-x.y.z.exe** (or the portable zip).
2. **SmartScreen will warn** ("Windows protected your PC") because the app is **not code-signed**. Click **More info → Run anyway**. Compare the file with the SHA-256 in the release notes if you want to be sure.
3. Some antivirus tools may flag it: it installs a global keyboard hook and synthesises keystrokes so it can type into other apps. That is how dictation works; the source is in this repo.
4. First run: pick your microphone, then download the speech model once (≈160 MB, verified by SHA-256). After that it works offline.

## Install on Android (sideload)
1. On the phone, open the release page and download **VoiceFlow-x.y.z-arm64.apk** (64-bit ARM phones, Android 8+). Check it against the SHA-256 in the release notes.
2. Open the file. Android asks you to allow **Install unknown apps** for your browser or file manager: allow it for that one app. **Play Protect may warn** because the build is signed with a debug key, not a store key.
3. Open **VoiceFlow**. A checklist guides you: allow the microphone → allow the floating button (display over other apps) → turn on the VoiceFlow typing service (Accessibility) → download the speech model once (≈160 MB) → show the button.
4. In any text box, tap it so the cursor is there, tap the floating mic, speak (any length), tap the mic again. Your normal keyboard is untouched.
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

**Android floating button:** it appears only while you are typing (a text box is focused or the keyboard is up) and disappears on the home screen and in password fields. Tap to start, tap to stop; drag it anywhere (it remembers the spot). **Press and hold** the idle button to open a style chooser (Casual, Business, Professional, AI prompting; the current one is ticked, the choice is remembered for the app you are typing in); press and hold while listening cancels. If "working" ever drags on, tap the button to abandon it. There is **no time limit**: audio is cut at your pauses and transcribed while you talk. Email, web-address and number fields get literal text, and **password fields are refused**. Saying "scratch that" removes the last dictation. If no text box has focus, the text is left on the clipboard instead of lost. The typing is done by an Android accessibility service that only inserts text you dictated and never reads or stores the screen.

**Styles:** *Casual* keeps your words. *Business* swaps slang for plain workplace wording ("figure out" → "determine"), and *Professional* goes further with formal vocabulary and connectors ("Additionally,", "However,"); both lay a longer message out in short paragraphs with the greeting and closing on their own lines. *AI Prompting* strips greetings, filler and chatter and, for a multi-part dictation, writes labelled lines (Role / Goal / Context / Task / Include / Avoid / Output). A spoken self-correction ("Monday, actually Tuesday") keeps only the corrected version. A bare opening "Hi," / "Hello," is not kept in Business, Professional or AI Prompting; a named one ("Hi John,") is.

**Style for each app:** VoiceFlow picks a style from the app you are typing in: email apps (Gmail, Outlook, ...) Professional, work chat (Slack, Teams) Business, personal chat (WhatsApp, Telegram, Messages) Casual, AI apps (Claude, ChatGPT, Gemini, Copilot, Perplexity, DeepSeek) AI Prompting. Open *Style*, scroll to *Style for each app* to change any of them or add another app by its id. An app that is not listed uses your default style. Tap the *Add another app* box to pick from the apps on your phone (or, on Windows, the programs open right now), search by name, choose a style and add it; an app that is not in the list can be typed as an id. The ids are the best-known ones and are not verified on every phone; a browser-based AI (claude.ai in Chrome) cannot be recognised, so set the browser's style by hand.

**AI Prompting: plain line or labelled parts?** A fixed scoring rule (no AI call) decides. A general or quick question stays one short line (plus the length hint when it is open-ended). A real brief gets labelled parts: points for length (35+ words, more at 80+), several separate asks, build/bug vocabulary (app, feature, bug, error, function, API, database...), explicit constraints (include / avoid / output), and a stated role; 3 or more points, at least two distinct parts, and not a very short prompt (under 20 words) gives the labelled layout.

**AI Prompting layout and length (Settings):** the layout follows the AI app (XML tags for Claude, `### Task` sections for ChatGPT, labelled lines otherwise) and can be forced. A length you speak ("under 100 words") is kept exactly. If you give none for an open-ended request, the prompt ends with "Start concise (about 200 words); offer more detail if needed." - switch that off with *Exactly what I say*. See `docs/AI_PROMPTING_RESEARCH.md` for the sources and what is design choice versus established practice.

**Corrections and tidy-up:** "We are meeting on Monday. At 9 am. Actually, it's not Monday, it's Tuesday at 10 am" keeps only Tuesday at 10 am, even a few sentences back and even when the speech model garbles the old value. Business and Professional drop a sentence-opening "So" ("So this is what we do" -> "This is what we do"), keep your own paragraph breaks, and start a new paragraph at a new point ("Goal is...", "And one of the...", "However...").

**Words the speech model gets wrong:** look-alikes are chosen from context ("tax messages" -> "text messages", "buck fixing" -> "bug fixing", "cash" -> "cache", "sequel" -> "SQL"), "get hub / java script / chat gpt" become GitHub / JavaScript / ChatGPT, and "a/an" follow the next word. A retraction can be its own sentence ("No, sorry.") and can fix a day, time, date, amount, percent, quantity, name or place; if the speech model dropped the retraction, a very short "It's on Tuesday at 10 am." right after the same kind of fact replaces it. A 48-dictation test corpus covers this: see `docs/CORRECTION_CORPUS_REPORT.md`.

**Fits the sentence it goes into:** on Android the typing service reads a few characters either side of the cursor (on the device only; never stored, logged or sent), so dictating in the middle of a sentence does not start with a capital or end with a full stop. See `docs/COMPETITOR_RESEARCH.md` for what Lemon, Wispr Flow and Fireflies publish and what we did and did not take from them.

**Times:** "after nine forty five" becomes "after 9:45 PM": with no AM/PM spoken, before noon on your phone's clock gives AM, otherwise PM. Say "AM" or "PM" (or "in the morning") and that wins.

**Both:** *Packs* teach VoiceFlow the words, abbreviations and note templates of your work (three illustrative samples ship: General Business, Healthcare Clinic and Cricket; you can import your own `.json` pack, invalid ones are refused with a plain reason). *Settings* holds cloud polish, a backup/restore of your settings, and the licenses.

## Privacy (what leaves your device, exactly)
* **Audio never leaves your device** and is not saved. No accounts, analytics, telemetry or crash reports. Dictated text is not stored anywhere (there is no history yet).
* **One download:** the speech model, once, from GitHub (pinned address and SHA-256, refused if it does not match).
* **Cloud polish is off by default.** If you turn it on (asks you first), only the *text* is sent, to a function run for this app which forwards it to an AI service and returns a tidier version. The AI provider keys are server-side secrets; **no API key is stored in or shipped with the app**. It is never used while a pack that keeps data on the device (such as Healthcare Clinic) is on. You can instead point it at a model on your own computer (Ollama): then nothing leaves the device.
* Settings backups never contain keys or dictated text, and a settings file cannot turn cloud polish on: you do that on each device.
* Windows keeps your clipboard around each paste and keeps dictated text out of Win+V history and cloud clipboard sync.

## Known limits
* Not code-signed (SmartScreen warning on Windows, Play Protect warning on Android, possible antivirus heuristics). The APK is signed with a debug key.
* Windows: password fields are only detected in classic text boxes; **browser password fields are not detected**: do not dictate while one is focused. Windows running as administrator cannot receive typed text from a non-admin VoiceFlow: you get a notice and the text is saved.
* Android: no hold-to-talk mode yet; the button is not restored after a reboot or after Android stops the app (open VoiceFlow and tap Show button); pack suggestions and the Undo button of the old keyboard are gone (use *Packs* in the app and say "scratch that"). Some apps (certain games, banking apps, custom-drawn text fields) do not expose their text box to accessibility services, so typing there falls back to the clipboard.
* English only. Whisper "base.en" model. Long dictations are split at pauses (about every 8-24 s) and joined; a forced cut inside an unbroken 24 s stretch can slightly mangle the word at the cut.
* Pack suggestions use the app (and, on Windows, the last thing you said); matching on window titles is not wired up yet. The sample packs are illustrative and make no clinical or legal accuracy claim.
* No history page and no Dictionary page yet. The hotkey is configurable in code but not in Settings.
* While the speech model is loaded the app uses roughly 0.5 GB more memory; it unloads itself after 5 idle minutes (the Android button drops its whole engine).

## Remove
Windows: uninstall from *Settings → Apps*; settings and the model stay in `%APPDATA%\dev.voiceflow`: delete that folder to remove everything. Android: uninstall the app (this removes its data and the model).

## Build from source
Flutter 3.50 (Dart 3.14). `packages/core` is pure Dart (`dart test`). `app/` is the Flutter app (`flutter test`, `flutter build windows --release`, `flutter build apk --release --flavor prod`; the `e2e` flavor is a test build with a test seam and is never published). `tool/check.sh` runs the core checks; `tool/license_audit.dart` audits licenses. CI definitions are in `/.github/workflows/voiceflow-*.yml`. See `docs/VOICEFLOW_BUILD_SPEC.md` and `AGENTLOG.md`.

## Licenses
See `docs/THIRD_PARTY.md`. Speech model: OpenAI Whisper weights (MIT) via the sherpa-onnx project (Apache-2.0).
