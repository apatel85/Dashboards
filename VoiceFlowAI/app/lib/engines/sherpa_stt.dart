import 'dart:async';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:sherpa_onnx/sherpa_onnx.dart' as so;
import 'package:voiceflow_core/voiceflow_core.dart';

/// Whisper (via sherpa-onnx) running on its OWN isolate so decoding never blocks
/// the UI (spec §6.1). `unload()` kills the isolate, which frees the model's
/// memory (needed for the idle budget, spec §16).
///
/// Whisper has no hotword support: `vocabularyHints` are accepted and ignored;
/// the dictionary post-processor covers corrections instead.
class SherpaSttEngine implements SttEngine {
  Isolate? _isolate;
  SendPort? _send;
  bool get loaded => _send != null;

  @override
  Future<void> load(SttModelConfig cfg) async {
    if (loaded) await unload();
    final ready = ReceivePort();
    _isolate = await Isolate.spawn(
      _entry,
      _Init(ready.sendPort, cfg.path, cfg.files),
    );
    final first = await ready.first.timeout(const Duration(seconds: 90));
    ready.close();
    if (first is SendPort) {
      _send = first;
    } else {
      _isolate?.kill(priority: Isolate.immediate);
      _isolate = null;
      throw StateError('speech model failed to load: $first');
    }
  }

  @override
  Future<SttResult> transcribe(
    Uint8List pcm16k, {
    List<String> vocabularyHints = const [],
  }) async {
    final send = _send;
    if (send == null) throw StateError('speech model not loaded');
    final reply = ReceivePort();
    final sw = Stopwatch()..start();
    send.send([
      TransferableTypedData.fromList([pcm16k]),
      reply.sendPort,
    ]);
    final r = await reply.first;
    reply.close();
    if (r is! List || r[0] != 'ok') {
      throw StateError('transcription failed: $r');
    }
    return SttResult(
      r[1] as String,
      processingTime: sw.elapsed,
      speechSeconds: pcm16k.length / 2 / 16000,
    );
  }

  Future<void> unload() async {
    _send?.send('close');
    _send = null;
    _isolate?.kill(priority: Isolate.beforeNextEvent);
    _isolate = null;
  }
}

class _Init {
  final SendPort reply;
  final String dir;
  final Map<String, String> files;
  _Init(this.reply, this.dir, this.files);
}

void _entry(_Init init) {
  final port = ReceivePort();
  so.OfflineRecognizer recognizer;
  try {
    so.initBindings();
    recognizer = so.OfflineRecognizer(
      so.OfflineRecognizerConfig(
        model: so.OfflineModelConfig(
          whisper: so.OfflineWhisperModelConfig(
            encoder: '${init.dir}/${init.files['encoder']}',
            decoder: '${init.dir}/${init.files['decoder']}',
            language: 'en',
            task: 'transcribe',
          ),
          tokens: '${init.dir}/${init.files['tokens']}',
          numThreads: 2,
        ),
      ),
    );
  } catch (e) {
    init.reply.send('$e');
    return;
  }
  init.reply.send(port.sendPort);
  port.listen((m) {
    if (m == 'close') {
      recognizer.free();
      port.close();
      return;
    }
    final msg = m as List;
    final reply = msg[1] as SendPort;
    try {
      final pcm = (msg[0] as TransferableTypedData).materialize().asUint8List();
      final bd = ByteData.sublistView(pcm);
      final samples = Float32List(pcm.length ~/ 2);
      for (var i = 0; i < samples.length; i++) {
        samples[i] = bd.getInt16(i * 2, Endian.little) / 32768.0;
      }
      final stream = recognizer.createStream();
      stream.acceptWaveform(samples: samples, sampleRate: 16000);
      recognizer.decode(stream);
      final text = recognizer.getResult(stream).text;
      stream.free();
      reply.send(['ok', text]);
    } catch (e) {
      reply.send(['error', '$e']);
    }
  });
}
