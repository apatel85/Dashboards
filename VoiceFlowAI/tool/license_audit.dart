// Audits Dart package licenses of the package in the current folder (run from packages/core or app)
// and checks that every direct dependency is listed in docs/THIRD_PARTY.md.
// Native libraries and models are listed by hand in docs/THIRD_PARTY.md.
import 'dart:convert';
import 'dart:io';

bool _allowed(String t) =>
    t.contains('permission is hereby granted') || // MIT
    t.contains('redistribution and use in source and binary forms') || // BSD
    t.contains('apache license');

bool _copyleft(String t) =>
    t.contains('gnu general public') || t.contains('gnu lesser');

File? _license(Directory dir) {
  for (final n in ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING']) {
    final c = File('${dir.path}/$n');
    if (c.existsSync()) return c;
  }
  return null;
}

void main() {
  final cfg = jsonDecode(File('.dart_tool/package_config.json').readAsStringSync());
  final self = RegExp(r'^name:\s*(\S+)', multiLine: true)
          .firstMatch(File('pubspec.yaml').readAsStringSync())
          ?.group(1) ??
      '';
  final bad = <String>[];
  var sdkLicenseOk = false;
  for (final p in cfg['packages'] as List) {
    final name = p['name'] as String;
    if (name == self || name == 'voiceflow_core' || name == 'voiceflow_app') continue;
    final root = Uri.parse(p['rootUri'] as String);
    final dir = Directory.fromUri(
        root.isAbsolute ? root : Directory('.dart_tool').uri.resolveUri(root));
    // Flutter SDK packages carry no LICENSE of their own: the SDK's top-level BSD license covers them.
    final inSdk = dir.path.contains('/bin/cache/pkg/') ||
        RegExp(r'/flutter[^/]*/packages/').hasMatch(dir.path);
    if (inSdk) {
      if (!sdkLicenseOk) {
        var d = dir;
        for (var i = 0; i < 6 && !sdkLicenseOk; i++) {
          final f = File('${d.path}/LICENSE');
          if (f.existsSync() && _allowed(f.readAsStringSync().toLowerCase())) {
            sdkLicenseOk = true;
          }
          d = d.parent;
        }
        if (!sdkLicenseOk) bad.add('$name (Flutter SDK license not found)');
      }
      continue;
    }
    final t = _license(dir)?.readAsStringSync().toLowerCase() ?? '';
    if (!_allowed(t) || _copyleft(t)) bad.add(name);
  }

  // Every direct dependency must be named in THIRD_PARTY.md.
  final tp = File('../docs/THIRD_PARTY.md').existsSync()
      ? File('../docs/THIRD_PARTY.md')
      : File('../../docs/THIRD_PARTY.md');
  if (tp.existsSync()) {
    final listed = tp.readAsStringSync().toLowerCase();
    final y = File('pubspec.yaml').readAsStringSync();
    final dep = RegExp(r'^dependencies:\s*\n((?:[ \t]+.*\n|\s*\n)+)', multiLine: true).firstMatch(y);
    if (dep != null) {
      for (final m in RegExp(r'^  ([a-z0-9_]+):', multiLine: true).allMatches(dep.group(1)!)) {
        final n = m.group(1)!;
        if (n == 'flutter' || n == 'voiceflow_core') continue;
        if (!listed.contains(n)) bad.add('$n (not listed in docs/THIRD_PARTY.md)');
      }
    }
  }

  if (bad.isNotEmpty) {
    stderr.writeln('License audit failed: ${bad.join(', ')}');
    exit(1);
  }
  stdout.writeln('license audit: OK');
}
