import { createClient } from '@supabase/supabase-js';

/**
 * Shared Supabase project (team convention: ONE project for all apps).
 *
 * The anon ("publishable") key is PUBLIC BY DESIGN — it is safe to ship in
 * client-side code. Row Level Security is the security boundary, not the key.
 * The sb_secret_* key must NEVER appear in client code, the repo, or chat.
 */
const SUPABASE_URL = 'https://iknfvddnevudpjtyxkbh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrbmZ2ZGRuZXZ1ZHBqdHl4a2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzMwNzQsImV4cCI6MjA5MjkwOTA3NH0.Ry5ggZ5kH9lfGFpv5zfkJoZeITvneukMRV7H0yUMtwE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
