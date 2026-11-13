import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:voiceflow_core/voiceflow_core.dart';

final assets = Directory('../../app/assets');
LangData loadLang() => LangData.fromJsonString(
    File('${assets.path}/lang/en.json').readAsStringSync());
Profile loadProfile(String id) => Profile.fromJsonString(
    File('${assets.path}/profiles/$id.json').readAsStringSync());
DomainPack loadPack(String id) => DomainPack.fromJsonString(
    File('${assets.path}/packs/$id/pack.json').readAsStringSync());

/// 1 s of a loud square-ish tone so the energy VAD sees speech.
Uint8List speechPcm({double seconds = 1.0}) {
  final n = (16000 * seconds).round();
  final b = ByteData(n * 2);
  for (var i = 0; i < n; i++) {
    b.setInt16(i * 2, (i ~/ 20) % 2 == 0 ? 8000 : -8000, Endian.little);
  }
  return b.buffer.asUint8List();
}

class FakeStt implements SttEngine {
  String text;
  double speechSeconds;
  Object? throwError;
  List<String> lastHints = [];
  FakeStt(this.text, {this.speechSeconds = 3, this.throwError});
  @override
  Future<void> load(SttModelConfig cfg) async {}
  @override
  Future<SttResult> transcribe(Uint8List pcm16k,
      {List<String> vocabularyHints = const []}) async {
    lastHints = vocabularyHints;
    if (throwError != null) throw throwError!;
    return SttResult(text, speechSeconds: speechSeconds);
  }
}

class FakeSink implements TextSink {
  final List<String> inserted = [];
  int undos = 0;
  InsertResult result = InsertResult.ok;
  @override
  Future<InsertResult> insert(String text) async {
    if (result == InsertResult.ok) inserted.add(text);
    return result;
  }

  @override
  Future<void> undoLast() async => undos++;
}

class FakePolish implements PolishEngine {
  String Function(String) fn;
  Object? error;
  int calls = 0;
  final bool cloud;
  @override
  final String name;
  FakePolish(this.fn, {this.error, this.cloud = true, this.name = 'fake'});
  @override
  bool get isAvailable => true;
  @override
  bool get leavesDevice => cloud;
  @override
  Future<String> complete(String s, String t,
      {int maxTokens = 1024,
      Duration timeout = const Duration(seconds: 3)}) async {
    calls++;
    if (error != null) throw error!;
    return fn(t);
  }
}

List<dynamic> goldens(String profile) => jsonDecode(
        File('test_fixtures/formatting/$profile/cases.json').readAsStringSync())
    as List;
