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

---

# Manual checklist - Android keyboard (owner only, about 20 minutes)

Needs a real phone (Android 8+, 64-bit ARM, almost every phone since 2017). The emulator in CI has a silent microphone, so **nothing below has been proven with a real voice yet**.
Download `VoiceFlow-x.y.z-arm64.apk` from the latest `voiceflow-v…` release. It is debug-signed, so Play Protect may warn: that is expected.

| # | Do this | Expect | Pass? | Notes |
|---|---|---|---|---|
| **A1** | Open the APK from your browser or Files app. Allow "Install unknown apps" if asked, then install and open **VoiceFlow**. | Installs. The first screen is a checklist "Set up VoiceFlow keyboard", with only the first step open. | ☐ | |
| **A2** | Tap **Open keyboard settings**, switch **VoiceFlow** on, go back. Then tap **Choose keyboard** and pick VoiceFlow. | Each step gets a tick when you return to the app. Android shows its usual "other keyboard" warning when you enable it: that is the system, not us. | ☐ | |
| **A3** | Tap **Allow microphone**, allow it. Then **Download** the speech model (about 160 MB). Try Pause then Download. | Tick appears. Progress shows; pausing keeps what was downloaded. After install the "Try it" box and **Done** button appear. | ☐ | |
| **A4** | Tap the Try-it box. Tap the microphone on the keyboard, say "um hi john comma can we meet thursday period", tap the microphone again. | Mic turns red and pulses with your voice, shows "Listening…", then "Working…", then "Hi John, can we meet Thursday." appears and the status says "Inserted · tap ↶ to undo". Within about 3 s. | ☐ | how long did it take? |
| **A5** | Tap **↶**. Dictate again, then tap **✕** while it says "Working…". | ↶ removes exactly the dictated text. ✕ discards the result: nothing is typed. | ☐ | |
| **A6** | In your messages app, a browser address bar, an email "To" field, a phone-number box. Dictate into each. | Address bar: a web address with no spaces. Email field: an address like `john@example.com`. Phone box: digits only. Normal text boxes: prose. | ☐ | which apps? |
| **A7** | Open any password field (a sign-in page). | The mic shows a lock and says "Dictation is off in password fields". Tapping it does nothing. | ☐ | |
| **A8** | Tap the style chip (top left) a few times, dictate; switch to another app and back. Hold **⌫**. Tap **🌐**. | The style name changes and is remembered per app. ⌫ repeats while held. 🌐 switches to your other keyboard. Keys feel responsive (haptic tick), text is readable in light and dark mode. | ☐ | |

Also tell me: was it fast enough, did the keyboard ever vanish or lag, did your battery or phone get hot, did anything look cramped or confusing? TalkBack users: are the buttons announced sensibly?

Known gaps (do not report as bugs): no hold-to-talk mode; the style chip only cycles (no list); English only; no Settings page yet; utterances longer than ~28 s are cut off.

---

# Packs (added with M3) - Windows and Android

| # | Do this | Expect | Pass? | Notes |
|---|---|---|---|---|
| **W10** | Open **Packs**. Switch on *Healthcare (Clinic Notes)* and use the arrows to put it above *General Business*. Dictate into Notepad: "bp one forty over ninety, heart rate seventy two beats per minute". | Text reads "BP 140/90, heart rate 72 bpm." The healthcare card says "Stays on this device". Switch it off: the same sentence no longer says 140/90. | ☐ | |
| **W11** | Switch both packs off. Focus Outlook or Slack (if you have them) and look at **Home**. | A card offers "Turn on the General Business pack?" and nothing changes until you press *Turn on*. *Dismiss* hides it until you restart. | ☐ | |
| **W12** | Import a pack: save a `.json` pack file (a copy of one in the repo's `app/assets/packs/` with a new `id` works) and use *Import a pack file*. Then import a broken one (delete a closing brace). | The good one appears and survives a restart. The broken one shows a plain-language reason and does not crash anything. | ☐ | |
| **A9** | Android: open the app's **Packs** tab (bottom bar) and switch a pack on and off. Then use a matching app (for example one with a package like `com.slack` for General Business) and look at the keyboard's second chip. | Switching works and is remembered. The chip shows "+ Pack name" for a matching app; tapping turns the pack on and it disappears, holding dismisses it. | ☐ | which app? |

Known gaps (do not report as bugs): window-title matching is not wired yet; Dictionary is still a placeholder (on phones its bottom-bar slot shows Packs); sample packs are illustrative only.
