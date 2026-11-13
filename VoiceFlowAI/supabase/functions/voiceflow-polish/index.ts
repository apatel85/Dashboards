// VoiceFlow AI — polish proxy (Supabase Edge Function, Deno).
//
// Why this exists: the Gemini key must never be entered in, shipped with, or
// stored by the app (public repo, extractable APK/installer). It lives ONLY as
// the function secret GEMINI_API_KEY. The app calls this function with
// Supabase's public anon key; the function adds the Gemini key server-side.
//
// Text only. Audio is never sent. Nothing is stored or logged here.

const MAX_TEXT = 8000;
const MAX_SYSTEM = 4000;
const PER_MIN = 30;
const PER_DAY = 400;

// Best-effort per-isolate limiter (cheap abuse guard for a personal app).
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 86_400_000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  const lastMin = arr.filter((t) => now - t < 60_000).length;
  return lastMin > PER_MIN || arr.length > PER_DAY;
}

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "not configured" }, 503);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "?";
  if (limited(ip)) return json({ error: "rate limited" }, 429);

  let body: { system?: string; text?: string; maxTokens?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const { system, text } = body;
  if (typeof system !== "string" || typeof text !== "string" || !text) {
    return json({ error: "bad request" }, 400);
  }
  if (text.length > MAX_TEXT || system.length > MAX_SYSTEM) {
    return json({ error: "too large" }, 413);
  }
  const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 512, 16), 1024);
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash-lite";

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0, maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(8000),
    },
  ).catch(() => null);

  if (!r) return json({ error: "upstream unreachable" }, 502);
  if (r.status === 429) return json({ error: "rate limited" }, 429);
  if (!r.ok) return json({ error: "upstream" }, 502);
  const j = await r.json();
  const out = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof out !== "string") return json({ error: "empty" }, 502);
  return json({ text: out.trim() });
});
