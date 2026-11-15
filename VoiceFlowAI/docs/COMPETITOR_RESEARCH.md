# What Lemon, Wispr Flow and Fireflies publish about how they work, and what we took

Researched 2026-11-15 by web search. **None of the three publishes its engine internals** (which speech model,
which language model, how the stages are split between phone and cloud). Everything below is what their own docs
or third-party reviews say, labelled by source. I could not "see the engine"; I could only read what is public.

| Product | What it is | What is public | Reliability |
|---|---|---|---|
| **Lemon (HeyLemon.AI)** | A Mac voice agent: hold a key, speak, it carries out tasks (reply to email, create a document). Free download, macOS only. | Product-page level only: dictation with automatic filler removal, and task execution. No detail on its dictation or prompt engine. | third-party listings and a review ([vibecoding.app review](https://vibecoding.app/blog/lemon-ai-review), [toolradar](https://toolradar.com/tools/lemon/alternatives)); it was described as a task agent rather than a dictation tool |
| **Wispr Flow** | Hotkey dictation that cleans up and formats text for the app you are in. | Cleans filler words, fixes structure, formats lists, understands spoken corrections, adapts tone to the active app. Its **Context Awareness** feature reads the active app and, from text (not screenshots), matches casing, spacing and punctuation to the surrounding text; it sends the app name and website domain with each dictation; context reading is skipped when it cannot finish quickly so dictation is never slowed; a Command Mode edits selected text. | Wispr's own docs for Context Awareness ([docs.wisprflow.ai](https://docs.wisprflow.ai/articles/4678293671-feature-context-awareness)); processing is described by reviews as cloud-based (one review claims local-only: unverified, conflicting) |
| **Fireflies.ai** | Meeting recorder: joins calls, transcribes, summarises. | Described as proprietary speech-to-text plus language models for summaries, action items and search. A different product from dictation. | its own blog and third-party write-ups ([Fireflies blog](https://fireflies.ai/blog/what-is-ai-transcription/)); no ASR model named |

The shared pattern all three (and most dictation tools) describe: **speech recognition, then a language model
that cleans, formats and fits the text to its destination**. That is the same shape as VoiceFlow (Whisper on the
phone, then rules, then optional cloud polish).

## What VoiceFlow already did
Filler removal, spoken-correction handling, per-app tone (Wispr: app name sent with each dictation; ours:
the Android package or Windows program picks the style), formatting lists and punctuation, a personal
dictionary and packs, AI-prompt tightening, and (unlike the cloud tools) everything on the device by default.

## What we added (0.7.4): fit the text around the cursor
Wispr's documented idea of matching "casing, spacing and punctuation to surrounding text". Done on the device only:
the typing service reads at most 80 characters before and 24 after the cursor, the formatter uses them, and they are
never stored, logged or sent (the optional cloud polish only ever sees the dictated words).
* Inside a sentence the first word is not capitalised ("I think" + "We should go." -> "we should go."), except
  I, names and acronyms; a new sentence, a new line or an empty box keeps the capital.
* No full stop is added when the sentence carries on after the cursor.
* Skipped for passwords, for email/URL/number fields and for structured AI prompts.

## Ideas seen but not taken (and why)
* **Cloud-only processing**: contradicts the privacy-first, $0 design. Our cloud polish stays optional and consented.
* **Command Mode (voice-edit selected text)**: needs the selected text sent to a language model; a possible later
  addition behind the same consent.
* **Lemon-style task agent** (replying to email, making documents): a different product, needs account access.
* **Meeting capture and summaries (Fireflies)**: a different product (recording other people's calls raises consent
  issues). Long dictations could get an optional summary/action-items step later.
* **Reading the whole screen for context**: Wispr says it reads text, not screenshots; we deliberately read only
  a few characters around the cursor.

## What this does not prove
Nothing here shows Wispr's or Lemon's output is better or worse than ours. Their engines are not inspectable.
The continuation fit is tested on typed text and on the emulator path, not with a real voice.
