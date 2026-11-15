import 'dart:math';
import 'dart:typed_data';

import 'models.dart';
import 'vad.dart';

class LongResult {
  final String text;
  final double speechSeconds;
  const LongResult(this.text, this.speechSeconds);
}

class _Part {
  final String text;
  final bool atPause; // cut at a real pause (true) or forced mid-speech (false)
  final double seconds;
  const _Part(this.text, this.atPause, this.seconds);
}

/// Dictation of any length. The speech engine reads at most ~30 s per piece, so audio is cut at
/// natural pauses (or at the quietest moment before 24 s if the person never pauses) and each
/// finished piece is transcribed WHILE they keep talking. At the end only the last piece is left
/// to decode, so a ten-minute dictation does not mean a ten-minute wait. There is no length limit
/// besides memory (about 2 MB per minute of audio).
class LongDictationSession {
  LongDictationSession(
    this.stt, {
    EnergyVad? vad,
    this.hints = const [],
    this.commonWords = const {},
  }) : vad = vad ?? const EnergyVad();

  final SttEngine stt;
  final EnergyVad vad;
  List<String> hints;

  /// Lower-case words that may safely lose a capital letter at a forced mid-sentence cut.
  final Set<String> commonWords;

  static const _frameBytes = 640; // 20 ms of 16 kHz 16-bit mono
  static const _minSegment = 400; // frames: no pause cut before 8 s
  static const _maxSegment = 1200; // frames: forced cut by 24 s
  static const _pauseFrames = 30; // 0.6 s of quiet is a real pause
  static const _shortPause =
      15; // 0.3 s is an acceptable place to cut when we must

  Uint8List _data = Uint8List(0);
  final List<double> _e = [];
  final List<_Part> _parts = [];
  Future<void> _chain = Future.value();
  Object? _error;
  bool _done = false, _cancelled = false;
  int _segments = 0;

  /// Pieces handed to the engine so far (for tests and progress).
  int get segmentsStarted => _segments;

  void add(Uint8List chunk) {
    if (_done || _cancelled || chunk.isEmpty) return;
    if (_data.isEmpty) {
      _data = Uint8List.fromList(chunk);
    } else {
      final b = Uint8List(_data.length + chunk.length)
        ..setRange(0, _data.length, _data)
        ..setRange(_data.length, _data.length + chunk.length, chunk);
      _data = b;
    }
    final bd = ByteData.sublistView(_data);
    for (var f = _e.length; (f + 1) * _frameBytes <= _data.length; f++) {
      var sum = 0.0;
      for (var i = 0; i < _frameBytes ~/ 2; i++) {
        final v = bd.getInt16(f * _frameBytes + i * 2, Endian.little) / 32768.0;
        sum += v * v;
      }
      _e.add(sqrt(sum / (_frameBytes ~/ 2)));
    }
    while (true) {
      final cut = _cutPoint();
      if (cut == null) break;
      _emit(Uint8List.sublistView(_data, 0, cut.$1 * _frameBytes), cut.$2);
      _data = Uint8List.fromList(_data.sublist(cut.$1 * _frameBytes));
      _e.removeRange(0, cut.$1);
    }
  }

  /// (frame to cut at, whether it is a real pause), or null if nothing needs cutting yet.
  (int, bool)? _cutPoint() {
    final n = _e.length;
    if (n < _minSegment + _pauseFrames) return null;
    final quiet = vad.threshold;
    // 1) the first real pause after 8 s: cut a moment into it
    var run = 0;
    for (var i = _minSegment; i < n; i++) {
      if (_e[i] < quiet) {
        run++;
        if (run >= _pauseFrames) return (i - run + 1 + _shortPause, true);
      } else {
        run = 0;
      }
    }
    if (n < _maxSegment) return null;
    // 2) forced: the longest shorter pause between 12 s and 24 s
    var bestStart = -1, bestLen = 0;
    run = 0;
    for (var i = 600; i < _maxSegment; i++) {
      if (_e[i] < quiet) {
        run++;
        if (run >= _shortPause && run > bestLen) {
          bestLen = run;
          bestStart = i - run + 1;
        }
      } else {
        run = 0;
      }
    }
    if (bestStart >= 0) return (bestStart + bestLen ~/ 2, false);
    // 3) the quietest frame between 20 s and 24 s
    var q = 1000;
    for (var i = 1000; i < _maxSegment; i++) {
      if (_e[i] < _e[q]) q = i;
    }
    return (q, false);
  }

  void _emit(Uint8List seg, bool atPause) {
    final speech = vad.trim(seg);
    if (speech.isEmpty) return;
    _segments++;
    final fallback = speech.length / 2 / 16000;
    final hs = hints;
    _chain = _chain.then((_) async {
      if (_cancelled) return;
      try {
        final r = await stt.transcribe(speech, vocabularyHints: hs);
        _parts.add(_Part(r.text.trim(), atPause,
            r.speechSeconds > 0 ? r.speechSeconds : fallback));
      } catch (e) {
        _error ??= e;
      }
    });
  }

  /// Transcribes whatever is left and returns the whole text. Throws if the engine failed.
  Future<LongResult> finish() async {
    if (!_done) {
      _done = true;
      if (!_cancelled && _data.isNotEmpty) {
        _emit(Uint8List.sublistView(_data), true);
      }
    }
    await _chain;
    if (_error != null) throw _error!;
    return LongResult(_join(), _parts.fold<double>(0, (a, p) => a + p.seconds));
  }

  /// Drops everything (the person cancelled). Pending pieces are skipped.
  void cancel() {
    _cancelled = true;
    _done = true;
    _data = Uint8List(0);
    _e.clear();
  }

  String _join() {
    final sb = StringBuffer();
    var lastAtPause = true;
    for (final p in _parts) {
      var t = p.text;
      if (t.isEmpty) continue;
      if (sb.isNotEmpty) {
        if (!lastAtPause) {
          // Cut in the middle of speech: the engine closed the first piece with a full stop and
          // opened the next with a capital. Undo both for ordinary words.
          final s = sb.toString().replaceFirst(RegExp(r'[.,;:…]+\s*$'), '');
          sb
            ..clear()
            ..write(s);
          final w = RegExp(r"^[A-Za-z']+").firstMatch(t)?.group(0);
          if (w != null &&
              w.toLowerCase() != 'i' &&
              !w.toLowerCase().startsWith("i'") &&
              commonWords.contains(w.toLowerCase())) {
            t = t[0].toLowerCase() + t.substring(1);
          }
        }
        sb.write(' ');
      }
      sb.write(t);
      lastAtPause = p.atPause;
    }
    return sb.toString();
  }
}
