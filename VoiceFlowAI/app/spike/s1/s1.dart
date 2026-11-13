// Spike S1: sherpa-onnx transcribes fixtures; records timing. Throwaway.
// usage: dart run s1.dart <model_dir> <encoder> <decoder> <tokens> <wav>...
import 'dart:io';
import 'package:sherpa_onnx/sherpa_onnx.dart' as so;

void main(List<String> a) {
  so.initBindings();
  final dir = a[0];
  final sw = Stopwatch()..start();
  final rec = so.OfflineRecognizer(so.OfflineRecognizerConfig(
    model: so.OfflineModelConfig(
      whisper: so.OfflineWhisperModelConfig(
          encoder: '$dir/${a[1]}', decoder: '$dir/${a[2]}', language: 'en', task: 'transcribe'),
      tokens: '$dir/${a[3]}',
      numThreads: 2,
      debug: false,
    ),
  ));
  print('load_ms=${sw.elapsedMilliseconds}');
  for (final f in a.skip(4)) {
    final w = so.readWave(f);
    final secs = w.samples.length / w.sampleRate;
    sw..reset()..start();
    final s = rec.createStream();
    s.acceptWaveform(samples: w.samples, sampleRate: w.sampleRate);
    rec.decode(s);
    final t = rec.getResult(s).text;
    s.free();
    print('$f audio_s=${secs.toStringAsFixed(1)} decode_ms=${sw.elapsedMilliseconds} text="$t"');
  }
  rec.free();
  print('rss_mb=${(ProcessInfo.currentRss / 1048576).round()}');
}
