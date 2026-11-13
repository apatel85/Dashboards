import 'dart:math';
import 'dart:typed_data';

/// Energy-based voice-activity trim (core fallback; Silero replaces it in app).
class EnergyVad {
  final int sampleRate;
  final double threshold; // RMS on 0..1 scale
  const EnergyVad({this.sampleRate = 16000, this.threshold = 0.012});

  /// Returns the PCM between first and last voiced 20 ms frames (+100 ms pad),
  /// or an empty list when no speech is present.
  Uint8List trim(Uint8List pcm) {
    final bd = ByteData.sublistView(pcm);
    final n = pcm.length ~/ 2;
    final frame = sampleRate ~/ 50;
    var first = -1, last = -1;
    for (var s = 0; s + frame <= n; s += frame) {
      var sum = 0.0;
      for (var i = 0; i < frame; i++) {
        final v = bd.getInt16((s + i) * 2, Endian.little) / 32768.0;
        sum += v * v;
      }
      if (sqrt(sum / frame) >= threshold) {
        first = first < 0 ? s : first;
        last = s + frame;
      }
    }
    if (first < 0) return Uint8List(0);
    final pad = sampleRate ~/ 10;
    final a = max(0, first - pad), b = min(n, last + pad);
    return Uint8List.fromList(pcm.sublist(a * 2, b * 2));
  }

  double seconds(Uint8List pcm) => pcm.length / 2 / sampleRate;
}
