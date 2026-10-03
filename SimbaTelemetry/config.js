/* =====================================================================
   Simba Telemetry — shared backend config (TEAM CONVENTION)
   ---------------------------------------------------------------------
   All apps share ONE Supabase project. The anon key below is baked in at
   build time so the app connects automatically — no key prompts.

   SECURITY: the anon ("publishable") key is PUBLIC BY DESIGN. It is safe
   to ship in client-side code. What protects the data is Row Level
   Security (RLS): every row is gated on auth.uid() = owner. The SECRET
   key (sb_secret_*) must NEVER appear in this file, in the repo, or in
   chat — it lives in the Secure Vault only.

   Project : iknfvddnevudpjtyxkbh
   --------------------------------------------------------------------- */
window.ST_CONFIG = {
  SUPABASE_URL: 'https://iknfvddnevudpjtyxkbh.supabase.co',
  // Filled at build time from the Supabase dashboard (Project Settings → API
  // → "anon public" key). Placeholder until then — the app falls back to a
  // one-time manual key entry in Setup.
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrbmZ2ZGRuZXZ1ZHBqdHl4a2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzMwNzQsImV4cCI6MjA5MjkwOTA3NH0.Ry5ggZ5kH9lfGFpv5zfkJoZeITvneukMRV7H0yUMtwE',
};
