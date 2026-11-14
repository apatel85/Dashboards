// VoiceFlow AI — polish proxy (Supabase Edge Function, Deno).
//
// Keys live ONLY as function secrets, never in the app or repo:
//   GEMINI_API_KEY      primary (optional GEMINI_MODEL; otherwise a default, and if Google says that
//                       model does not exist the function lists models and picks the newest flash-lite/flash)
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

type Result = { text: string | null; status?: number | "timeout" | "error" };
type Call = (system: string, text: string, maxTokens: number, ms: number) => Promise<Result>;

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI = "gemini-2.5-flash-lite";
let discovered: string | null = null; // kept while this instance stays warm

/** Newest text model that supports generateContent: flash-lite first, then flash; stable before preview. */
async function discoverGemini(key: string, ms: number): Promise<string | null> {
  const r = await fetch(`${GEMINI}/models?pageSize=200`, {
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) return null;
  const j = await r.json();
  // deno-lint-ignore no-explicit-any
  const all: string[] = (j?.models ?? []).filter((m: any) =>
    (m?.supportedGenerationMethods ?? []).includes("generateContent")
  // deno-lint-ignore no-explicit-any
  ).map((m: any) => String(m.name).replace(/^models\//, ""));
  const skip = /image|tts|audio|live|embed|vision|robotics|computer|thinking|exp/;
  const tier = (n: string) => n.includes("flash-lite") ? 2 : n.includes("flash") ? 1 : 0;
  const ver = (n: string) => parseFloat(n.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "0");
  const pool = all.filter((n) => tier(n) > 0 && !skip.test(n));
  pool.sort((a, b) =>
    tier(b) - tier(a) ||
    Number(/preview/.test(a)) - Number(/preview/.test(b)) ||
    ver(b) - ver(a)
  );
  return pool[0] ?? null;
}

const gemini = (key: string): Call => async (system, text, maxTokens, ms) => {
  const started = Date.now();
  const forced = Deno.env.get("GEMINI_MODEL");
  const once = async (model: string, left: number): Promise<Result> => {
    const r = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0, maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(left),
    });
    if (!r.ok) return { text: null, status: r.status };
    const j = await r.json();
    const out = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    return { text: typeof out === "string" ? out : null, status: r.status };
  };
  let res = await once(forced ?? discovered ?? DEFAULT_GEMINI, ms);
  // 404/400 from Google = that model id is not available: find one that is, once.
  if (!res.text && !forced && (res.status === 404 || res.status === 400)) {
    const left = ms - (Date.now() - started);
    if (left > 600) {
      const found = await discoverGemini(key, Math.min(left, 1500)).catch(() => null);
      if (found && found !== (discovered ?? DEFAULT_GEMINI)) {
        discovered = found;
        const left2 = ms - (Date.now() - started);
        if (left2 > 300) res = await once(found, left2);
      }
    }
  }
  return res;
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
    if (!r.ok) return { text: null, status: r.status };
    const out = (await r.json())?.choices?.[0]?.message?.content;
    return { text: typeof out === "string" ? out : null, status: r.status };
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
  const detail: { provider: string; status: number | string }[] = [];
  for (const [name, call] of chain) {
    const left = BUDGET_MS - (Date.now() - start);
    if (left < 300) break;
    try {
      const res = await call(system, text, maxTokens, left);
      if (res.text && res.text.trim()) return json({ text: res.text.trim(), provider: name });
      detail.push({ provider: name, status: res.status ?? "empty" });
    } catch (e) {
      // timeout / network: fall through to the next provider
      detail.push({ provider: name, status: (e as Error)?.name === "TimeoutError" ? "timeout" : "error" });
    }
  }
  // Status codes only: never a key, never the user's text.
  return json({ error: "all providers failed", detail }, 502);
});
