import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

const _mail =
    "Hi John, I wanted to touch base about the project. We are kind of behind on a few things, and I think we need to figure out the budget. Also, the vendor is a big problem right now, but I can help out with the setup. Anyway, can you set up a call next week? Thanks a lot, talk soon.";
const _claude =
    "Hi Claude, I need you to act as a senior data engineer and review my SQL for performance problems. I have a Postgres database with about ten million rows, and the main report takes thirty seconds. You should include index suggestions, and do not use jargon. Keep it under two hundred words and give me the answer in a table.";

void main() {
  final f = RuleFormatter(loadLang());
  String fmt(String s, String p) => f.format(s, loadProfile(p));

  group('business and professional: better wording and paragraphs', () {
    test('business upgrades casual wording and breaks into sections', () {
      expect(
          fmt(_mail, 'business'),
          'Hi John,\n\n'
          'I wanted to touch base about the project. We are kind of behind on a few things, and I think we need to determine the budget.\n\n'
          'Also, the vendor is a significant problem right now, but I can assist with the setup. Anyway, can you schedule a call next week?\n\n'
          'Thanks a lot, talk soon.');
    });
    test('professional is more formal and uses formal connectors', () {
      expect(
          fmt(_mail, 'professional'),
          'Hello John,\n\n'
          'I wanted to touch base about the project. We are kind of behind on a few things, and I believe we need to determine the budget.\n\n'
          'Additionally, the vendor is a significant problem currently, but I can assist with the setup. In any case, could you schedule a call next week?\n\n'
          'Thank you very much, speak soon.');
    });
    test('casual keeps its own words and stays one block', () {
      final o = fmt(_mail, 'casual');
      expect(o, isNot(contains('\n')));
      expect(o, contains('help out'));
      expect(o, contains('Thanks a lot'));
    });
    test('short messages are not split into paragraphs', () {
      expect(fmt('hello team comma the launch is in two weeks', 'business'),
          'Hello team, the launch is in 2 weeks.');
    });
    test('a spoken new line is respected', () {
      expect(fmt('first point new line second point', 'business'),
          isNot(contains('\n\n')));
    });
  });

  group('greetings are not added or kept when they carry no meaning', () {
    const long =
        'Hello, we are going to review the quarterly numbers today. I want to make sure everyone has the latest figures.';
    test('a bare opening Hello is dropped in business/professional/prompt', () {
      for (final p in ['business', 'professional']) {
        expect(fmt(long, p), startsWith('We are going to review'), reason: p);
      }
      expect(fmt(long, 'ai_prompting'),
          'Review the quarterly numbers today. Make sure everyone has the latest figures.');
    });
    test('casual keeps what was said', () {
      expect(fmt(long, 'casual'), startsWith('Hello, we are going'));
    });
    test('a named greeting stays', () {
      expect(fmt(_mail, 'business'), startsWith('Hi John,'));
    });
    test('a short message keeps its greeting', () {
      expect(fmt('Hey, are you free tonight?', 'business'),
          'Hi, are you free tonight?');
    });
    test('addressing the AI by name is dropped', () {
      expect(fmt(_claude, 'ai_prompting'), isNot(contains('Claude')));
    });
  });

  group('AI prompting: structured, token-lean prompt', () {
    test('a multi-part dictation becomes labelled parts', () {
      expect(
          fmt(_claude, 'ai_prompting'),
          'Role: senior data engineer\n'
          'Task: Review my SQL for performance problems.\n'
          'Context: I have a Postgres database with about 10,000,000 rows, and the main report takes 30 seconds.\n'
          'Include: index suggestions\n'
          'Avoid: jargon\n'
          'Output: Under 200 words. Output table.');
    });
    test('short single-purpose prompts stay one plain line', () {
      expect(
          fmt('i want you to act like a senior python dev and review this function for bugs and keep it short',
              'ai_prompting'),
          'Act as a senior Python dev and review this function for bugs. Be concise.');
    });
    test('goal and context are separated from the task', () {
      const t =
          'We are building a dictation app. What we want to achieve is to save tokens. Create a landing page headline. Keep it under ten words.';
      final o = fmt(t, 'ai_prompting');
      expect(o, contains('Goal: save tokens.'));
      expect(o, contains('Context: We are building a dictation app.'));
      expect(o, contains('Task: Create a landing page headline.'));
      expect(o, contains('Output: Under 10 words.'));
    });
  });

  group('AI prompting: layout per target and length behaviour', () {
    final p = loadProfile('ai_prompting');
    String run(String t, {String format = 'labels', bool concise = false}) =>
        f.format(t, p,
            promptStyle: PromptStyle(format: format, conciseFirst: concise));

    test('XML tags for Claude', () {
      expect(
          run(_claude, format: 'xml'),
          '<role>senior data engineer</role>\n'
          '<task>Review my SQL for performance problems.</task>\n'
          '<context>I have a Postgres database with about 10,000,000 rows, and the main report takes 30 seconds.</context>\n'
          '<include>index suggestions</include>\n'
          '<avoid>jargon</avoid>\n'
          '<output>Under 200 words. Output table.</output>');
    });
    test('### sections for ChatGPT', () {
      final o = run(_claude, format: 'markdown');
      expect(o, startsWith('### Role\nsenior data engineer\n\n### Task\n'));
      expect(o, endsWith('### Output\nUnder 200 words. Output table.'));
    });
    test('task leads, output (format and limits) is the recap at the end', () {
      final o = run(_claude);
      expect(o.indexOf('Task:'), lessThan(o.indexOf('Include:')));
      expect(o.split('\n').last, startsWith('Output:'));
    });
    test('a spoken length is kept exactly and nothing is added', () {
      expect(run(_claude, concise: true), isNot(contains('Start concise')));
    });
    test('open-ended request with no length: start concise, offer more', () {
      const hint =
          'Start concise (about 200 words); offer more detail if needed.';
      expect(
          run('Explain how Kubernetes pods talk to each other.', concise: true),
          'Explain how Kubernetes pods talk to each other. $hint');
      expect(
          run('What is the difference between a process and a thread?',
              concise: true),
          endsWith(hint));
      // off by default and when the person chooses "exactly what I say"
      expect(run('Explain how Kubernetes pods talk to each other.'),
          'Explain how Kubernetes pods talk to each other.');
    });
    test('tasks with a natural size get no length hint', () {
      for (final t in [
        'Translate this paragraph into Spanish and keep the formatting.',
        'Summarize this article in 5 bullets.',
        'Fix the bug in this function.',
      ]) {
        expect(run(t, concise: true), isNot(contains('Start concise')),
            reason: t);
      }
    });
    test('the hint joins the Output part of a structured prompt', () {
      const t =
          'Act as a travel planner. I am visiting Lisbon for four days in March with two kids. Explain what to see and where to eat. Do not include museums. Include one rainy day option.';
      final o = run(t, concise: true);
      expect(o, contains('Role: travel planner'));
      expect(o, contains('Avoid: museums'));
      expect(
          o,
          contains(
              'Output: Start concise (about 200 words); offer more detail if needed.'));
    });
  });

  group('sentence splitting', () {
    test('words that merely end like an abbreviation still end the sentence',
        () {
      // "museums." / "systems." / "items." end in "ms."; "casino." ends in "no."
      final short = fmt(
          'Explain what to see. Do not include museums. Include one rainy day option. Keep it fun.',
          'ai_prompting');
      expect(short, contains('Avoid: museums'));
      expect(short, isNot(contains('museums.')));
      expect(short, contains('Include: one rainy day option'));
      final o = f.format(
          'Act as a travel planner. I am visiting Lisbon in March with two kids. Explain what to see and where to eat. Do not include museums. Include one rainy day option.',
          loadProfile('ai_prompting'));
      expect(o, contains('Avoid: museums'));
      expect(o, isNot(contains('museums.')));
      expect(o, contains('Include: one rainy day option'));
    });
    test('real abbreviations do not end a sentence', () {
      final o = fmt(
          'We reviewed the plan. Mr. Smith approved the budget, e.g. the new hires. The vendors were paid. Dr. Lee will join the call. Thanks for your time.',
          'business');
      expect(o, contains('Mr. Smith approved'));
      expect(o, contains('Dr. Lee will join'));
    });
  });
}
