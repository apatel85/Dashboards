# AI-prompting profile: what was researched and what was adopted

Goal: turn rambling dictation into a prompt that costs fewer **input** tokens and
asks the model for a compact **output**, without changing what was asked.

Evidence labels: **[SOURCE]** = stated by the cited page (read via web search
results, not independently re-measured here). **[DESIGN]** = our choice.
**[TESTED]** = covered by golden tests in `packages/core/test_fixtures/formatting/ai_prompting/`.
Nothing here has been measured against real model billing; token savings are
estimated from word counts only.

## Findings and decisions

| Finding | Source | Decision |
|---|---|---|
| Politeness/filler ("please", "could you", "thanks in advance") adds tokens and rarely changes output quality | decrypt.co/317176, prompthub.us/blog/how-polite-should-we-be-when-prompting-llms [SOURCE] | Strip request modals and pleasantries **[TESTED]** |
| Direct imperative phrasing beats conversational framing | OpenAI prompt engineering guide (help.openai.com/en/articles/6654000), Anthropic prompting best practices (platform.claude.com/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices) [SOURCE] | "can you review this" -> "Review this." **[TESTED]** |
| Specify the output format/length explicitly; say what to do rather than what not to do | Anthropic best practices [SOURCE] | Spoken constraints become compact specs: "Max 3 sentences.", "Under 200 words.", "Output JSON ...", "No explanation. Code only." **[TESTED]** |
| Token-efficiency posts: remove redundant context, use digits, avoid repeated instructions | yottalabs, simcentric, requesty, WellSky, Kasadara, inventivehq, costhawk posts [SOURCE] | Digits for counts ("five" -> 5 before counted nouns), phrase compressions ("in order to" -> "to") **[TESTED]** |
| Prompt compression research (LLMLingua) drops low-information tokens with little quality loss, but needs a model | microsoft.com/en-us/research/blog (LLMLingua), arxiv 2310.05736 [SOURCE] | Rule-based approximation only (no extra model, stays offline/$0) **[DESIGN]** |
| Chain of Draft (terse reasoning) cuts output tokens but loses accuracy on some tasks | arxiv 2502.18600 [SOURCE] | **Not** applied by default; we never inject reasoning instructions **[DESIGN]** |

## Guard rails
- The formatter never invents sections, roles or constraints. The only text it can
  add is a recognised spoken constraint rewritten shorter.
- A prompt-register result that is empty falls back to the business register.
- Technical terms are re-cased (json -> JSON, sql -> SQL, Kubernetes ...).
  This applies to every profile, not only AI prompting.
- Optional LLM polish keeps the same rule: shortest prompt, imperative, never longer
  than the input (profile `styleInstructions` + few-shot examples).

## Known limits
- Mid-sentence "can you" and hedges are only removed in the patterns listed in
  `app/assets/lang/en.json` (`promptPhrases`); unusual phrasing passes through.
- "please fix it" may leave "fix it" without a leading capital run-on ("... is broken fix it.");
  there is no clause splitter.
- Estimated savings are word-level only; real tokenizer counts were not measured.


---

# Part 2 (0.7.0): prompt structure, length, and per-target layout

Researched 2026-11-15 by web search. **Reliability labels:** PRIMARY = the model maker's own documentation page; SECONDARY = someone summarising it; the search returned mostly pointers and summaries, not full pages, so details below are what those results stated. Real-model quality of VoiceFlow's output has **not** been measured.

## What the sources say

| Topic | Finding | Source | Reliability |
|---|---|---|---|
| Claude: structure | XML tags keep instructions, context and examples from being mixed up; use consistent, descriptive tag names; there is no special "magic" tag set; wrap each kind of content in its own tag | [Anthropic: use XML tags](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags), [prompting best practices](https://platform.claude.com/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices) | PRIMARY (via search excerpts) |
| Claude: length | State an approximate number of words, paragraphs or items; asking for exact character counts is less effective | a third-party summary of Anthropic guidance | SECONDARY |
| OpenAI: structure | Put the instructions first; separate them from the context with delimiters such as `###` or triple quotes; be explicit about context, length, format and style; show the wanted output format | [OpenAI prompt engineering help article](https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api) | PRIMARY, older (GPT-4 era) |
| OpenAI: newer models | Prompts built around goal, context, output format and boundaries; none is required and a short prompt often works; set expectations for response length to avoid filler | press coverage of OpenAI's newer guides ([the-decoder](https://the-decoder.com/openais-new-prompting-guide-tells-users-to-stop-overthinking-and-start-with-the-result/)) | SECONDARY |
| Gemini | Persona/role, task, context, constraints and format; ordering, labels and delimiters affect results; a recap at the end that repeats the key constraints and response format; prompt design is iterative | [Gemini API: prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies), [Vertex AI prompt design](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/prompts/prompt-design-strategies) | PRIMARY (via search excerpts) |
| Length control | Models cannot reliably count words, so a word limit is a target, not a guarantee (one 2025 paper: strict compliance below 30% with naive prompts); brief-style instructions cut length a lot (reported 25-60%) with quality kept | [arXiv 2508.13805](https://arxiv.org/html/2508.13805v1), [arXiv 2506.08686](https://arxiv.org/abs/2506.08686v1) | research papers (abstract level) |
| "Concise first, then expand" | **No study found** that compares it with a single fixed limit. | - | open question |

## What was adopted

- **Task first, recap last** (OpenAI "instructions first", Gemini "recap constraints and format at the end"): layout order is Role, Task, Goal, Context, Include, Avoid, Output. [DESIGN, tested]
- **One layout per target AI** instead of one for all: Claude apps get `<role>/<task>/<context>/<include>/<avoid>/<output>` tags; ChatGPT gets `### Task` sections; Gemini and everything else get `Task: ...` lines. Chosen automatically from the app being typed into (Settings can force one layout). [DESIGN from the table, tested]
- **Length:** a number you speak is kept exactly as said. When you give none and the request is open-ended (explain, describe, compare, write, plan, a "what/why/how" question), the prompt ends with "Start concise (about 200 words); offer more detail if needed." Requests with a natural size (translate, summarize, fix, convert) get nothing added. Settings has "Exactly what I say" to turn it off. This is **our design choice, not an established best practice**; the 200-word figure is a starting point you asked for, and models treat it as approximate.
- **Not adopted:** adding few-shot examples or role text the speaker did not say (we never invent content); chain-of-thought instructions (accuracy and cost trade-offs are task-specific).

## Known limits
- Layout and length rules are pattern rules on punctuated text; they do not understand the request.
- A prompt with fewer than about 25 words and under 4 parts stays one plain line (labels cost tokens).
- Browser-based AI (claude.ai in Chrome) cannot be recognised on Android; set Chrome's style by hand in Style -> Apps, or use the AI app.
