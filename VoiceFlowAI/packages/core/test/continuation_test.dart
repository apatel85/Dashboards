import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

void main() {
  final common =
      loadLang().list('commonWords').map((e) => e.toLowerCase()).toSet();
  String adapt(String t, {String before = '', String after = ''}) =>
      ContinuationFlow.adapt(
          t, TextContext(before: before, after: after), common);

  group('fits the sentence it is going into', () {
    test('mid-sentence: no capital on a common first word', () {
      expect(
          adapt('We should go now.', before: 'I think '), 'we should go now.');
      expect(adapt('The budget is fine.', before: 'and then'),
          'the budget is fine.');
      expect(adapt('And then we left.', before: 'He opened the door, '),
          'and then we left.');
    });
    test('names, I and acronyms keep their capitals', () {
      expect(adapt('Priya will send it.', before: 'I think '),
          'Priya will send it.');
      expect(adapt('I will send it.', before: 'and '), 'I will send it.');
      expect(adapt("I'm on my way.", before: 'so '), "I'm on my way.");
      expect(adapt('API is down.', before: 'the '), 'API is down.');
    });
    test('a new sentence, a new line or an empty box keeps the capital', () {
      expect(adapt('We should go.', before: 'Hello there. '), 'We should go.');
      expect(adapt('We should go.', before: 'Dear John,\n'), 'We should go.');
      expect(adapt('We should go.', before: ''), 'We should go.');
      expect(adapt('We should go.', before: 'What time? '), 'We should go.');
    });
    test('no full stop when the sentence carries on after the cursor', () {
      expect(
          adapt('on Tuesday at 10 am.',
              before: 'We meet ', after: ' with the client.'),
          'on Tuesday at 10 am');
      expect(
          adapt('Tuesday.', before: 'See you ', after: ', then.'), 'Tuesday');
    });
    test('a following new sentence or line keeps the full stop', () {
      expect(adapt('We should go.', before: 'Hi. ', after: ' Then we eat.'),
          'We should go.');
      expect(adapt('We should go.', before: 'Hi. ', after: '\nNext line'),
          'We should go.');
      expect(
          adapt('Is it ready?', before: 'ok ', after: ' more'), 'is it ready?');
    });
    test('structured text and unknown context are untouched', () {
      expect(adapt('Task: do it.\nOutput: short.', before: 'x '),
          'Task: do it.\nOutput: short.');
      expect(adapt('We should go.'), 'We should go.');
    });
  });

  test('the pipeline applies it (and only for plain text fields)', () async {
    Future<String?> run(String said, TextContext c,
        {FieldKind kind = FieldKind.text}) async {
      final sink = FakeSink();
      final p = DictationPipeline(loadLang(), FakeStt(said), sink);
      final r = await p.run(
          speechPcm(),
          DictationOptions(loadProfile('business'),
              fieldKind: kind, surrounding: c));
      return r.finalText;
    }

    expect(await run('we should go now', const TextContext(before: 'I think ')),
        'we should go now.');
    expect(await run('we should go now', const TextContext(before: 'Hello. ')),
        'We should go now.');
    expect(
        await run('on tuesday at ten am',
            const TextContext(before: 'We meet ', after: ' with the client.')),
        'on Tuesday at 10 am');
    expect(
        await run('john at example dot com', const TextContext(before: 'to '),
            kind: FieldKind.email),
        'john@example.com');
  });
}
