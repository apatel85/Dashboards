import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';

/// An app (or program) you can pick a style for. [id] is the Android package or the Windows program.
class PickableApp {
  const PickableApp(this.id, this.name);
  final String id;
  final String name;
}

typedef AppLister = Future<List<PickableApp>> Function();

/// Android: every app with a launcher icon. Windows: programs that have an open window right now
/// (a full list of installed programs has no reliable program names to match against).
/// Anywhere else, or on failure: an empty list, and the picker falls back to typing an id.
Future<List<PickableApp>> listInstalledApps() async {
  try {
    if (Platform.isAndroid) {
      const ch = MethodChannel('voiceflow/setup');
      final r = await ch.invokeMethod<List<Object?>>('listApps') ?? const [];
      return [
        for (final e in r)
          if (e is Map && e['id'] is String)
            PickableApp(
              (e['id'] as String).toLowerCase(),
              (e['name'] as String?) ?? e['id'] as String,
            ),
      ];
    }
    if (Platform.isWindows) {
      final r = await Process.run('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        r"Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { $_.ProcessName }",
      ]).timeout(const Duration(seconds: 8));
      final seen = <String>{};
      final out = <PickableApp>[];
      for (final line in const LineSplitter().convert(r.stdout.toString())) {
        final n = line.trim();
        if (n.isEmpty) continue;
        final id = '${n.toLowerCase()}.exe';
        if (seen.add(id)) out.add(PickableApp(id, n));
      }
      out.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
      return out;
    }
  } catch (_) {}
  return const [];
}
