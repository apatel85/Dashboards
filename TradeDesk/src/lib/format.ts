/** Null-safe formatting helpers. Null/undefined/NaN always renders as "—". */

export const DASH = '—';

/** Parse a YYYY-MM-DD string without timezone drift. */
function parseDay(s: string): Date {
  return new Date(s + 'T12:00:00Z');
}

export function fmtMoney(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return DASH;
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return DASH;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Percent: fmtPct(5.2) → "+5.2%". signed=false omits the leading +. */
export function fmtPct(
  n: number | null | undefined,
  digits = 1,
  signed = true,
): string {
  if (n == null || !isFinite(n)) return DASH;
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return DASH;
  return Math.round(n).toLocaleString('en-US');
}

/** Compact money: $8.0K, $1.2M, $3.4B — for dense aggregate views. */
export function fmtCompactMoney(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return DASH;
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return fmtMoney(n, 0);
}

/** "Oct 15" */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return DASH;
  try {
    return parseDay(s).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return DASH;
  }
}

/** "Thu, Oct 15" */
export function fmtDayLabel(s: string | null | undefined): string {
  if (!s) return DASH;
  try {
    return parseDay(s).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return DASH;
  }
}

/** "Thu, Oct 15, 2026" */
export function fmtFullDate(s: string | null | undefined): string {
  if (!s) return DASH;
  try {
    return parseDay(s).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return DASH;
  }
}

const etDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** "Oct 14, 9:30 AM ET" — ISO timestamp rendered in US Eastern. */
export function fmtTimeET(iso: string | null | undefined): string {
  if (!iso) return DASH;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return DASH;
    return `${etDate.format(d)} ET`;
  } catch {
    return DASH;
  }
}

/** "earnings_acceleration" → "earnings acceleration" */
export function prettify(s: string): string {
  return s.replace(/_/g, ' ');
}

/** Clamp a 0–100 score into range; null stays null. */
export function clampScore(n: number | null | undefined): number | null {
  if (n == null || !isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}
