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
  note by one of 6 original royalty-free genre-styled voices (Pop Star,
  R&B Silk, Hip-Hop Flow, Rock Belt, Country Twang, Ethereal Choir) with
  pro-production touches: generated room reverb, harmony doubling,
  pitch scoops, R&B melisma runs, and grit. Control tempo (BPM),
  note length per syllable, melody shape, timbre mix, and vocal octave.
- **Extras** — metronome, performance recorder + replay, 5 scales
  (major / minor / pentatonic / dorian / blues), **MIDI export** (open the
  song in any DAW), and **share links** (song encoded in the URL hash —
  anyone opening the link replays your composition).
- **🎤 Karaoke mode** — tap Mic, open the Lyric Studio and hit Sing: the app
  plays the melody and shows each syllable big on stage while a real human
  (you or the kids!) sings along into the microphone.
- **⬇ Audio download** — tap Audio to capture everything (instruments +
  synth voice + mic) and download it as a `.webm` song file.
- **🎵 Song Builder** (Mureka-style, free) — pick a kid-friendly mood (Happy,
  Brave, Sleepy, Silly, Sad) and hit **Make My Song**: the app sets tempo,
  scale, chord progression, drum groove and voice, then plays your lyrics as
  a full song with an auto backing band (drums + bass + chord pads) and
  chord symbols on the staff. Write `[Verse]` / `[Chorus]` / `[Bridge]` on
  their own lines to structure it. **🎹 Instrumental** toggle = band only,
  no singing (with a sparkle arpeggio filling the vocal space).
- **✨ New lyrics** — one tap writes original kid-friendly verse + chorus
  lyrics for the selected mood (offline, instant). The textarea is always
  there for typing your own.
- **🗣️ Real Voice** — a real spoken voice via the device's built-in
  text-to-speech (free, no account): it speaks each line clearly while the
  piano carries the tune underneath. Three flavors: auto, **male**, and
  **kid** (pitched-up). Each mood also gives the voice its own character —
  Sleepy is low and slow, Silly is high and fast. Honest label: it talks,
  it doesn't sing — for true singing, the karaoke mic is still king.
- **Two tabs, no overlap** — **🎵 Note Music** (stage + orbs + sheet music)
  and **🎤 Lyrics → Song** (the full lyric studio). Switching tabs stops
  the other side cold: orbs freeze and the metronome dies going to Lyrics;
  the song, spoken voice and karaoke die going back to Notes.
- **Performance mode** — while a song or lyric performance plays, the
  stage/orbs bounce silently and the metronome pauses, so the band plays
  alone. Everything resumes when the song ends.
- **🧒 Kids mode** — bigger buttons, bigger note shapes, giant karaoke
  words, friendlier colors. Persists across visits.

## Tech

Single self-contained `index.html` — no build step, no dependencies.
Just open it or serve the folder.

## Test it

See `test-lyrics.md` for three original test songs with suggested
tempo/voice/scale combos.
