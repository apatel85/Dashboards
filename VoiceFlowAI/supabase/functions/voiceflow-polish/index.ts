// VoiceFlow AI — polish proxy (Supabase Edge Function, Deno).
//
// Keys live ONLY as function secrets, never in the app or repo:
//   GEMINI_API_KEY      primary (optional GEMINI_MODEL, default gemini-3.8-flash)
//   GROQ_API_KEY        backup 1 (optional GROQ_MODEL, default openai/gpt-oss-20b)
//   OPENROUTER_API_KEY  backup 2 (requires OPENROUTER_MODEL, e.g. a ":free" id)
// A provider with no secret is skipped. On 429 / error / timeout the next
// provider is tried; the whole chain has one latency budget (client waits ~3 s).
// Text only. Audio is never sent. Nothing is stored or logged here.

const MAX_TEXT = 8000;
const MAX_SYSTEM = 4000;
const PER_MIN = 30;
const PER_DAY = 400;
const BUDGET_MS = 2800;

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

type Call = (system: string, text: string, maxTokens: number, ms: number) => Promise<string | null>;

const gemini = (key: string): Call => async (system, text, maxTokens, ms) => {
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";
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
      signal: AbortSignal.timeout(ms),
    },
  );
  if (!r.ok) return null;
  const j = await r.json();
  const out = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof out === "string" ? out : null;
};

const openaiCompat =
  (base: string, key: string, model: string): Call => async (system, text, maxTokens, ms) => {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, { role: "user", content: text }],
      }),
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) return null;
    const out = (await r.json())?.choices?.[0]?.message?.content;
    return typeof out === "string" ? out : null;
  };

function providers(): [string, Call][] {
  const p: [string, Call][] = [];
  const g = Deno.env.get("GEMINI_API_KEY");
  if (g) p.push(["gemini", gemini(g)]);
  const q = Deno.env.get("GROQ_API_KEY");
  if (q) {
    p.push(["groq", openaiCompat("https://api.groq.com/openai/v1", q,
      Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-20b")]);
  }
  const o = Deno.env.get("OPENROUTER_API_KEY");
  const om = Deno.env.get("OPENROUTER_MODEL");
  if (o && om) p.push(["openrouter", openaiCompat("https://openrouter.ai/api/v1", o, om)]);
  return p;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const chain = providers();
  if (chain.length === 0) return json({ error: "not configured" }, 503);

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

  const start = Date.now();
  for (const [name, call] of chain) {
    const left = BUDGET_MS - (Date.now() - start);
    if (left < 300) break;
    try {
      const out = await call(system, text, maxTokens, left);
      if (out && out.trim()) return json({ text: out.trim(), provider: name });
    } catch {
      // timeout / network: fall through to the next provider
    }
  }
  return json({ error: "all providers failed" }, 502);
});
