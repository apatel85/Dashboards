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

# Manual checklist - Android floating button (owner only, about 20 minutes)

Needs a real phone (Android 8+, 64-bit ARM, almost every phone since 2017). The emulator in CI has a silent microphone, so **nothing below has been proven with a real voice yet**.
Download `VoiceFlow-x.y.z-arm64.apk` from the latest `voiceflow-v…` release. It is debug-signed, so Play Protect may warn: that is expected.

| # | Do this | Expect | Pass? | Notes |
|---|---|---|---|---|
| **A1** | Open the APK from your browser or Files app. Allow "Install unknown apps" if asked, then install and open **VoiceFlow**. | Installs. The first screen is a checklist "Set up VoiceFlow", with only the first step open. | ☐ | |
| **A2** | Tap **Allow microphone**. Then **Open display settings**, switch **VoiceFlow** on, go back. Then **Open accessibility settings**, open VoiceFlow typing and switch it on, go back. | Each step gets a tick when you return to the app. Android shows a warning when you enable an accessibility service: that is the system; the description says what it does and does not do. | ☐ | |
| **A3** | **Download** the speech model (about 160 MB). Try Pause then Download. Then tap **Show button**. | Progress shows; pausing keeps what was downloaded. A round blue mic appears over the screen and a "VoiceFlow button is on" notification shows. The "Try it" box and **Done** button appear. | ☐ | |
| **A4** | Tap the Try-it box (your normal keyboard opens). Tap the floating mic, say "um hi john comma can we meet thursday period", tap the mic again. | The button turns red and pulses with your voice, then amber while working, then "Hi John, can we meet Thursday." appears in the box at the cursor and a note says "Inserted". Within about 3 s. Your normal keyboard stays up the whole time. | ☐ | how long did it take? |
| **A5** | Say "scratch that" as its own dictation. Dictate again, then long-press the button while it is red (listening). | "Scratch that" removes exactly the last dictated text. Long-press while listening cancels: nothing is typed. | ☐ | |
| **A6** | In your messages app, a browser address bar, an email "To" field, a phone-number box. Dictate into each. | Address bar: a web address with no spaces. Email field: an address like `john@example.com`. Phone box: digits only. Normal text boxes: prose. | ☐ | which apps? |
| **A7** | Open any password field (a sign-in page). | Tap the password box, then the button: a note says "Dictation is off in password fields" and it does not record. | ☐ | |
| **A8** | Long-press the idle button a few times, dictate; switch to another app and back. Drag the button to the other side of the screen and to the bottom. | A note shows the new style name each time; it is remembered per app. The button stays where you drop it and does not take focus away from the text box. | ☐ | |
| **A13** | Open any app and look at the home screen, then tap into a text box, then leave the box (go Home). | No floating button on the home screen. It appears when you tap a text box (or the keyboard opens) and goes away shortly after you leave. It never appears in a password box. | ☐ | which apps did not show it? |
| **A16** | Dictate: "We are meeting on Monday. At nine am with the client. Actually, it's not Monday, it's Tuesday at ten am." in Business and Professional. | Only "Tuesday" and "10 am" remain; no sentence starts with "So"; a new point starts a new paragraph. | ☐ | what did it hear? |
| **A17** | Style tab -> *Add another app*: tap the box. | A searchable list of your apps appears; pick one, choose a style, tap Add; the app appears in the list above with its name. Dictate in it: that style is used. | ☐ | |
| **A14** | In WhatsApp, tap the message box (it shows the grey word "Message") and dictate "we can connect after nine forty five that works". | The box receives only your sentence: "We can connect after 9:45 PM that works." (AM before noon, PM otherwise). The word "Message" is NOT typed. | ☐ | which app/keyboard? |
| **A15** | Style tab -> *Style for each app*: check Gmail says Professional and WhatsApp Casual. Change one, dictate in that app. In Claude or ChatGPT dictate a request with a role, a task and "do not use jargon". | Each app uses its style. In Claude the result has `<task>` tags; in ChatGPT `### Task` headings. An open-ended request with no length ends with "Start concise (about 200 words); offer more detail if needed." | ☐ | which AI app? |
| **A12** | The no-limit fix: dictate for two minutes without stopping (read a page of a book), then tap the button to stop. | All of it is typed after you stop, in order, with no cut-off at 30 seconds. | ☐ | words missing at the joins? |

Also tell me: was it fast enough, did the button ever vanish or lag, which apps would not accept text (it falls back to the clipboard), did your battery or phone get hot, did anything look cramped or confusing? TalkBack users: are the buttons announced sensibly?

Known gaps (do not report as bugs): no hold-to-talk mode; long-press only cycles the style (no list); English only; the button is not restored after a reboot.

---

# Packs (added with M3) - Windows and Android

| # | Do this | Expect | Pass? | Notes |
|---|---|---|---|---|
| **W10** | Open **Packs**. Switch on *Healthcare (Clinic Notes)* and use the arrows to put it above *General Business*. Dictate into Notepad: "bp one forty over ninety, heart rate seventy two beats per minute". | Text reads "BP 140/90, heart rate 72 bpm." The healthcare card says "Stays on this device". Switch it off: the same sentence no longer says 140/90. | ☐ | |
| **W11** | Switch both packs off. Focus Outlook or Slack (if you have them) and look at **Home**. | A card offers "Turn on the General Business pack?" and nothing changes until you press *Turn on*. *Dismiss* hides it until you restart. | ☐ | |
| **W12** | Import a pack: save a `.json` pack file (a copy of one in the repo's `app/assets/packs/` with a new `id` works) and use *Import a pack file*. Then import a broken one (delete a closing brace). | The good one appears and survives a restart. The broken one shows a plain-language reason and does not crash anything. | ☐ | |
| **A9** | Android: open the app's **Packs** tab (bottom bar) and switch a pack on and off. Pack suggestions are not shown by the Android button; turn packs on from this tab. | Switching works and is remembered. With the Cricket pack on, "one fifty for three" is typed as "150/3". | ☐ | which app? |

Known gaps (do not report as bugs): window-title matching is not wired yet; Dictionary is still a placeholder (on phones its bottom-bar slot shows Packs); sample packs are illustrative only.

---

# Settings, cloud polish and battery (added with M4) - Windows and Android

| # | Do this | Expect | Pass? | Notes |
|---|---|---|---|---|
| **W13** | Open **Settings**. Check that *Use cloud polish* is **off**. Turn it on. | A dialog explains that your *text* (never audio) is sent to an AI service and asks you to agree. *Cancel* leaves it off. *I agree* turns it on. | ☐ | |
| **W14** | With cloud polish on, press **Test polish**. Then dictate "um so we should probably ship the new build on friday" into Notepad. | The test says "Works: …" with a sentence. The dictation arrives tidied. Turn polish off and repeat: dictation still works (formatted on the device, slightly less polished). Try with no internet: dictation still arrives. | ☐ | how long did it take? |
| **W15** | Settings → *Copy settings to clipboard*, paste somewhere to read it. Change something (style, add a Packs entry), then *Restore from a file* using a file you saved from that text. | The pasted text has no keys and no dictated text. Restoring brings your earlier choices back. A damaged file is refused with a plain reason and changes nothing. | ☐ | |
| **A10** | Android, about 30 minutes: use the floating button normally (dictate 10-15 times), then leave the phone idle for 10 minutes. Check *Settings → Battery* for VoiceFlow. | VoiceFlow is not among the top battery users; the phone is not warm while idle. After 5 idle minutes the button's memory drops (the speech model unloads). The "button is on" notification stays until you hide it. | ☐ | battery % used |
| **A11** | Android: install over an older VoiceFlow build is not required; on a fresh install, finish the setup checklist and let the **model download run with the screen on, over Wi-Fi**. | Progress shows, completes, and the Try-it box appears. (This is the step that needs the network permission; the automated emulator test also covers it.) | ☐ | |

Known gaps (do not report as bugs): no history page, no Dictionary page, hotkey not editable in Settings.
