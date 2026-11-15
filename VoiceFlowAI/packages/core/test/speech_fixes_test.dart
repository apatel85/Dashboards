import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

void main() {
  final f = RuleFormatter(loadLang());
  String fmt(String s, String p) => f.format(s, loadProfile(p));

  group('retraction as its own sentence (owner phone test)', () {
    const t =
        "We have a meeting scheduled for Monday at 9 am. No, sorry. It's on Tuesday at 10 am. I need to talk to the client.";
    test('only the new day and time remain', () {
      for (final p in ['casual', 'business', 'professional', 'ai_prompting']) {
        final o = fmt(t, p);
        expect(o, contains('Tuesday at 10 am'), reason: p);
        expect(o, isNot(contains('Monday')), reason: p);
        expect(o.toLowerCase(), isNot(contains('sorry')), reason: p);
      }
    });
    test('a sentence in between does not hide what is corrected', () {
      expect(
          SelfCorrection.apply(
              'The call starts at 2 pm. I will also bring the printed copies. No, sorry. It starts at 4 pm.'),
          'The call starts at 4 pm. I will also bring the printed copies.');
    });
    test('names, places, amounts, percents and quantities', () {
      expect(
          SelfCorrection.apply('Send it to John by Friday, no sorry, Priya.'),
          'Send it to Priya by Friday.');
      expect(
          SelfCorrection.apply(
              'We will meet at the Boston office. Scratch that, we will meet at the Chicago office.'),
          'We will meet at the Chicago office.');
      expect(
          SelfCorrection.apply(
              'The budget is 500 dollars. Wait, that\'s wrong. The budget is 600 dollars.'),
          'The budget is 600 dollars.');
      expect(SelfCorrection.apply('We expect 20 people, I mean 30 people.'),
          'We expect 30 people.');
      expect(
          SelfCorrection.apply(
              'Revenue grew 15 percent. Negate that. It grew 18 percent.'),
          'Revenue grew 18 percent.');
    });
    test('an apology or "no problem" is not a retraction', () {
      const a = 'Sorry for the delay. The meeting is on Monday.';
      expect(SelfCorrection.apply(a), a);
      const b = 'No problem, we can do Monday at 9 am.';
      expect(SelfCorrection.apply(b), b);
      const c = 'Wait for the response before Monday.';
      expect(SelfCorrection.apply(c), c);
    });
  });

  group('no retraction words at all (the speech model dropped them)', () {
    test('a bare restatement of the same kind of fact replaces it', () {
      expect(
          SelfCorrection.apply(
              "We have a meeting scheduled for Monday at 9 am. It's on Tuesday at 10 am. I need to talk to the client."),
          'We have a meeting scheduled for Tuesday at 10 am. I need to talk to the client.');
      expect(
          SelfCorrection.apply('The budget is 500 dollars. It is 600 dollars.'),
          'The budget is 600 dollars.');
    });
    test('new information is never treated as a correction', () {
      const a = "The sale starts Monday. It's Tuesday for members only.";
      expect(SelfCorrection.apply(a), a);
      const b = "The kickoff is at 9 am. It's on Zoom.";
      expect(SelfCorrection.apply(b), b);
      const c =
          'The review is on Monday. It is on Tuesday at 10 am for the other team.';
      expect(SelfCorrection.apply(c), c);
    });
  });

  group('context picks the right look-alike word', () {
    test('text / tax', () {
      expect(
          ContextFixes.apply(
              'So tax messages like text that ranges from 50 words.'),
          'So text messages like text that ranges from 50 words.');
      expect(
          ContextFixes.apply(
              'Say I am taxing like 100 times a day with text messages.'),
          'Say I am texting like 100 times a day with text messages.');
      expect(
          ContextFixes.apply(
              'I owe tax on my income and will pay the tax this year.'),
          'I owe tax on my income and will pay the tax this year.');
    });
    test('bug / buck', () {
      expect(ContextFixes.apply('We need buck fixing before the release.'),
          'We need bug fixing before the release.');
      expect(
          ContextFixes.apply(
              'A lot of bang for the buck, and it cost 20 bucks.'),
          'A lot of bang for the buck, and it cost 20 bucks.');
    });
    test('cache / cash and SQL / sequel', () {
      expect(
          ContextFixes.apply('Clear the cash in the browser, the app is slow.'),
          'Clear the cache in the browser, the app is slow.');
      expect(ContextFixes.apply('The cash flow report shows revenue.'),
          'The cash flow report shows revenue.');
      expect(ContextFixes.apply('I wrote a sequel query against the database.'),
          'I wrote a SQL query against the database.');
      expect(ContextFixes.apply('The movie sequel comes out next year.'),
          'The movie sequel comes out next year.');
    });
    test('tech names the model splits', () {
      expect(ContextFixes.apply('We use get hub, java script and chat gpt.'),
          'We use GitHub, JavaScript and ChatGPT.');
    });
    test('it flows through every tone', () {
      for (final p in ['casual', 'business', 'professional', 'ai_prompting']) {
        expect(
            fmt('I want to test it with tax messages like text that ranges from a few words.',
                p),
            contains('text messages'),
            reason: p);
      }
    });
  });

  group('a / an, loose amounts, fixed phrases, filler openers', () {
    test('articles follow the sound', () {
      expect(
          fmt('this is an dictation app and a excellent idea for an user',
              'casual'),
          'This is a dictation app and an excellent idea for a user.');
      expect(
          fmt('i need an SQL query, a MBA plan and a API key in an hour',
              'casual'),
          'I need an SQL query, an MBA plan and an API key in an hour.');
    });
    test('"a few hundred" stays a loose amount', () {
      expect(fmt('we expect a few hundred people', 'business'),
          'We expect a few hundred people.');
      expect(fmt('we expect three hundred people', 'business'),
          'We expect 300 people.');
    });
    test(
        '"just so you know" is kept (business/professional) or dropped whole (AI)',
        () {
      const t =
          'Just so you know, the office will be noisy today. We should plan around it.';
      expect(fmt(t, 'business'), contains('Just so you know,'));
      expect(fmt(t, 'professional'), contains('Just so you know,'));
      expect(fmt(t, 'ai_prompting'), isNot(contains('Just so')));
    });
    test('"Alright, so let\'s try this again." opener is dropped in work tones',
        () {
      const t = "Alright, so let's try this again. We have a plan.";
      expect(fmt(t, 'business'), startsWith("Let's try this again."));
      expect(fmt(t, 'professional'), startsWith("Let's try this again."));
      expect(fmt(t, 'casual'), startsWith('Alright, so'));
      expect(fmt(t, 'ai_prompting'), 'We have a plan.');
    });
    test('"What we\'re trying to do is..." becomes a Goal in AI prompts', () {
      final o = fmt(
          "What we're trying to do is trying to create a dictation app that will translate speech into proper text. It should work offline and be fast on a phone.",
          'ai_prompting');
      expect(o, startsWith('Goal: create a dictation app'));
    });
    test('ordinals stay whole', () {
      expect(fmt('the deadline is March 5th and the 1st of April', 'business'),
          'The deadline is March 5th and the 1st of April.');
    });
  });
}
