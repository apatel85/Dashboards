import 'dart:async';
import 'dart:typed_data';

import 'package:record/record.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

class MicDevice {
  final String id, label;
  const MicDevice(this.id, this.label);
}

/// What onboarding needs from the microphone (faked in tests).
abstract class MicProbe {
  Future<bool> requestPermission();
  Future<List<MicDevice>> devices();

  /// Live level (0..1) from the chosen device; cancel the subscription to stop.
  Stream<double> levels(String? deviceId);
}

RecordConfig _cfg(InputDevice? device) => RecordConfig(
  encoder: AudioEncoder.pcm16bits,
  sampleRate: 16000,
  numChannels: 1,
  device: device,
);

/// 16-bit mono 16 kHz PCM straight from the OS (WASAPI on Windows, AudioRecord
/// on Android) via the `record` package.
class MicAudioSource implements AudioSource {
  MicAudioSource({this.deviceId});
  String? deviceId;
  final AudioRecorder _rec = AudioRecorder();
  StreamController<Uint8List>? _out;
  StreamSubscription<Uint8List>? _sub;

  @override
  Stream<Uint8List> start({int sampleRate = 16000}) {
    final out = _out = StreamController<Uint8List>();
    () async {
      try {
        if (!await _rec.hasPermission()) {
          throw StateError('microphone permission denied');
        }
        final dev = deviceId == null
            ? null
            : (await _rec.listInputDevices())
                  .where((d) => d.id == deviceId)
                  .firstOrNull;
        final s = await _rec.startStream(_cfg(dev));
        _sub = s.listen(out.add, onError: out.addError, onDone: out.close);
      } catch (e, st) {
        out.addError(e, st);
        await out.close();
      }
    }();
    return out.stream;
  }

  @override
  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
    if (await _rec.isRecording()) await _rec.stop();
    await _out?.close();
    _out = null;
  }

  Future<void> dispose() => _rec.dispose();
}

class RecordMicProbe implements MicProbe {
  @override
  Future<bool> requestPermission() => AudioRecorder().hasPermission();

  @override
  Future<List<MicDevice>> devices() async {
    final r = AudioRecorder();
    try {
      return [
        for (final d in await r.listInputDevices()) MicDevice(d.id, d.label),
      ];
    } finally {
      await r.dispose();
    }
  }

  @override
  Stream<double> levels(String? deviceId) {
    late StreamController<double> c;
    final src = MicAudioSource(deviceId: deviceId);
    StreamSubscription<Uint8List>? sub;
    c = StreamController<double>(
      onListen: () => sub = src.start().listen(
        (b) => c.add(pcmLevel(b)),
        onError: c.addError,
      ),
      onCancel: () async {
        await sub?.cancel();
        await src.stop();
        await src.dispose();
      },
    );
    return c.stream;
  }
}
