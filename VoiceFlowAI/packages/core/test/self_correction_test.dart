import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

// Real dictation from the owner's phone (Whisper output, already punctuated).
const _shot =
    "Hello, let's try this again. We are going to create this app to have proper dictation going into text with the proper format of punctuation. It will be based on different tones: casual business, professional, and mainly AI prompting. What we want to achieve is to save the tokens. Whenever we are dictating something, we want to have that dictation ready for AI prompting. So let's test it. Create an app that will dictate the voice into proper structure, especially for AI models, and it will save the tokens for both input and output. I have a meeting at 9 AM on Monday. Actually, it is not on 9 AM on Monday, it is on Tuesday at 9 AM.";

void main() {
  final f = RuleFormatter(loadLang());
  String fmt(String s, [String p = 'business']) => f.format(s, loadProfile(p));

  group('self-corrections keep only the corrected version', () {
    const cases = {
      'I have a meeting at 9 AM on Monday. Actually, it is not on 9 AM on Monday, it is on Tuesday at 9 AM.':
          'I have a meeting on Tuesday at 9 AM.',
      'Meet at 3 PM. Actually, 4 PM.': 'Meet at 4 PM.',
      'Call me at 5 PM. Actually make it 6 PM.': 'Call me at 6 PM.',
      'Send it to John, I mean Mary.': 'Send it to Mary.',
      'We meet Monday, no wait, Tuesday.': 'We meet Tuesday.',
      'Send it to John. Actually, send it to Mary.': 'Send it to Mary.',
      'Let us meet at the cafe, I mean the library.':
          'Let us meet at the library.',
    };
    for (final e in cases.entries) {
      for (final p in ['casual', 'business', 'professional']) {
        test('$p: ${e.key}', () => expect(fmt(e.key, p), e.value));
      }
    }
  });

  group('a real "actually" is not a correction', () {
    test('new information is kept', () {
      expect(fmt('The report is ready. Actually, I recommend we wait.'),
          'The report is ready. Actually, I recommend we wait.');
    });
    test('no earlier sentence to correct', () {
      expect(fmt('Actually, I recommend we wait.'),
          'Actually, I recommend we wait.');
    });
    test('unrelated correction target leaves the text alone', () {
      expect(fmt('We ship on Friday. Actually, the logo needs work.'),
          'We ship on Friday. Actually, the logo needs work.');
    });
  });

  test('owner screenshot: the corrected meeting time wins in every tone', () {
    for (final p in ['casual', 'business', 'professional', 'ai_prompting']) {
      final o = fmt(_shot, p);
      expect(o, contains('I have a meeting on Tuesday at 9 AM.'), reason: p);
      expect(o, isNot(contains('Monday')), reason: p);
      expect(o, isNot(contains('Actually, it is not')), reason: p);
    }
  });

  test('owner screenshot: AI prompting is shorter, structured and goal-first',
      () {
    final o = fmt(_shot, 'ai_prompting');
    int words(String s) => s.split(RegExp(r'\s+')).length;
    expect(words(o), lessThan(words(_shot) * 0.8));
    expect(o, startsWith('Task: Create this app to have proper dictation'));
    expect(o, contains('\nGoal: save the tokens.\nContext: '));
    expect(o, contains('for input and output'));
    expect(o.toLowerCase(), isNot(contains("let's try this again")));
    expect(o.toLowerCase(), isNot(contains("let's test it")));
    // the other tones keep the conversational text
    expect(fmt(_shot, 'business'), contains('try this again'));
  });
}
