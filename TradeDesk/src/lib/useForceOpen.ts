import { useEffect, useState } from 'react';

/**
 * "Expand all / Collapse all" that still lets one card be opened on its
 * own afterwards.
 *
 * The old pattern was `const isOpen = forceOpen ?? open` with the card
 * head toggling only the local `open`. Once "Collapse all" set
 * `forceOpen = false`, `isOpen` was false forever — clicking a card
 * toggled invisible local state and nothing opened. The fix: the parent
 * passes a { open, epoch } object (epoch bumps on every Expand/Collapse
 * click) and each card keeps a per-card override that wins over the
 * all-state until the next Expand/Collapse click clears it.
 */
export interface ForceOpen {
  open: boolean;
  epoch: number;
}

export function useForceOpenState(): {
  force: ForceOpen | null;
  expandAll: () => void;
  collapseAll: () => void;
} {
  const [force, setForce] = useState<ForceOpen | null>(null);
  return {
    force,
    expandAll: () => setForce((f) => ({ open: true, epoch: (f?.epoch ?? 0) + 1 })),
    collapseAll: () => setForce((f) => ({ open: false, epoch: (f?.epoch ?? 0) + 1 })),
  };
}

export function useForceOpenCard(
  force: ForceOpen | null,
  defaultOpen: boolean,
): { isOpen: boolean; toggle: () => void } {
  const [open, setOpen] = useState(defaultOpen);
  const [override, setOverride] = useState<boolean | null>(null);
  // A fresh Expand all / Collapse all clears any per-card override, so
  // the all-state always wins the moment it is (re-)issued.
  const epoch = force?.epoch;
  useEffect(() => {
    setOverride(null);
  }, [epoch]);
  const isOpen = override ?? force?.open ?? open;
  return {
    isOpen,
    // Deliberately NOT setOpen: toggling local `open` is invisible while
    // force is set. The override is what an individual click must win with.
    toggle: () => setOverride(!isOpen),
  };
}
