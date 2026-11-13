import 'dart:typed_data';

/// 16-bit mono PCM at a known rate.
class Pcm16 {
  final Uint8List bytes;
  final int sampleRate;
  const Pcm16(this.bytes, this.sampleRate);
  double get seconds => bytes.length / 2 / sampleRate;
}

class WavFormatException implements Exception {
  final String message;
  const WavFormatException(this.message);
  @override
  String toString() => 'WavFormatException: $message';
}

/// Minimal RIFF/WAVE reader for 16-bit PCM (any channel count -> mono mix,
/// any rate -> resampled to [targetRate]). Used for fixtures and file input.
Pcm16 parseWav(Uint8List wav, {int targetRate = 16000}) {
  if (wav.length < 12 ||
      String.fromCharCodes(wav.sublist(0, 4)) != 'RIFF' ||
      String.fromCharCodes(wav.sublist(8, 12)) != 'WAVE') {
    throw const WavFormatException('not a RIFF/WAVE file');
  }
  final bd = ByteData.sublistView(wav);
  int? channels, rate, bits, format;
  int? dataOff, dataLen;
  var p = 12;
  while (p + 8 <= wav.length) {
    final id = String.fromCharCodes(wav.sublist(p, p + 4));
    var len = bd.getUint32(p + 4, Endian.little);
    final body = p + 8;
    if (id == 'fmt ') {
      format = bd.getUint16(body, Endian.little);
      channels = bd.getUint16(body + 2, Endian.little);
      rate = bd.getUint32(body + 4, Endian.little);
      bits = bd.getUint16(body + 14, Endian.little);
    } else if (id == 'data') {
      dataOff = body;
      if (body + len > wav.length) {
        len = wav.length - body; // tolerate truncated/streamed size
      }
      dataLen = len;
      break;
    }
    p = body + len + (len.isOdd ? 1 : 0);
  }
  if (format == null || dataOff == null || dataLen == null) {
    throw const WavFormatException('missing fmt or data chunk');
  }
  if (format != 1 || bits != 16) {
    throw WavFormatException(
        'only 16-bit PCM is supported (format=$format bits=$bits)');
  }
  final ch = channels!;
  final frames = dataLen ~/ (2 * ch);
  final mono = Int16List(frames);
  for (var i = 0; i < frames; i++) {
    var sum = 0;
    for (var c = 0; c < ch; c++) {
      sum += bd.getInt16(dataOff + (i * ch + c) * 2, Endian.little);
    }
    mono[i] = sum ~/ ch;
  }
  var out = mono;
  if (rate != targetRate && frames > 0) {
    final n = (frames * targetRate / rate!).round();
    out = Int16List(n);
    for (var i = 0; i < n; i++) {
      final src = i * rate / targetRate;
      final i0 = src.floor().clamp(0, frames - 1);
      final i1 = (i0 + 1).clamp(0, frames - 1);
      final f = src - i0;
      out[i] = (mono[i0] * (1 - f) + mono[i1] * f).round();
    }
  }
  final bytes = Uint8List(out.length * 2);
  final ob = ByteData.sublistView(bytes);
  for (var i = 0; i < out.length; i++) {
    ob.setInt16(i * 2, out[i], Endian.little);
  }
  return Pcm16(bytes, targetRate);
}
