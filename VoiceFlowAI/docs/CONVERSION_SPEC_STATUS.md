# Conversion spec ("Dictation App Conversion Spec (Final)", 15 Nov 2026): status

Spec step 1 (inventory) and step 2 (baseline). Updated as each stage lands. **Evidence labels:**
AUTOMATED = covered by a test in this repo that passes locally; NOT DONE = not started;
NOT VERIFIED = written but only CI/emulator/phone can prove it.

## Baseline (spec step 2)
`packages/core/test_fixtures/spec/cases.json` holds 20 of the spec's own worked examples
(C1-C8, R1/R3/R7-R12, plus the two golden cases from section 1A) with the spec's expected text.
`test/spec_baseline_test.dart` runs them; `status.json` records which pass. A pending case that
starts passing fails the test until it is promoted, so the list only moves forward.

| | Before any change | Now |
|---|---|---|
| Spec examples passing exactly | 1 of 20 (C7) | 8 of 20 (C1, C3, C4, C6, C7, C8 casual, A1, A2) |

The baseline also exposed a **fact-changing bug**: "forty-two fifty not forty-five twenty" came out
as "92 not 65" (the number reader added the groups together). Fixed first.

## Stage map (spec section 3 to the code)
| Spec stage | Code today |
|---|---|
| 1 Clean | `ContextFixes`, `SelfCorrection`, `ClockTime`, `RuleFormatter._fillers/_repeats/_spokenPunct`, `NumberWords` |
| (new) Segmentation | `Segmenter` (new, `lib/src/segmenter.dart`, lists in `lang/en.json` `segmentation`) |
| 2 Select mode | the four profiles + per-app styles (`PerAppProfiles`, `AppDefaults`); now also the press-and-hold chooser on Android |
| 3 Route | prompt: static score in `_structurePrompt`; professional: none (spec section 10 router NOT DONE) |
| 4 Transform | `RuleFormatter._format0` (tone vocabulary in `lang/en.json` `register`) |
| 5 Render and check | `PolishValidator` for polish only; rule output has no validator (NOT DONE) |
| 6 Polish | `PolishChain` / Supabase function / Gemini |
| 7 Final check | `PolishValidator` (partly; spec section 14 checks NOT DONE) |

## Spec section 1A changes, in the spec's order
| # | Change | Status |
|---|---|---|
| 1 | Sentence breaks for unpunctuated speech (rule layer) | DONE, AUTOMATED (`spec_stages_test.dart`). Model layer (sherpa punctuation model) NOT DONE: needs a device to measure |
| 2 | Apostrophe repair | DONE, AUTOMATED (most were already in the contractions table; added "its" and "id" with guards) |
| 3 | User corrections and dictionary before formatting | DONE, AUTOMATED (`PostProcessor.fixHeard` runs before the formatter; abbreviations and pack rules stay at the end via `finish`) |
| 4 | Pack patterns before number formatting (cricket "4/22") | DONE, AUTOMATED: pack rules may set `"stage": "words"` and use `{num}`; the cricket pack uses it ("four for twenty two" -> 4/22, not with a unit or currency after) |
| 5 | Validator for rule output, fallback in the selected profile | DONE, AUTOMATED (`RuleValidator`: lost/invented numbers, negations, filler, shouting, tags; fallback is minimal formatting in the selected profile; the empty-result fallback now uses the selected profile, not business). Limit: a number read wrongly the same way on both sides is not caught |
| 6 | Extend `PolishValidator` | DONE, AUTOMATED (negations, invented numbers, apology/promise, banned words, placeholders; overlap floor 85% same-order for Casual, 40% Business/Professional, none for AI prompting) |
| 7 | Cloud polish | PARTLY DONE, AUTOMATED: cleaned transcript sent with the draft; mode-specific system instructions (sections 4A and 13); masking option with restore (Settings switch, off by default); free-tier privacy note next to the switch; Casual not polished by default. NOT DONE: the Edge Function's "newest flash model" fallback and model logging (needs a deploy of the live function, which I did not touch), the Polish button / auto-polish trigger rule |
| 8 | Move in-code lists to JSON | PARTLY: all new lists are JSON; the older lists in `self_correction.dart`, `context_fixes.dart`, `clock_time.dart`, `app_defaults.dart` are still in code |

## Other spec items touched
- Casual numbers are now digits ("seven" -> 7, "twenty bucks" -> $20), as in section 4A. This changed
  four casual/business goldens and one pack golden on purpose (diffs reviewed).
- Default mode for a new install is now Casual (existing installs keep what they saved).
- Casual spoken forms ("gonna" -> "going to") are on by default (a profile rule `spokenForms`; the
  Settings switch is NOT DONE).
- Restart self-correction ("at the, no wait, at the coffee place") added.
- Bare opening greeting ("hey ...") is dropped in Business, Professional and Prompt when nobody is
  named; a named greeting keeps the name and now gets its comma.

## Still failing from the baseline (12)
C2 (sound-alikes by context), C5 (grammar: "i seen", "didn't had"), C8 professional, R1, R3, R7,
R8, R9, R10 (both tones), R11 (sentence rewrite), R12. Most need the
Professional word map / emotion map / restructuring (spec sections 8-10) or the model layer.

## Decisions waiting for the owner
1. **Prompt-mode tags.** The spec renders prompts with route-specific XML tags for every target
   (`<goal>`, `<context>`, `<output>` ...). The app (0.7.0 research) chooses a layout per target AI
   (XML for Claude, `###` sections for ChatGPT, plain lines for Gemini) with a Role/Task/Goal/Context/
   Include/Avoid/Output vocabulary and a static plain-vs-structured score. Which should win?
2. **Cloud polish masking by default.** The spec recommends masking names and numbers before sending
   (and says either pay for the tier or mask by default before release beyond testing).
3. **Optional downloads** (Whisper small.en, punctuation model, Harper grammar checker via FFI) each
   need a measured gain on a real device before adoption; none is started.

## Update after the owner's 0.8.0 test
- **Business and Professional are now one choice.** The chip row shows Casual, Professional and AI prompting; a Neutral/Formal tone level (Style page) picks the wording. Under the hood the two profile files stay (spec section 1A: keep the profile files), "business" is the neutral level and "professional" the formal one, and built-in email apps use Professional. A per-app choice saved earlier as the formal profile stays formal.
- **Download size is unchanged (still the 160 MB speech model) because nothing new is downloadable yet.** The punctuation model, Whisper small.en and the grammar checker are NOT started: each needs a pinned download and a measured gain on a real phone.
- **Long run-on dictations** are now cut into sentences (a long clause breaks at "and/but/because" + a new subject), so Prompt mode has sentences to work with; "one sixty megabytes" now reads as 160. Prompt mode still keeps a general question as one plain line (owner decision in 0.7.2) and does not yet drop chatter from a rambling question.
