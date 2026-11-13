import 'dart:convert';
import 'dart:io';

import 'package:voiceflow_core/voiceflow_core.dart';

/// Settings on disk (JSON, schema-versioned by core `Settings.migrate`). A corrupt
/// or missing file yields defaults; a write goes to a temp file then renames so a
/// crash cannot leave half a file.
class SettingsStore {
  SettingsStore(this.dir);
  final Directory dir;
  File get _file => File('${dir.path}/settings.json');

  Future<Settings> load() async {
    try {
      if (!_file.existsSync()) return Settings();
      return Settings.fromJson(
        jsonDecode(await _file.readAsString()) as Map<String, dynamic>,
      );
    } catch (_) {
      return Settings();
    }
  }

  Future<void> save(Settings s) async {
    await dir.create(recursive: true);
    final tmp = File('${_file.path}.tmp');
    await tmp.writeAsString(s.export());
    await tmp.rename(_file.path);
  }
}
