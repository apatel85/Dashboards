import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

Uint8List noise(int n, int seed) {
  final r = Random(seed);
  return Uint8List.fromList(List.generate(n, (_) => r.nextInt(256)));
}

Uint8List buildArchive(Map<String, List<int>> entries) {
  final a = Archive();
  entries.forEach((name, data) => a.add(ArchiveFile.bytes(name, data)));
  return BZip2Encoder().encodeBytes(TarEncoder().encodeBytes(a));
}

class FakeServer {
  FakeServer(this.bytes,
      {this.honorRange = true, this.chunkDelay = Duration.zero});
  final Duration chunkDelay;
  final Uint8List bytes;
  bool honorRange;
  late HttpServer server;
  final ranges = <String?>[];
  int bytesServed = 0;
  int requests = 0;

  Future<void> start() async {
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((req) async {
      requests++;
      final range = req.headers.value('range');
      ranges.add(range);
      var start = 0;
      if (honorRange && range != null) {
        start = int.parse(RegExp(r'bytes=(\d+)-').firstMatch(range)!.group(1)!);
        req.response.statusCode = 206;
      }
      final body = bytes.sublist(start);
      req.response.contentLength = body.length;
      for (var i = 0; i < body.length; i += 4096) {
        final end = min(i + 4096, body.length);
        req.response.add(body.sublist(i, end));
        await req.response.flush();
        bytesServed += end - i;
        if (chunkDelay > Duration.zero) await Future<void>.delayed(chunkDelay);
      }
      await req.response.close();
    });
  }

  String get url => 'http://127.0.0.1:${server.port}/m.tar.bz2';
  Future<void> stop() => server.close(force: true);
}

ModelSpec specFor(Uint8List archive, String url,
        {String? sha, List<String>? files}) =>
    ModelSpec(
      id: 'test-model',
      lang: 'en',
      url: url,
      sha256: sha ?? sha256.convert(archive).toString(),
      sizeMb: 1,
      license: 'MIT',
      files: files ?? ['model.bin', 'tokens.txt'],
    );

void main() {
  late Directory tmp;
  setUp(() => tmp = Directory.systemTemp.createTempSync('vf_model_'));
  tearDown(() => tmp.deleteSync(recursive: true));

  final big = noise(200000, 1);
  final tokens = 'a 1\nb 2\n'.codeUnits;
  Uint8List archive() => buildArchive({
        'pkg/model.bin': big,
        'pkg/tokens.txt': tokens,
        'pkg/unwanted.onnx': noise(50000, 2),
      });

  test(
      'download, verify, extract only wanted files, delete archive, then no re-download',
      () async {
    final a = archive();
    final s = FakeServer(a);
    await s.start();
    addTearDown(s.stop);
    final root = Directory('${tmp.path}/models');
    final m = ModelManager(specFor(a, s.url), root);
    final phases = <ModelPhase>{};
    expect(m.installed, isFalse);
    await m.ensureInstalled(onProgress: (p, d, t) => phases.add(p));
    expect(m.installed, isTrue);
    expect(File(m.path('model.bin')).readAsBytesSync(), big);
    expect(File(m.path('tokens.txt')).readAsStringSync(), 'a 1\nb 2\n');
    expect(File(m.path('unwanted.onnx')).existsSync(), isFalse);
    expect(File('${root.path}/test-model.download').existsSync(), isFalse);
    expect(
        phases,
        containsAll([
          ModelPhase.downloading,
          ModelPhase.verifying,
          ModelPhase.extracting,
          ModelPhase.done
        ]));
    final before = s.requests;
    await m.ensureInstalled();
    expect(s.requests, before, reason: 'already installed: no network');
  });

  test(
      'resumes a partial download with a Range request and transfers only the rest',
      () async {
    final a = archive();
    final s = FakeServer(a);
    await s.start();
    addTearDown(s.stop);
    final root = Directory('${tmp.path}/models')..createSync(recursive: true);
    final cut = a.length ~/ 3;
    File('${root.path}/test-model.download')
        .writeAsBytesSync(a.sublist(0, cut));
    final m = ModelManager(specFor(a, s.url), root);
    await m.ensureInstalled();
    expect(s.ranges.single, 'bytes=$cut-');
    expect(s.bytesServed, a.length - cut);
    expect(m.installed, isTrue);
    expect(File(m.path('model.bin')).readAsBytesSync(), big);
  });

  test('server that ignores Range: restarts cleanly and still verifies',
      () async {
    final a = archive();
    final s = FakeServer(a, honorRange: false);
    await s.start();
    addTearDown(s.stop);
    final root = Directory('${tmp.path}/models')..createSync(recursive: true);
    File('${root.path}/test-model.download')
        .writeAsBytesSync(a.sublist(0, 1000));
    final m = ModelManager(specFor(a, s.url), root);
    await m.ensureInstalled();
    expect(s.bytesServed, a.length);
    expect(m.installed, isTrue);
  });

  test('SHA-256 mismatch is refused: nothing installed, bad partial removed',
      () async {
    final a = archive();
    final s = FakeServer(a);
    await s.start();
    addTearDown(s.stop);
    final root = Directory('${tmp.path}/models');
    final m = ModelManager(specFor(a, s.url, sha: 'a' * 64), root);
    await expectLater(
        m.ensureInstalled(), throwsA(isA<ModelIntegrityException>()));
    expect(m.installed, isFalse);
    expect(File('${root.path}/test-model.download').existsSync(), isFalse);
    expect(Directory('${root.path}/test-model').existsSync(), isFalse);
  });

  test('cancel keeps the partial file; the next attempt resumes and succeeds',
      () async {
    final a = archive();
    final s = FakeServer(a, chunkDelay: const Duration(milliseconds: 3));
    await s.start();
    addTearDown(s.stop);
    final root = Directory('${tmp.path}/models');
    final m = ModelManager(specFor(a, s.url), root);
    final cancel = CancelToken();
    await expectLater(
      m.ensureInstalled(
          cancel: cancel,
          onProgress: (p, d, t) {
            if (p == ModelPhase.downloading && d > 20000) {
              cancel.cancelled = true;
            }
          }),
      throwsA(isA<ModelCancelled>()),
    );
    final partial = File('${root.path}/test-model.download');
    expect(partial.existsSync(), isTrue);
    final have = partial.lengthSync();
    expect(have, greaterThan(0));
    expect(have, lessThan(a.length));
    await m.ensureInstalled();
    expect(s.ranges.last, 'bytes=$have-');
    expect(m.installed, isTrue);
  });

  test(
      'hostile archive: path traversal entries never write outside the model dir',
      () async {
    final a = buildArchive({
      '../../evil.txt': 'x'.codeUnits,
      'pkg/../../evil2.txt': 'y'.codeUnits,
      'pkg/model.bin': big,
      'pkg/tokens.txt': tokens,
    });
    final s = FakeServer(a);
    await s.start();
    addTearDown(s.stop);
    final root = Directory('${tmp.path}/models');
    final m = ModelManager(specFor(a, s.url), root);
    await m.ensureInstalled();
    expect(m.installed, isTrue);
    expect(File('${tmp.path}/evil.txt').existsSync(), isFalse);
    expect(File('${tmp.path}/evil2.txt').existsSync(), isFalse);
    expect(File('${root.path}/evil.txt').existsSync(), isFalse);
    expect(File(m.path('evil.txt')).existsSync(), isFalse);
  });

  test('archive missing a required file: refused and cleaned up', () async {
    final a = buildArchive({'pkg/model.bin': big});
    final s = FakeServer(a);
    await s.start();
    addTearDown(s.stop);
    final root = Directory('${tmp.path}/models');
    final m = ModelManager(specFor(a, s.url), root);
    await expectLater(
        m.ensureInstalled(), throwsA(isA<ModelIntegrityException>()));
    expect(m.installed, isFalse);
    expect(Directory('${root.path}/test-model').existsSync(), isFalse);
  });

  test('a changed pin (different hash) is not considered installed', () async {
    final a = archive();
    final s = FakeServer(a);
    await s.start();
    addTearDown(s.stop);
    final root = Directory('${tmp.path}/models');
    await ModelManager(specFor(a, s.url), root).ensureInstalled();
    final other = ModelManager(specFor(a, s.url, sha: 'b' * 64), root);
    expect(other.installed, isFalse);
  });

  test('HTTP error is reported, not swallowed', () async {
    final root = Directory('${tmp.path}/models');
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    server.listen((r) {
      r.response.statusCode = 404;
      r.response.close();
    });
    final spec = specFor(Uint8List(1), 'http://127.0.0.1:${server.port}/x');
    await expectLater(ModelManager(spec, root).ensureInstalled(),
        throwsA(isA<HttpException>()));
  });
}
