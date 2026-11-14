import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import 'assets_loader.dart';

/// The app's view of domain packs (spec §8): bundled packs, packs the user imported into
/// `<data>/packs`, which are on and in what order, and rule-based suggestions.
/// Nothing here ever turns a pack on by itself; only [setActive] does, on a user action.
class PackStore extends ChangeNotifier {
  PackStore({
    required this.registry,
    required this.settings,
    required this.save,
    this.userDir,
  });

  final PackRegistry registry;
  final Settings settings;
  final Future<void> Function() save;
  final Directory? userDir;
  final Set<String> _bundled = {};
  final Set<String> _dismissed = {}; // this run only
  final PackDetector detector = const PackDetector();

  static Future<PackStore> load(
    AppAssets assets,
    Settings settings,
    Future<void> Function() save, {
    Directory? userDir,
  }) async {
    final s = PackStore(
      registry: PackRegistry(),
      settings: settings,
      save: save,
      userDir: userDir,
    );
    for (final src in assets.packSources) {
      final r = s.registry.add(src, source: 'bundled');
      if (r.ok) s._bundled.add(r.pack!.id);
    }
    await s.reloadUserPacks();
    return s;
  }

  /// Re-reads the user folder and the saved on/off list (the keyboard and the app share them).
  Future<void> reloadUserPacks() async {
    final dir = userDir;
    if (dir != null && dir.existsSync()) {
      for (final f in dir.listSync().whereType<File>().where(
        (f) => f.path.endsWith('.json'),
      )) {
        final name = f.uri.pathSegments.last;
        try {
          registry.add(f.readAsStringSync(), source: name);
        } catch (_) {
          registry.errors.add(
            PackLoadError(name, const ['Could not read this file.']),
          );
        }
      }
    }
    registry.setActive(settings.activePacks);
    notifyListeners();
  }

  /// Applies the saved on/off list without touching disk (settings may have changed elsewhere).
  void syncFromSettings() {
    registry.setActive(settings.activePacks);
    notifyListeners();
  }

  List<DomainPack> get active => registry.active;
  List<DomainPack> get inactive =>
      registry.all.where((p) => !registry.activeIds.contains(p.id)).toList();
  List<PackLoadError> get errors => registry.errors;
  bool isBundled(String id) => _bundled.contains(id);

  Future<void> _persist() async {
    settings.activePacks = registry.activeIds;
    notifyListeners();
    await save();
  }

  Future<void> setActive(String id, bool on) async {
    on ? registry.activate(id) : registry.deactivate(id);
    await _persist();
  }

  Future<void> move(String id, int delta) async {
    registry.move(id, delta);
    await _persist();
  }

  /// Imports a pack from its file text. Returns readable reasons if it is refused
  /// (empty list = imported). A valid pack is copied into the user folder so it survives restarts.
  Future<List<String>> importJson(String text, String fileName) async {
    final before = registry.errors.length;
    final r = registry.add(text, source: fileName);
    if (!r.ok) {
      // Shown to the user right now; do not keep nagging about it afterwards.
      registry.errors.removeRange(before, registry.errors.length);
      notifyListeners();
      return r.errors;
    }
    final dir = userDir;
    if (dir != null) {
      await dir.create(recursive: true);
      await File('${dir.path}/${r.pack!.id}.json').writeAsString(text);
    }
    notifyListeners();
    return const [];
  }

  /// Removes an imported pack. Bundled packs can only be switched off.
  Future<void> removeUserPack(String id) async {
    if (isBundled(id)) return;
    final dir = userDir;
    if (dir != null) {
      final f = File('${dir.path}/$id.json');
      if (f.existsSync()) f.deleteSync();
    }
    registry.remove(id);
    await _persist();
  }

  void clearErrors() {
    registry.errors.clear();
    notifyListeners();
  }

  /// Packs worth offering right now. Already-on and dismissed ones are left out.
  List<PackSuggestion> suggest(DetectContext ctx) => detector.suggest(
    registry.all,
    ctx,
    exclude: {...registry.activeIds, ..._dismissed},
  );

  void dismissSuggestion(String id) {
    _dismissed.add(id);
    notifyListeners();
  }
}
