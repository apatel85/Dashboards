import { useEffect } from 'react';
import { DEFINITIONS } from '../lib/definitions';

/**
 * Global "Understanding Fundamentals" drawer — the ONLY place definitions
 * live in the app. Slide-over from the right, scrolls inside itself.
 * Opened from the side menu, the header shortcut, or the floating pill.
 */
export function DefinitionsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside className="defs-drawer" role="dialog" aria-label="Understanding Fundamentals">
        <div className="defs-head">
          <h2>Understanding Fundamentals</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close definitions">
            ✕
          </button>
        </div>
        <p className="muted small defs-intro">
          Every number the app shows, in plain English. Green = better than its
          sector peers, red = worse, plain = in line.
        </p>
        {DEFINITIONS.map((g) => (
          <section key={g.title}>
            <h3 className="defs-group">{g.title}</h3>
            <div className="defs-list">
              {g.items.map(([label, text]) => (
                <div className="defs-row" key={label}>
                  <b>{label}</b>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </aside>
    </>
  );
}

/**
 * Compact floating pill, pinned bottom-right, that stays fixed while the
 * page scrolls — the definitions are one tap away from anywhere.
 */
export function FundamentalsPill({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      className="fund-pill"
      onClick={onOpen}
      title="Understanding Fundamentals — every number in plain English"
      aria-label="Open Understanding Fundamentals"
    >
      <span aria-hidden="true">?</span> Fundamentals
    </button>
  );
}
