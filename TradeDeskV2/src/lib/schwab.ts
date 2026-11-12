/**
 * Schwab proxy endpoints — one home for the URLs so the live poll, the
 * Deep Dive fetcher and the pre-market range store all use the same one.
 * useSchwabLive re-exports these, so existing imports keep working.
 *
 * Auth is the signed-in Supabase session JWT (Authorization: Bearer). The
 * Schwab proxy key is NEVER sent from the browser; it is only for the
 * pipeline / verify script.
 */

export const SCHWAB_PROXY_URL =
  'https://iknfvddnevudpjtyxkbh.supabase.co/functions/v1/schwab-market-data';
export const SCHWAB_AUTH_START_URL =
  'https://iknfvddnevudpjtyxkbh.supabase.co/functions/v1/schwab-auth-start';
