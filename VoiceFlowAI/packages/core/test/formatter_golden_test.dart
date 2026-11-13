import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

void main() {
  final fmt = RuleFormatter(loadLang());
  for (final id in ['casual', 'business', 'professional', 'ai_prompting']) {
    final p = loadProfile(id);
    final cases = goldens(id);
    test(
        '$id has >= 20 golden cases', () => expect(cases.length >= 20, isTrue));
    for (final c in cases) {
      test('$id: ${c['in']}', () => expect(fmt.format(c['in'], p), c['out']));
    }
  }

  test('fuzzed transcripts never throw', () {
    final p = loadProfile('business');
    final junk = [
      '',
      ' ',
      '.',
      ',,,',
      '???',
      'one',
      'one two three',
      'um',
      '\n\n',
      'comma comma period',
      'one two three four five six seven',
      'a' * 5000,
      '😀 emoji 🎉',
      'thousand thousand',
      'and and and',
      'hundred',
      'twenty twenty twenty',
      "'''",
      'x\u0000y',
    ];
    for (final j in junk) {
      expect(() => fmt.format(j, p), returnsNormally, reason: j);
    }
  });
}
