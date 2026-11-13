import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:voiceflow_app/state/app_controller.dart';
import 'package:voiceflow_app/state/assets_loader.dart';
import 'package:voiceflow_app/state/dictation_service.dart';
import 'package:voiceflow_app/state/dictation_state.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

Uint8List tone({double seconds = 1, int amp = 9000}) {
  final n = (16000 * seconds).round();
  final b = ByteData(n * 2);
  for (var i = 0; i < n; i++) {
    b.setInt16(i * 2, (i ~/ 20).isEven ? amp : -amp, Endian.little);
  }
  return b.buffer.asUint8List();
}

class FakeAudio implements AudioSource {
  int starts = 0, stops = 0;
  bool failOnStart = false;
  StreamController<Uint8List>? c;
  @override
  Stream<Uint8List> start({int sampleRate = 16000}) {
    starts++;
    c = StreamController<Uint8List>();
    if (failOnStart) {
      scheduleMicrotask(() => c!.addError(StateError('no mic')));
    }
    return c!.stream;
  }

  void emit(Uint8List b) => c!.add(b);
  @override
  Future<void> stop() async {
    stops++;
    await c?.close();
  }
}

class FakeStt implements SttEngine {
  FakeStt(this.text);
  String text;
  int calls = 0;
  @override
  Future<void> load(SttModelConfig cfg) async {}
  @override
  Future<SttResult> transcribe(
    Uint8List pcm16k, {
    List<String> vocabularyHints = const [],
  }) async {
    calls++;
    return SttResult(text, speechSeconds: 3);
  }
}

class CaptureSink implements TextSink {
  final inserted = <String>[];
  InsertResult result = InsertResult.ok;
  @override
  Future<InsertResult> insert(String text) async {
    if (result == InsertResult.ok) inserted.add(text);
    return result;
  }

  @override
  Future<void> undoLast() async {}
}

class Rig {
  late AppController c;
  final audio = FakeAudio();
  final stt = FakeStt('um we shipped twelve features');
  final sink = CaptureSink();
  int loads = 0, unloads = 0;
  bool ready = true;
  Object? loadError;
  late DictationService svc;

  static Future<Rig> make({
    Duration idle = const Duration(minutes: 5),
    Duration max = const Duration(minutes: 5),
  }) async {
    final r = Rig();
    final assets = await AppAssets.load(_Bundle());
    r.c = AppController(assets);
    r.svc = DictationService(
      controller: r.c,
      audio: r.audio,
      pipeline: DictationPipeline(assets.lang, r.stt, r.sink),
      options: () => DictationOptions(r.c.profile),
      modelReady: () => r.ready,
      loadEngine: () async {
        r.loads++;
        if (r.loadError != null) throw r.loadError!;
      },
      unloadEngine: () async => r.unloads++,
      idleUnload: idle,
      maxDuration: max,
    );
    return r;
  }

  void dispose() {
    svc.dispose();
    c.dispose();
  }
}

Future<void> settle([int ms = 30]) =>
    Future<void>.delayed(Duration(milliseconds: ms));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('happy path: listening is immediate, level updates, text lands and is recorded', () async {
    final r = await Rig.make();
    addTearDown(r.dispose);
    final f = r.svc.start();
    expect(
      r.c.state,
      DictationUiState.listening,
      reason: 'synchronous, before audio starts',
    );
    await f;
    r.audio.emit(tone());
    await settle();
    expect(r.c.level, greaterThan(0.3));
    await r.svc.stop();
    expect(r.c.state, DictationUiState.inserted);
    expect(r.sink.inserted.single, 'We shipped 12 features.');
    expect(r.c.recent.first.text, 'We shipped 12 features.');
    expect(r.loads, 1);
    expect(r.audio.starts, 1);
    expect(r.audio.stops, 1);
  });

  test('model not installed: notice, microphone never opened', () async {
    final r = await Rig.make();
    addTearDown(r.dispose);
    r.ready = false;
    await r.svc.start();
    expect(r.c.state, DictationUiState.notice);
    expect(r.c.notice, NoticeKind.modelMissing);
    expect(r.audio.starts, 0);
  });

  test('microphone failure becomes the "No microphone found" notice, not a stuck state', () async {
    final r = await Rig.make();
    addTearDown(r.dispose);
    r.audio.failOnStart = true;
    await r.svc.start();
    await settle();
    expect(r.c.notice, NoticeKind.noMicrophone);
    expect(r.c.state, DictationUiState.notice);
  });

  test(
    'silence -> "Didn\'t catch that", nothing inserted, STT never called',
    () async {
      final r = await Rig.make();
      addTearDown(r.dispose);
      await r.svc.start();
      r.audio.emit(Uint8List(32000));
      await r.svc.stop();
      expect(r.c.notice, NoticeKind.noSpeech);
      expect(r.sink.inserted, isEmpty);
      expect(r.stt.calls, 0);
    },
  );

  test('cancel returns to idle and never runs the pipeline', () async {
    final r = await Rig.make();
    addTearDown(r.dispose);
    await r.svc.start();
    r.audio.emit(tone());
    await r.svc.cancel();
    expect(r.c.state, DictationUiState.idle);
    expect(r.stt.calls, 0);
    expect(r.audio.stops, 1);
  });

  test(
    'hard cap: recording stops itself at maxDuration and still produces text',
    () async {
      final r = await Rig.make(max: const Duration(milliseconds: 80));
      addTearDown(r.dispose);
      await r.svc.start();
      r.audio.emit(tone());
      await settle(400);
      expect(r.c.state, DictationUiState.inserted);
      expect(r.sink.inserted.single, 'We shipped 12 features.');
    },
  );

  test(
    'idle unload frees the model, and the next dictation reloads it',
    () async {
      final r = await Rig.make(idle: const Duration(milliseconds: 60));
      addTearDown(r.dispose);
      Future<void> dictate() async {
        await r.svc.start();
        r.audio.emit(tone());
        await r.svc.stop();
      }

      await dictate();
      expect(r.loads, 1);
      await settle(250);
      expect(r.unloads, 1);
      await dictate();
      expect(r.loads, 2, reason: 'reloaded after idle unload');
    },
  );

  test('rapid re-trigger and start-while-processing are ignored', () async {
    final r = await Rig.make();
    addTearDown(r.dispose);
    final a = r.svc.start();
    final b = r.svc.start();
    await Future.wait([a, b]);
    expect(r.audio.starts, 1);
    r.audio.emit(tone());
    final stopping = r.svc.stop();
    await r.svc.start(); // processing: ignored
    await stopping;
    expect(r.audio.starts, 1);
  });

  test(
    'engine load failure surfaces as a notice (never throws to the UI)',
    () async {
      final r = await Rig.make();
      addTearDown(r.dispose);
      r.loadError = StateError('corrupt model');
      await r.svc.start();
      r.audio.emit(tone());
      await expectLater(r.svc.stop(), completes);
      expect(r.c.state, DictationUiState.notice);
      expect(r.c.notice, NoticeKind.modelMissing);
    },
  );

  test('a chunk emitted right before Stop is not lost', () async {
    final r = await Rig.make();
    addTearDown(r.dispose);
    await r.svc.start();
    r.audio.emit(tone());
    await r.svc.stop(); // no delay between emit and stop
    expect(r.sink.inserted.single, 'We shipped 12 features.');
  });

  test('insert failure -> "Couldn\'t type here. Text saved."', () async {
    final r = await Rig.make();
    addTearDown(r.dispose);
    r.sink.result = InsertResult.failed;
    await r.svc.start();
    r.audio.emit(tone());
    await r.svc.stop();
    expect(r.c.notice, NoticeKind.insertFailed);
  });
}

class _Bundle extends CachingAssetBundle {
  @override
  Future<ByteData> load(String key) async {
    final f = File(key);
    final b = f.readAsBytesSync();
    return ByteData.sublistView(Uint8List.fromList(b));
  }
}
