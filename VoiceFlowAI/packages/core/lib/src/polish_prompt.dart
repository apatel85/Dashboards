import 'app_defaults.dart';
import 'profile.dart';
import 'pack.dart';

/// The cloud polish instructions, one per mode (spec section 4A and section 13). Gemini guidance
/// from the spec: rules and output format in the system instruction, the material first and the
/// instruction last in the user content, direct wording, structured output only when JSON is wanted.
///
/// [mode] is `casual`, `professional` or `prompt`.
String polishMode(Profile profile) => switch (profile.id) {
      'casual' => 'casual',
      'ai_prompting' => 'prompt',
      _ => 'professional',
    };

/// The system instruction. [banned] is the professional "words the output must not contain" list.
String buildPolishPrompt(Profile profile,
    {List<DomainPack> packs = const [],
    List<String> glossary = const [],
    PromptStyle promptStyle = const PromptStyle(),
    List<String> banned = const []}) {
  final notes =
      packs.map((p) => p.promptFragment).where((s) => s.isNotEmpty).join(' ');
  final tail = '''

DOMAIN NOTES: ${notes.isEmpty ? 'none' : notes}
GLOSSARY (exact spellings): ${glossary.isEmpty ? 'none' : glossary.join(', ')}''';
  switch (polishMode(profile)) {
    case 'casual':
      return '''Correct this dictated message. Reply with the corrected text only.

Rules:
- Fix spelling, punctuation, capitals and clear grammar errors.
- Keep the speaker's words, word order, tone and slang.
- Do not make it more formal. Do not add or remove ideas.
- Keep numbers and names exactly.
- Keep placeholders such as [[N1]] exactly as written.
- If nothing needs fixing, return the text unchanged.$tail''';
    case 'prompt':
      return '''You improve a draft prompt that was built offline from a spoken request.

You receive the cleaned transcript, then the draft prompt. Return the improved prompt in the same format. Return only the prompt.

Rules:
- Every fact must come from the transcript. Add none. Drop none.
- Keep placeholders such as [[N1]] exactly as written.
- Move details into the correct part. Tighten the wording. Start the task with a verb.
- Keep [assumed], [default] and [unclear] tags. Remove an [assumed] tag only when the transcript states that detail.
- If a must-have detail cannot be filled from the transcript, return one question starting with "CLARIFY:".
- Plain wording. No capital-letter emphasis.
- If the speaker gave a length, keep it exactly as spoken.${_promptLayout(promptStyle)}
- If the draft is already good, return it unchanged.$tail''';
    default:
      return '''You polish a business message that was drafted offline from dictation.

You receive the cleaned transcript, then the draft. Return the improved message only.

Rules:
- Put the purpose and the ask first, then supporting facts, then the next step.
- One idea per sentence. Split run-on sentences. Use the active voice with a named actor, except where the passive avoids blame.
- Replace casual wording with plain professional wording.${banned.isEmpty ? '' : '\n  Do not use: ${banned.join(', ')}.'}
- Every fact must come from the transcript: numbers, names, dates and commitments. Add none. Drop none.
- Keep placeholders such as [[N1]] exactly as written.
- Keep how firm or how tentative the speaker was.
- Add no apology, promise, deadline, reason or compliment.
- Keep it the same length as the transcript or shorter.
- If the draft is already good, return it unchanged.$tail''';
  }
}

String _promptLayout(PromptStyle style) => switch (style.format) {
      'xml' =>
        '\n- Keep each part in its own lowercase tag (<role>, <task>, <goal>, <context>, <include>, <avoid>, <output>), one per line.',
      'markdown' =>
        '\n- Keep each part under its own "###" heading (Role, Task, Goal, Context, Include, Avoid, Output).',
      _ => '\n- Keep one "Label: text" line per part.',
    };

/// The user content: material first, instruction last. [transcript] is the cleaned transcript,
/// [draft] the offline result; both may be masked.
String buildPolishContent(Profile profile, String transcript, String draft,
    {String? route}) {
  final mode = polishMode(profile);
  final tone = switch (profile.id) {
    'professional' => 'formal',
    'business' => 'neutral',
    _ => 'as spoken',
  };
  final type = mode == 'prompt' ? (route ?? 'generic') : 'GENERAL';
  return '<transcript>$transcript</transcript>\n'
      '<draft>$draft</draft>\n'
      'Mode: $mode. Type: $type. Tone: $tone.\n'
      '${mode == 'casual' ? 'Correct the draft using the rules.' : 'Improve the draft using the rules.'}';
}
