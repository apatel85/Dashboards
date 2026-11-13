import 'dart:io';
import 'dart:isolate';
import 'package:crypto/crypto.dart';
import 'model_spec.dart';
import 'tar_extractor.dart';

typedef ModelProgress = void Function(ModelPhase phase, int done, int total);

/// Download (resumable) -> verify SHA-256 (refuse on mismatch) -> extract wanted
/// files -> remove the archive. One-time network use (spec §3).
class ModelManager {
  ModelManager(this.spec, this.root, {HttpClient? client})
      : _client = client ?? HttpClient();
  final ModelSpec spec;
  final Directory root;
  final HttpClient _client;

  Directory get dir => Directory('${root.path}/${spec.id}');
  File get _partial => File('${root.path}/${spec.id}.download');
  File get _marker => File('${dir.path}/.verified');

  String path(String file) => '${dir.path}/$file';

  /// True only if every file exists and the marker records this exact archive hash.
  bool get installed =>
      _marker.existsSync() &&
      _marker.readAsStringSync().trim() == spec.sha256 &&
      spec.files.every((f) => File(path(f)).existsSync());

  Future<void> ensureInstalled(
      {ModelProgress? onProgress, CancelToken? cancel}) async {
    if (installed) return;
    await root.create(recursive: true);
    await _download(onProgress, cancel);

    onProgress?.call(ModelPhase.verifying, 0, 1);
    final digest = (await sha256.bind(_partial.openRead()).first).toString();
    if (digest != spec.sha256) {
      await _partial
          .delete(); // corrupt or tampered: refuse, start clean next time
      throw ModelIntegrityException('SHA-256 mismatch for ${spec.id}');
    }

    onProgress?.call(ModelPhase.extracting, 0, 1);
    if (dir.existsSync()) await dir.delete(recursive: true);
    try {
      // bzip2 decoding is CPU-heavy (~50 s for the 160 MB Whisper archive): keep it
      // off the UI isolate. Only plain strings cross the isolate boundary.
      final archivePath = _partial.path,
          destPath = dir.path,
          wanted = spec.files.toSet();
      await Isolate.run(() => TarBz2Extractor.extract(
          File(archivePath), Directory(destPath), wanted));
    } catch (_) {
      if (dir.existsSync()) await dir.delete(recursive: true);
      rethrow;
    }
    await _marker.writeAsString(spec.sha256);
    await _partial.delete();
    onProgress?.call(ModelPhase.done, 1, 1);
  }

  Future<void> _download(ModelProgress? onProgress, CancelToken? cancel) async {
    var have = _partial.existsSync() ? _partial.lengthSync() : 0;
    final req = await _client.getUrl(Uri.parse(spec.url));
    if (have > 0) req.headers.set(HttpHeaders.rangeHeader, 'bytes=$have-');
    final res = await req.close();

    if (res.statusCode == 416) {
      // Server says our partial is already the whole file; verification decides.
      await res.drain<void>();
      return;
    }
    if (res.statusCode != 200 && res.statusCode != 206) {
      await res.drain<void>();
      throw HttpException('download failed: HTTP ${res.statusCode}');
    }
    final resumed = res.statusCode == 206;
    if (!resumed) have = 0; // server ignored Range: start over
    final total = have + (res.contentLength >= 0 ? res.contentLength : 0);
    final sink =
        _partial.openSync(mode: resumed ? FileMode.append : FileMode.write);
    var got = have;
    try {
      await for (final chunk in res) {
        if (cancel?.cancelled ?? false) throw const ModelCancelled();
        sink.writeFromSync(chunk);
        got += chunk.length;
        onProgress?.call(ModelPhase.downloading, got, total);
        // Honour a cancel requested from the progress callback immediately.
        if (cancel?.cancelled ?? false) throw const ModelCancelled();
      }
    } finally {
      sink.closeSync(); // partial stays on disk so a retry resumes
    }
  }
}
