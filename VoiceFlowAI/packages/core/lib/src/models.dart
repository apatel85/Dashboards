import 'dart:typed_data';

/// 16-bit mono PCM source.
abstract class AudioSource {
  Stream<Uint8List> start({int sampleRate = 16000});
  Future<void> stop();
}

class SttModelConfig {
  final String id;
  final String path;
  const SttModelConfig(this.id, this.path);
}

class SttResult {
  final String text;
  final double? confidence;
  final Duration processingTime;
  final double speechSeconds;
  const SttResult(this.text,
      {this.confidence,
      this.processingTime = Duration.zero,
      this.speechSeconds = 0});
}

abstract class SttEngine {
  Future<void> load(SttModelConfig cfg);
  Future<SttResult> transcribe(Uint8List pcm16k,
      {List<String> vocabularyHints = const []});
}

/// Cloud or local-server text polisher. May be absent.
abstract class PolishEngine {
  String get name;
  bool get isAvailable;

  /// False for loopback endpoints.
  bool get leavesDevice;
  Future<String> complete(String systemPrompt, String userText,
      {int maxTokens = 1024, Duration timeout = const Duration(seconds: 3)});
}

class PolishException implements Exception {
  final String message;
  final bool rateLimited;
  const PolishException(this.message, {this.rateLimited = false});
  @override
  String toString() => 'PolishException: $message';
}

enum InsertResult { ok, failed, elevatedTarget, passwordField }

abstract class TextSink {
  Future<InsertResult> insert(String text);
  Future<void> undoLast();
}

class AppContext {
  final String? appId;
  final String? windowTitle;
  final String? fieldKind;
  const AppContext({this.appId, this.windowTitle, this.fieldKind});
}

abstract class ContextProbe {
  Future<AppContext> current();
}

enum DictationStatus {
  ok,
  noSpeech,
  insertFailed,
  commandUndo,
  discarded,
  passwordField,
  error
}

class DictationResult {
  final DictationStatus status;
  final String rawTranscript;
  final String? finalText;
  final bool polishUsed;
  final String? error;
  final String? hint;
  const DictationResult(this.status,
      {this.rawTranscript = '',
      this.finalText,
      this.polishUsed = false,
      this.error,
      this.hint});
}

/// Holds text that could not be inserted so the user can copy it.
class RecoverSlot {
  String? text;
  void save(String t) => text = t;
  String? take() {
    final t = text;
    text = null;
    return t;
  }
}
