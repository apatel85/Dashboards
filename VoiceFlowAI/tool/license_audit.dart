// Audits Dart package licenses of packages/core (run from that folder).
// Native libraries and models are listed by hand in docs/THIRD_PARTY.md.
import 'dart:convert';
import 'dart:io';

void main() {
  final cfg = jsonDecode(File('.dart_tool/package_config.json').readAsStringSync());
  final bad = <String>[];
  for (final p in cfg['packages'] as List) {
    final name = p['name'] as String;
    if (name == 'voiceflow_core') continue;
    final root = Uri.parse(p['rootUri'] as String);
    final dir = Directory.fromUri(
        root.isAbsolute ? root : Directory('.dart_tool').uri.resolveUri(root));
    File? f;
    for (final n in ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING']) {
      final c = File('${dir.path}/$n');
      if (c.existsSync()) { f = c; break; }
    }
    final t = f?.readAsStringSync().toLowerCase() ?? '';
    final ok = t.contains('permission is hereby granted') || // MIT
        t.contains('redistribution and use in source and binary forms') || // BSD
        t.contains('apache license');
    final copyleft = t.contains('gnu general public') || t.contains('gnu lesser');
    if (!ok || copyleft) bad.add(name);
  }
  if (bad.isNotEmpty) {
    stderr.writeln('Disallowed/unknown license: ${bad.join(', ')}');
    exit(1);
  }
}
