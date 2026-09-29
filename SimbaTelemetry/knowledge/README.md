# knowledge/ — Clinical knowledge documents

This folder holds the two research documents that power the **Ask / Clinical audit**
feature. The audit prompt builder loads them in this order (specialized first):

1. `cavapoo-specialized.md` — breed-specific research (Cavapoo / Cavalier King Charles
   Spaniel × Poodle): growth curves, common health predispositions (mitral valve disease
   risk from the Cavalier side, patellar luxation, progressive retinal atrophy),
   coat/ear care, temperament and training traits, exercise limits for toy puppies.
2. `general-canine.md` — general pediatric canine research: AAFCO growth nutrient
   profiles, vaccination schedules, socialization windows, crate training, house
   training, teething timelines, Purina fecal scoring.

Both documents are maintained on a **monthly refresh cadence** — when new or updated
information is published, the documents are revised and the revision date noted at
the top of each file.

If either file is absent, the app shows a "pending" state and the audit builder
works without it (the event + live physiological state are always included).
