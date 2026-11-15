import 'dart:typed_data';
import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

/// speech/silence builder: [(seconds, loud)]
Uint8List audio(List<(double, bool)> parts) {
  final out = BytesBuilder();
  for (final (secs, loud) in parts) {
    final n = (16000 * secs).round();
    final b = ByteData(n * 2);
    if (loud) {
      for (var i = 0; i < n; i++) {
        b.setInt16(i * 2, (i ~/ 20) % 2 == 0 ? 8000 : -8000, Endian.little);
      }
    }
    out.add(b.buffer.asUint8List());
  }
  return out.toBytes();
}

class SeqStt implements SttEngine {
  final List<double> seconds = [];
  final List<String> texts;
  int i = 0;
  Object? failOn;
  SeqStt([this.texts = const []]);
  @override
  Future<void> load(SttModelConfig cfg) async {}
  @override
  Future<SttResult> transcribe(Uint8List pcm16k,
      {List<String> vocabularyHints = const []}) async {
    if (failOn != null) throw failOn!;
    seconds.add(pcm16k.length / 32000);
    final t = i < texts.length ? texts[i] : 'part ${i + 1}.';
    i++;
    return SttResult(t, speechSeconds: pcm16k.length / 32000);
  }
}

LongDictationSession session(SttEngine s,
        {Set<String> common = const {'the', 'quarter', 'and', 'we'}}) =>
    LongDictationSession(s, commonWords: common);

void main() {
  test('a short dictation is a single piece', () async {
    final s = SeqStt(['hello there']);
    final ses = session(s)..add(audio([(0.3, false), (3, true), (0.5, false)]));
    final r = await ses.finish();
    expect(s.seconds.length, 1);
    expect(r.text, 'hello there');
    expect(r.speechSeconds > 2.5 && r.speechSeconds < 4, isTrue);
  });

  test('silence yields nothing and never calls the engine', () async {
    final s = SeqStt();
    final r = await (session(s)..add(audio([(5, false)]))).finish();
    expect(s.seconds, isEmpty);
    expect(r.text, '');
    expect(r.speechSeconds, 0);
  });

  test('60 s with a pause every 15 s is cut at the pauses and nothing is lost',
      () async {
    final pcm = audio([
      for (var k = 0; k < 4; k++) ...[(14.2, true), (0.9, false)]
    ]);
    final s = SeqStt();
    final r = await (session(s)..add(pcm)).finish();
    expect(s.seconds.length >= 3 && s.seconds.length <= 5, isTrue,
        reason: '${s.seconds}');
    expect(s.seconds.every((x) => x <= 26), isTrue, reason: '${s.seconds}');
    final spoken = s.seconds.fold<double>(0, (a, b) => a + b);
    expect(spoken > 56 && spoken < 62, isTrue,
        reason: 'heard $spoken s of 56.8 s spoken');
    expect(r.text, startsWith('part 1.'));
    expect(r.text, contains('part ${s.seconds.length}'));
  });

  test(
      '70 s with no pause at all is cut by force: no piece is longer than the engine can read',
      () async {
    final s = SeqStt();
    await (session(s)..add(audio([(70, true)]))).finish();
    expect(s.seconds.length >= 3, isTrue);
    expect(s.seconds.every((x) => x <= 25), isTrue, reason: '${s.seconds}');
    expect(s.seconds.fold<double>(0, (a, b) => a + b) > 69, isTrue);
  });

  test('10 minutes of speech works (no length limit)', () async {
    final s = SeqStt();
    final sw = Stopwatch()..start();
    final r = await (session(s)
          ..add(audio([
            for (var k = 0; k < 40; k++) ...[(14, true), (1.0, false)]
          ])))
        .finish();
    expect(s.seconds.length >= 20, isTrue);
    expect(r.speechSeconds > 550, isTrue, reason: '${r.speechSeconds}');
    expect(sw.elapsedMilliseconds < 8000, isTrue,
        reason: '${sw.elapsedMilliseconds} ms');
  });

  test(
      'streaming in small chunks transcribes finished pieces BEFORE the person stops',
      () async {
    final s = SeqStt();
    final ses = session(s);
    final pcm = audio([
      for (var k = 0; k < 4; k++) ...[(14.2, true), (0.9, false)]
    ]);
    const chunk = 3200; // 100 ms
    for (var o = 0; o < pcm.length; o += chunk) {
      ses.add(Uint8List.sublistView(
          pcm, o, o + chunk > pcm.length ? pcm.length : o + chunk));
    }
    await Future<void>.delayed(Duration.zero);
    expect(ses.segmentsStarted >= 2, isTrue,
        reason: 'work started during recording');
    final before = s.seconds.length;
    final r = await ses.finish();
    expect(s.seconds.length >= before, isTrue);
    // same words as one-shot
    final one = SeqStt();
    await (session(one)..add(pcm)).finish();
    expect(s.seconds.length, one.seconds.length);
    expect(r.text.split(' ').length > 6, isTrue);
  });

  test('a forced mid-sentence cut loses the false full stop and capital',
      () async {
    final s = SeqStt(
        ['we need the report from the', 'The quarter ends friday.', 'tail']);
    final r = await (session(s)..add(audio([(30, true)]))).finish();
    expect(r.text, startsWith('we need the report from the the quarter'));
  });

  test('a cut at a real pause keeps the sentence end', () async {
    final s = SeqStt(['First sentence here.', 'Second one.']);
    final r = await (session(s)
          ..add(audio([(10, true), (1.0, false), (6, true)])))
        .finish();
    expect(r.text, 'First sentence here. Second one.');
  });

  test('proper nouns keep their capital at a forced cut', () async {
    final s = SeqStt(['we flew to.', 'Mumbai on friday.', 'x']);
    final r = await (session(s)..add(audio([(30, true)]))).finish();
    expect(r.text, startsWith('we flew to Mumbai'));
  });

  test('cancel drops everything and skips pending pieces', () async {
    final s = SeqStt();
    final ses = session(s)..add(audio([(30, true)]));
    ses.cancel();
    final r = await ses.finish();
    expect(r.text, '');
  });

  test('an engine failure is reported, not swallowed', () async {
    final s = SeqStt()..failOn = StateError('model gone');
    final ses = session(s)..add(audio([(3, true)]));
    expect(ses.finish(), throwsA(isA<StateError>()));
  });

  group('through the pipeline', () {
    test('a 90 s dictation is inserted whole', () async {
      final texts = [
        'we start with the budget',
        'then we cover hiring',
        'then the roadmap',
        'and finally risks'
      ];
      final sink = FakeSink();
      final p = DictationPipeline(loadLang(), SeqStt(texts), sink);
      final pcm = audio([
        for (var k = 0; k < 6; k++) ...[(14.0, true), (1.0, false)]
      ]);
      final r = await p.run(pcm, DictationOptions(loadProfile('business')));
      expect(r.status, DictationStatus.ok);
      final out = sink.inserted.single.toLowerCase();
      for (final w in ['budget', 'hiring', 'roadmap', 'risks']) {
        expect(out, contains(w));
      }
    });

    test('startSession + runSession is the same as run', () async {
      final sink = FakeSink();
      final p = DictationPipeline(loadLang(), SeqStt(['hello world']), sink);
      final ses = p.startSession()..add(audio([(2, true)]));
      final r =
          await p.runSession(ses, DictationOptions(loadProfile('business')));
      expect(r.status, DictationStatus.ok);
      expect(sink.inserted.single, 'Hello world.');
    });

    test('a password field cancels the session and says so', () async {
      final p = DictationPipeline(loadLang(), SeqStt(), FakeSink());
      final ses = p.startSession()..add(audio([(2, true)]));
      final r = await p.runSession(
          ses,
          DictationOptions(loadProfile('business'),
              fieldKind: FieldKind.password));
      expect(r.status, DictationStatus.passwordField);
    });
  });
}
