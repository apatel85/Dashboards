import 'dart:math';
import 'dart:typed_data';

/// RMS level (0..1, roughly perceptual via a gentle curve) of 16-bit little-endian
/// PCM. Drives the live level bars / onboarding mic meter ("is the mic hearing me").
double pcmLevel(Uint8List pcm16) {
  final n = pcm16.length ~/ 2;
  if (n == 0) return 0;
  final bd = ByteData.sublistView(pcm16);
  var sum = 0.0;
  for (var i = 0; i < n; i++) {
    final v = bd.getInt16(i * 2, Endian.little) / 32768.0;
    sum += v * v;
  }
  final rms = sqrt(sum / n);
  return min(1.0, pow(rms * 4, 0.6).toDouble()); // boost quiet speech, clamp
}
