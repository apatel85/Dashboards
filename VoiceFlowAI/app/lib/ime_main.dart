// Dart entrypoint run by the Android keyboard's headless FlutterEngine (spike S3).
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:sherpa_onnx/sherpa_onnx.dart' as so;
import 'package:voiceflow_core/voiceflow_core.dart';

@pragma('vm:entry-point')
void imeMain() {
  WidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('voiceflow/ime');
  LangData? lang;
  channel.setMethodCallHandler((call) async {
    switch (call.method) {
      case 'ping':
        return 'pong';
      case 'format':
        final args = Map<String, dynamic>.from(call.arguments as Map);
        lang ??= LangData.fromJsonString(
            await rootBundle.loadString('assets/lang/en.json'));
        final profile = Profile.fromJsonString(await rootBundle
            .loadString('assets/profiles/${args['profile'] ?? 'business'}.json'));
        return RuleFormatter(lang!).format(args['text'] as String, profile);
      case 'transcribe':
        // Spike S1-Android: run Whisper via sherpa-onnx on a WAV file.
        final a = Map<String, dynamic>.from(call.arguments as Map);
        final dir = a['dir'] as String;
        so.initBindings();
        final sw = Stopwatch()..start();
        final rec = so.OfflineRecognizer(so.OfflineRecognizerConfig(
          model: so.OfflineModelConfig(
            whisper: so.OfflineWhisperModelConfig(
                encoder: '$dir/${a['encoder']}',
                decoder: '$dir/${a['decoder']}',
                language: 'en',
                task: 'transcribe'),
            tokens: '$dir/${a['tokens']}',
            numThreads: 2,
          ),
        ));
        final loadMs = sw.elapsedMilliseconds;
        final w = so.readWave(a['wav'] as String);
        sw
          ..reset()
          ..start();
        final stream = rec.createStream();
        stream.acceptWaveform(samples: w.samples, sampleRate: w.sampleRate);
        rec.decode(stream);
        final text = rec.getResult(stream).text;
        final decodeMs = sw.elapsedMilliseconds;
        stream.free();
        rec.free();
        return {
          'text': text,
          'loadMs': loadMs,
          'decodeMs': decodeMs,
          'audioS': w.samples.length / w.sampleRate,
        };
      default:
        throw MissingPluginException();
    }
  });
}
