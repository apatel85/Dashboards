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
