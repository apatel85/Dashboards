# KINETIC // Studio

A minimal, shape-driven music instrument + lyric-to-song studio.
Live at **https://apatel85.github.io/Dashboards/KineticMusic/**

## What it is

- **Shape stage** — 8 draggable note-shapes (one per scale degree). Drag
  across them to strum like a harp, or add kinetic orbs that bounce around
  and pluck notes on contact.
- **6 instruments** — Guitar, Piano, Violin, Drums, Bass, Marimba. All sound
  is synthesized live with the Web Audio API: zero audio files, works offline.
- **Live sheet music** — every plucked or sung note is transcribed onto a
  real treble staff (ledger lines, stems, bar lines, sharps, lyric syllables)
  scrolling along the bottom dock.
- **Lyric-to-Song Studio** — paste lyrics; each syllable is sung as a pitched
  note by one of 4 original royalty-free formant-synth voices (Velvet Indie,
  Neon Vocoder, Acoustic Storyteller, Ethereal Choir). Control tempo (BPM),
  note length per syllable, melody shape, timbre mix, and vocal octave.
- **Extras** — metronome, performance recorder + replay, 5 scales
  (major / minor / pentatonic / dorian / blues), **MIDI export** (open the
  song in any DAW), and **share links** (song encoded in the URL hash —
  anyone opening the link replays your composition).

## Tech

Single self-contained `index.html` — no build step, no dependencies.
Just open it or serve the folder.

## Test it

See `test-lyrics.md` for three original test songs with suggested
tempo/voice/scale combos.
