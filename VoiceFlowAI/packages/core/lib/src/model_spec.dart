/// One downloadable speech model (spec §6.4 `assets/models.json`).
class ModelSpec {
  final String id, lang, url, sha256, license;
  final int sizeMb;

  /// File names (basenames) to pull out of the archive.
  final List<String> files;
  const ModelSpec({
    required this.id,
    required this.lang,
    required this.url,
    required this.sha256,
    required this.sizeMb,
    required this.license,
    required this.files,
  });

  factory ModelSpec.fromJson(Map<String, dynamic> j) => ModelSpec(
        id: j['id'] as String,
        lang: j['lang'] as String,
        url: j['url'] as String,
        sha256: (j['sha256'] as String).toLowerCase(),
        sizeMb: j['sizeMb'] as int,
        license: j['license'] as String,
        files: List<String>.from(j['files'] as List),
      );
}

class ModelIntegrityException implements Exception {
  final String message;
  const ModelIntegrityException(this.message);
  @override
  String toString() => 'ModelIntegrityException: $message';
}

class ModelCancelled implements Exception {
  const ModelCancelled();
}

/// Set `cancelled` from the UI; the download keeps its partial file for resume.
class CancelToken {
  bool cancelled = false;
}

enum ModelPhase { downloading, verifying, extracting, done }
