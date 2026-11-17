import { useEffect, useState } from 'react';

/**
 * Theme toggle (v2026-11-17a): Auto / Light / Dark, in the app header.
 * Auto (default) follows the device setting via prefers-color-scheme.
 * A manual choice persists in localStorage (`td-theme`) and is applied as
 * data-theme on <html>, which the token CSS reads (see mockb-tokens.css).
 * An inline script in index.dev.html applies the stored choice before
 * React mounts so the page never flashes the wrong theme.
 */
export type ThemeChoice = 'auto' | 'light' | 'dark';

const KEY = 'td-theme';

const CHOICES: { id: ThemeChoice; label: string; title: string }[] = [
  { id: 'auto', label: 'Auto', title: 'Follow your device setting' },
  { id: 'light', label: 'Light', title: 'Always light' },
  { id: 'dark', label: 'Dark', title: 'Always dark' },
];

function readStored(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(readStored);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', choice);
    try {
      window.localStorage.setItem(KEY, choice);
    } catch {
      /* private mode — the choice just doesn't persist */
    }
  }, [choice]);

  return (
    <div className="seg theme-seg" role="group" aria-label="Color theme">
      {CHOICES.map((c) => (
        <button
          key={c.id}
          type="button"
          className={choice === c.id ? 'active' : ''}
          aria-pressed={choice === c.id}
          title={c.title}
          onClick={() => setChoice(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
