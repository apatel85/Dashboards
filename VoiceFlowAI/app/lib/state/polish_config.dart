/// Where optional cloud polish goes. Both values are PUBLIC by design: the function URL, and
/// Supabase's anon (publishable) key, which only lets a caller reach this one function. The AI
/// provider keys (Gemini, backups) live only as server-side secrets of that function. No secret
/// is, or ever should be, in this file or anywhere in the app.
const kPolishFunctionUrl =
    'https://iknfvddnevudpjtyxkbh.supabase.co/functions/v1/voiceflow-polish';
const kPolishAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrbmZ2ZGRuZXZ1ZHBqdHl4a2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMzMwNzQsImV4cCI6MjA5MjkwOTA3NH0.Ry5ggZ5kH9lfGFpv5zfkJoZeITvneukMRV7H0yUMtwE';

/// Set at build time (`--dart-define=APP_VERSION=1.2.3`); "dev" for local builds.
const kAppVersion = String.fromEnvironment('APP_VERSION', defaultValue: 'dev');
