// Real end-to-end check (Windows CI): download the pinned model from GitHub, verify
// SHA-256, extract, load Whisper on an isolate, run the full pipeline on fixture
// audio, measure speed and memory. Nothing here is faked except the text sink.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:voiceflow_app/engines/sherpa_stt.dart';
import 'package:voiceflow_app/state/assets_loader.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

Directory? findUp(String rel) {
  var d = Directory.current;
  for (var i = 0; i < 6; i++) {
    final c = Directory('${d.path}/$rel');
    if (c.existsSync()) return c;
    d = d.parent;
  }
  return null;
}

class CaptureSink implements TextSink {
  final inserted = <String>[];
  @override
  Future<InsertResult> insert(String text) async {
    inserted.add(text);
    return InsertResult.ok;
  }

  @override
  Future<void> undoLast() async {}
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('download -> verify -> extract -> transcribe -> pipeline', (
    tester,
  ) async {
    final results = <String, Object>{};
    final spec = ModelSpec.fromJson(
      (jsonDecode(
        await rootBundle.loadString('assets/models.json'),
      ) as List).first,
    );
    final tmp = Directory.systemTemp.createTempSync('vf_e2e_');
    addTearDown(() => tmp.deleteSync(recursive: true));
    final mgr = ModelManager(spec, tmp);
    expect(mgr.installed, isFalse);

    final sw = Stopwatch()..start();
    final phaseStart = <String, int>{};
    await mgr.ensureInstalled(
      onProgress: (p, d, t) =>
          phaseStart.putIfAbsent(p.name, () => sw.elapsedMilliseconds),
    );
    results['total_install_ms'] = sw.elapsedMilliseconds;
    results['phase_start_ms'] = phaseStart;
    expect(mgr.installed, isTrue);
    for (final f in spec.files) {
      expect(File(mgr.path(f)).lengthSync(), greaterThan(0), reason: f);
    }

    final engine = SherpaSttEngine();
    final rssBefore = ProcessInfo.currentRss;
    sw
      ..reset()
      ..start();
    await engine.load(
      SttModelConfig(
        spec.id,
        mgr.dir.path,
        files: {
          'encoder': 'base.en-encoder.int8.onnx',
          'decoder': 'base.en-decoder.int8.onnx',
          'tokens': 'base.en-tokens.txt',
        },
      ),
    );
    results['load_ms'] = sw.elapsedMilliseconds;

    final fixtures = findUp('test_fixtures/audio')!;
    final assets = await AppAssets.load();
    final business = assets.profiles.firstWhere((p) => p.id == 'business');

    var worstWer = 0.0;
    for (final name in ['scarlet_0', 'scarlet_1']) {
      final wav = parseWav(
        File('${fixtures.path}/$name.wav').readAsBytesSync(),
      );
      final ref = File('${fixtures.path}/$name.txt').readAsStringSync();

      // raw engine timing
      sw
        ..reset()
        ..start();
      final raw = await engine.transcribe(wav.bytes);
      final decodeMs = sw.elapsedMilliseconds;

      // full pipeline (VAD -> STT -> commands -> formatter -> sink)
      final sink = CaptureSink();
      final pipeline = DictationPipeline(assets.lang, engine, sink);
      final r = await pipeline.run(wav.bytes, DictationOptions(business));

      final wer = wordErrorRate(ref, r.finalText ?? '');
      worstWer = wer > worstWer ? wer : worstWer;
      results[name] = {
        'audio_s': wav.seconds,
        'decode_ms': decodeMs,
        'rtf': decodeMs / 1000 / wav.seconds,
        'wer': wer,
        'raw': raw.text,
        'final': r.finalText ?? '',
      };
      expect(r.status, DictationStatus.ok, reason: name);
      expect(sink.inserted.single, r.finalText);
      expect(
        wer,
        lessThanOrEqualTo(0.10),
        reason: '$name WER budget (spec §16)',
      );
    }
    results['worst_wer'] = worstWer;
    results['rss_loaded_mb'] = (ProcessInfo.currentRss / 1048576).round();

    await engine.unload();
    await Future<void>.delayed(const Duration(seconds: 2));
    results['rss_after_unload_mb'] = (ProcessInfo.currentRss / 1048576).round();
    results['rss_before_load_mb'] = (rssBefore / 1048576).round();

    final out = const JsonEncoder.withIndent('  ').convert(results);
    // ignore: avoid_print
    print('E2E_RESULTS\n$out\nE2E_RESULTS_END');
    File('${Directory.current.path}/e2e-results.json').writeAsStringSync(out);

    // transcribing after unload must fail loudly, not hang
    await expectLater(
      engine.transcribe(Uint8List(3200)),
      throwsA(isA<StateError>()),
    );
  }, timeout: const Timeout(Duration(minutes: 20)));
}
