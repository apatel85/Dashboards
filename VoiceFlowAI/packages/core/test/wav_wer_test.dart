import 'dart:typed_data';
import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

Uint8List wav(List<int> samples,
    {int rate = 16000, int ch = 1, bool extraChunk = false}) {
  final data = ByteData(samples.length * 2);
  for (var i = 0; i < samples.length; i++) {
    data.setInt16(i * 2, samples[i], Endian.little);
  }
  final b = BytesBuilder();
  void u32(int v) =>
      b.add((ByteData(4)..setUint32(0, v, Endian.little)).buffer.asUint8List());
  void u16(int v) =>
      b.add((ByteData(2)..setUint16(0, v, Endian.little)).buffer.asUint8List());
  b.add('RIFF'.codeUnits);
  u32(36 + samples.length * 2);
  b.add('WAVE'.codeUnits);
  if (extraChunk) {
    b.add('LIST'.codeUnits);
    u32(3);
    b.add([1, 2, 3, 0]); // odd length + pad byte
  }
  b.add('fmt '.codeUnits);
  u32(16);
  u16(1);
  u16(ch);
  u32(rate);
  u32(rate * ch * 2);
  u16(ch * 2);
  u16(16);
  b.add('data'.codeUnits);
  u32(samples.length * 2);
  b.add(data.buffer.asUint8List());
  return b.toBytes();
}

void main() {
  group('parseWav', () {
    test('mono 16 kHz passes through', () {
      final p = parseWav(wav([1, -2, 300]));
      expect(p.sampleRate, 16000);
      expect(ByteData.sublistView(p.bytes).getInt16(2, Endian.little), -2);
      expect(p.bytes.length, 6);
    });
    test('skips unknown chunks (with odd-length padding)', () {
      expect(parseWav(wav([5, 6], extraChunk: true)).bytes.length, 4);
    });
    test('stereo is mixed to mono', () {
      final p = parseWav(wav([100, 300, 10, 30], ch: 2));
      final b = ByteData.sublistView(p.bytes);
      expect(b.getInt16(0, Endian.little), 200);
      expect(b.getInt16(2, Endian.little), 20);
    });
    test('48 kHz is resampled to 16 kHz (length / 3)', () {
      final p = parseWav(wav(List.filled(4800, 1000), rate: 48000));
      expect(p.bytes.length ~/ 2, 1600);
      expect(p.seconds, closeTo(0.1, 0.001));
    });
    test('rejects non-WAV, 8-bit and truncated headers', () {
      expect(() => parseWav(Uint8List.fromList('hello world!!'.codeUnits)),
          throwsA(isA<WavFormatException>()));
      expect(() => parseWav(Uint8List(4)), throwsA(isA<WavFormatException>()));
      final eight = wav([1, 2])..[34] = 8;
      expect(() => parseWav(eight), throwsA(isA<WavFormatException>()));
    });
    test('tolerates a data length larger than the file (streamed WAVs)', () {
      final w = wav([1, 2, 3, 4]);
      ByteData.sublistView(w).setUint32(40, 0xFFFFFFF, Endian.little);
      expect(parseWav(w).bytes.length, 8);
    });
  });

  group('wordErrorRate', () {
    test('identical ignoring case and punctuation = 0', () {
      expect(wordErrorRate('Hello, World!', 'hello world'), 0);
    });
    test('one substitution in four words = 0.25', () {
      expect(wordErrorRate('a b c d', 'a b x d'), 0.25);
    });
    test('deletions and insertions count', () {
      expect(wordErrorRate('a b c d', 'a b'), 0.5);
      expect(wordErrorRate('a b', 'a b c d'), 1.0);
    });
    test('empty reference', () {
      expect(wordErrorRate('', ''), 0);
      expect(wordErrorRate('', 'x'), 1);
    });
  });
}
