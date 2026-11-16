import 'dart:io';

import 'package:voiceflow_core/voiceflow_core.dart';

/// History on disk: one JSON file in the app's private folder. A write goes to a temp file and is
/// renamed, so a crash cannot leave half a file. (Not encrypted yet: that is why the history can be
/// switched off and cleared, and why password fields are never saved.)
class FileHistoryStorage implements HistoryStorage {
  FileHistoryStorage(this.file);
  final File file;

  @override
  Future<String?> read() async {
    try {
      return file.existsSync() ? await file.readAsString() : null;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String data) async {
    await file.parent.create(recursive: true);
    final tmp = File('${file.path}.tmp');
    await tmp.writeAsString(data);
    await tmp.rename(file.path);
  }
}
