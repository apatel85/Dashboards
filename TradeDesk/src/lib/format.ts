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

// ── OCC option symbols, e.g. NVDA261016C00217500 → root + YYMMDD + C/P + strike×1000 ──
const OCC_RE = /[A-Z]{1,6}\d{6}[CP]\d{8}/;
const OCC_RE_G = /[A-Z]{1,6}\d{6}[CP]\d{8}/g;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface OccParts {
  expiry: string;
  cp: 'call' | 'put';
  strike: number;
}

export function parseOcc(sym: string): OccParts | null {
  const m = OCC_RE.exec(sym);
  if (!m) return null;
  // root is 1-6 letters, so the date is the first 6-digit run
  const ds = m[0].search(/\d{6}/);
  if (ds < 0) return null;
  const date = m[0].slice(ds, ds + 6);
  const mo = +date.slice(2, 4), dd = +date.slice(4, 6);
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null;
  const cp = m[0].charAt(ds + 6);
  if (cp !== 'C' && cp !== 'P') return null;
  const strikeRaw = m[0].slice(ds + 7, ds + 15);
  if (!/^\d{8}$/.test(strikeRaw)) return null;
  return { expiry: `${MONTHS[mo - 1]} ${dd}`, cp: cp === 'C' ? 'call' : 'put', strike: +strikeRaw / 1000 };
}

/** "NVDA261016C00217500" → "Oct 16 $217.50 call" */
export function fmtOcc(sym: string): string {
  const p = parseOcc(sym);
  if (!p) return sym;
  const s = p.strike % 1 === 0 ? p.strike.toFixed(0) : p.strike.toFixed(2);
  return `${p.expiry} $${s} ${p.cp}`;
}

/** 84235 → "84.2k", 7844 → "7.8k" */
export function fmtK(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return DASH;
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

export interface UnusualItem {
  sym: string;
  vol: number | null;
  oi: number | null;
}

/** Split "… Unusual: SYM vol X vs OI Y; …" tail off a thesis string. */
export function splitThesis(thesis: string): { main: string; unusual: UnusualItem[] } {
  const m = thesis.match(/Unusual:\s*(.+)$/);
  if (!m || !m.index) return { main: thesis, unusual: [] };
  const unusual = m[1]
    .split(/\s*;\s*/)
    .map((part) => {
      const sym = (part.match(OCC_RE) || [])[0];
      if (!sym) return null;
      const vol = part.match(/vol\s+([\d,]+)/i);
      const oi = part.match(/\bOI\s+([\d,]+)/i);
      return {
        sym,
        vol: vol ? +vol[1].replace(/,/g, '') : null,
        oi: oi ? +oi[1].replace(/,/g, '') : null,
      } as UnusualItem;
    })
    .filter((x): x is UnusualItem => x !== null);
  return { main: thesis.slice(0, m.index).trim(), unusual };
}

/** Replace any OCC symbols in free text with the readable form. */
export function prettifyOptions(text: string): string {
  return text.replace(OCC_RE_G, (s) => fmtOcc(s));
}
