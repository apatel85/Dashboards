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
          'Task: Review my SQL for performance problems. I have a Postgres database with about 10,000,000 rows, and the main report takes 30 seconds.\n'
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
}
