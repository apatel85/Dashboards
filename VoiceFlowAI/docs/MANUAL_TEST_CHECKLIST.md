# Manual checklist - Windows (owner only, about 15 minutes)

Things automated tests cannot prove: a real microphone, real apps, a real screen.
Download from the latest `voiceflow-v…` release. Tick each box and write what you saw. If something fails, note the app and what happened; that is all I need.

| # | Do this | Expect | Pass? | Notes |
|---|---|---|---|---|
| **W1** | Run `VoiceFlow-Setup-x.y.z.exe`. SmartScreen: *More info → Run anyway*. Finish the wizard. | Installs without asking for admin. Start-menu entry "VoiceFlow" exists. | ☐ | |
| **W2** | First launch: onboarding. Pick your microphone, talk, watch the bar. Download the model. Finish "Try it" with the Record button. | Bar moves when you talk. Model downloads (about 160 MB), shows progress; Pause then Download resumes. After Stop you get clean text and it is on your clipboard. | ☐ | |
| **W3** | Click into **Notepad**, hold **F9**, say "um hi john comma thanks for the update period", release. Repeat in **Word**, a **browser text box**, **VS Code**, **Slack**. | A small pill appears at the bottom centre while you talk. Text appears at the cursor: "Hi John, thanks for the update." The app you are typing in never loses focus. | ☐ | which apps worked / failed? |
| **W4** | Double-tap **F9**, talk for 10 s, tap **F9** again. Then hold **F9**, talk, press **Esc**. | Hands-free works and stops on the tap. Esc cancels; nothing is typed. | ☐ | |
| **W5** | After an insertion press **Ctrl+Alt+Z**. Then insert again, click into a different window, press **Ctrl+Alt+Z**. | First: exactly that text disappears. Second: nothing is deleted. | ☐ | |
| **W6** | Right-click Notepad → *Run as administrator*, hold **F9** and talk. | Pill says "This window needs VoiceFlow run as admin. Text saved." Nothing typed; the text is in the tray menu → Copy. | ☐ | |
| **W7** | Copy some text (or an image). Dictate into Notepad. Paste (**Ctrl+V**) somewhere. Open **Win+V**. | Your original clipboard comes back. The dictated text is NOT in the Win+V history. | ☐ | |
| **W8** | Tray icon: switch style, tick *Start with Windows*, close the main window, sign out and in. Press **Ctrl+Alt+P**. Quit from the tray. | Closing hides to the tray. After sign-in VoiceFlow is running hidden in the tray. Ctrl+Alt+P shows the new style name briefly. Quit really quits. | ☐ | |
| **W9** | Settings → Apps → uninstall VoiceFlow. | Gone from Start; tray icon gone. (Data stays in `%APPDATA%\dev.voiceflow`.) | ☐ | |

Also tell me: Did anything look ugly, cramped, or confusing? Was the pill readable on your screen? Was dictation fast enough? (Target: text within ~3 s of releasing the key for a 10 s sentence.)

Known gaps (do not report as bugs): browser password fields are not detected; English only; no Settings page yet.
