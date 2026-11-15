import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

// Real dictation from the owner's phone, 0.7.0 (the speech model garbled "9 on Monday" and
// dropped the comma, and the box held an earlier paragraph break).
const _shot =
    "So this is what we are going to try to do. We are meeting on Monday. At 9 am with the client.\n\nActually, it's not at one Mondays on Tuesday at 10 am. So what we're going to discuss is the creation of the app so this is what we would like to do. Goal is to create an app that will use our voice to dictate and translate that into the text, into different tones, casual, business, professional. And one of the key element is the app should have AI prompting feature where it will translate the text into AI prompting to optimize so that way AI will know exactly what needs to be done also it will save the token for both input and output information.";

void main() {
  final f = RuleFormatter(loadLang());
  String fmt(String s, String p) => f.format(s, loadProfile(p));

  group('a correction that names the new day and time', () {
    test('reaches back across sentences and drops the correction', () {
      final o = SelfCorrection.apply(_shot);
      expect(
          o, contains('We are meeting on Tuesday. At 10 am with the client.'));
      expect(o, isNot(contains('Monday')));
      expect(o, isNot(contains('Actually')));
      // the speaker's own paragraph break is kept
      expect(o, contains('client.\n\nSo what we\'re going to discuss'));
    });
    test('works in every tone', () {
      for (final p in ['casual', 'business', 'professional', 'ai_prompting']) {
        final o = fmt(_shot, p);
        expect(o, contains('on Tuesday'), reason: p);
        expect(o, contains('At 10 am with the client'), reason: p);
        expect(o, isNot(contains('Mondays')), reason: p);
      }
    });
    test('a plain "actually" and unrelated day mentions are left alone', () {
      const t =
          'We met on Monday. Actually, the logo needs more work on Friday.';
      expect(SelfCorrection.apply(t), t);
    });
  });

  group('sentence-opening "So" is dropped in business and professional', () {
    test('screenshot', () {
      for (final p in ['business', 'professional']) {
        final o = fmt(_shot, p);
        expect(o, startsWith('This is what we are going to try to do.'),
            reason: p);
        expect(o, contains('\n\nWhat we'), reason: p);
        expect(RegExp(r'(^|[.?!]\s+|\n)So\s').hasMatch(o), isFalse, reason: p);
      }
    });
    test('mid-sentence "so", "so far" and "so that" stay; casual keeps it', () {
      expect(
          fmt('We are close so we can ship. So far it works. So that we can test it.',
              'business'),
          'We are close so we can ship. So far it works. So that we can test it.');
      expect(fmt('So this is what we do.', 'casual'), 'So this is what we do.');
    });
  });

  group('paragraphs follow the speaker and the topics', () {
    test('a paragraph break the speaker made is kept, each block is tidied',
        () {
      final o = fmt(_shot, 'professional');
      final paras = o.split('\n\n');
      expect(paras.length, 3);
      expect(paras[0],
          'This is what we are going to try to do. We are meeting on Tuesday. At 10 am with the client.');
      // "And one of the key element..." opens its own paragraph
      expect(paras[2], startsWith('And one of the key element'));
      expect(paras[1], contains('Goal is to create an app'));
    });
  });

  group('AI prompting from the same dictation', () {
    test('"Goal is to ..." becomes a Goal line, one flow of text, not shouting',
        () {
      final o = fmt(_shot, 'ai_prompting');
      expect(o, startsWith('Goal: create an app that will use our voice'));
      expect(o, contains('\nContext: This is what we are going to try to do.'));
      expect(
          o, contains('We are meeting on Tuesday. At 10 am with the client.'));
      expect(o, isNot(contains('Monday')));
      expect(o, contains('for input and output information'));
    });
  });
}
