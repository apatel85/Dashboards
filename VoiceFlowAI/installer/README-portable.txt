VoiceFlow (portable)
====================
1. Unzip this folder anywhere you can write to (not "Program Files").
2. Run voiceflow_app.exe. The first run walks you through microphone choice and a
   one-time speech-model download (about 160 MB); after that dictation works offline.
3. Windows SmartScreen will warn that the app is unrecognised: it is not code-signed
   (signing certificates cost money; this project is $0). Choose "More info" -> "Run anyway".
   Some antivirus tools may also flag it, because it uses a global keyboard hook and
   synthesised keystrokes (that is how dictation reaches other apps). Source: the GitHub repo.

Default keys:  hold F9 = talk, release = insert | double-tap F9 = hands-free (tap to stop)
               Esc = cancel | Ctrl+Alt+Z = undo last insertion | Ctrl+Alt+P = next style profile

To remove everything: delete this folder and the folder  %APPDATA%\dev.voiceflow  (settings, speech model).
