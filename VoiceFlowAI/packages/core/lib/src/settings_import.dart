import 'dart:convert';

import 'settings.dart';

/// Result of reading a settings file. All or nothing: any problem means [settings] is null and
/// [errors] says what to fix, so a half-valid file never changes anything.
class SettingsImport {
  final Settings? settings;
  final List<String> errors;

  /// Things deliberately left as they are on this device (see [Settings.importFrom]).
  final List<String> kept;
  const SettingsImport(this.settings, this.errors, this.kept);
  bool get ok => settings != null;
}

extension SettingsImporter on Settings {
  static const _maxDictionary = 5000;
  static const _maxCorrections = 2000;
  static const _maxPerApp = 500;
  static const _maxPacks = 50;
  static const _presets = {'proxy', 'ollama', 'custom'};

  /// Reads an exported settings file on top of [current].
  ///
  /// Imported: profile, per-app profiles, hotkey, language, sounds, retention, packs, dictionary,
  /// corrections, polish preset and local-server address/model.
  /// Never imported, always kept from this device: the cloud-polish switch and **consent** (consent
  /// is something a person gives on this device, not something a file can grant), onboarding state
  /// and the microphone choice (device specific).
  static SettingsImport importFrom(String text, Settings current) {
    final errors = <String>[];
    Object? raw;
    try {
      raw = jsonDecode(text);
    } catch (_) {
      return const SettingsImport(null, ['This file is not valid JSON.'], []);
    }
    if (raw is! Map) {
      return const SettingsImport(
          null, ['A settings file must be a JSON object.'], []);
    }
    final version = raw['version'];
    if (version is int && version > Settings.currentVersion) {
      return const SettingsImport(
          null,
          ['This file was made by a newer VoiceFlow. Update the app first.'],
          []);
    }
    final Map<String, dynamic> j;
    try {
      j = Settings.migrate(Map<String, dynamic>.from(raw));
    } catch (_) {
      return const SettingsImport(
          null, ['The settings file could not be read.'], []);
    }

    final s = Settings.fromJson(current.toJson());

    String? str(String k, {int max = 200}) {
      final v = j[k];
      if (v == null) return null;
      if (v is! String || v.length > max) {
        errors.add('"$k" must be text of at most $max characters.');
        return null;
      }
      return v;
    }

    bool? flag(String k) {
      final v = j[k];
      if (v == null) return null;
      if (v is! bool) {
        errors.add('"$k" must be true or false.');
        return null;
      }
      return v;
    }

    List<String>? list(String k, int max, {int itemMax = 80}) {
      final v = j[k];
      if (v == null) return null;
      if (v is! List || v.any((x) => x is! String || x.length > itemMax)) {
        errors.add('"$k" must be a list of short text items.');
        return null;
      }
      if (v.length > max) {
        errors.add('"$k" has too many entries (limit $max).');
        return null;
      }
      return List<String>.from(v);
    }

    Map<String, String>? map(String k, int max, {int itemMax = 80}) {
      final v = j[k];
      if (v == null) return null;
      if (v is! Map ||
          v.entries.any((e) =>
              e.value is! String ||
              (e.value as String).length > itemMax ||
              e.key.toString().length > itemMax)) {
        errors.add('"$k" must map short text to short text.');
        return null;
      }
      if (v.length > max) {
        errors.add('"$k" has too many entries (limit $max).');
        return null;
      }
      return {for (final e in v.entries) e.key.toString(): e.value as String};
    }

    s.defaultProfileId = str('defaultProfileId', max: 40) ?? s.defaultProfileId;
    s.perAppProfiles =
        map('perAppProfiles', _maxPerApp, itemMax: 120) ?? s.perAppProfiles;
    final pf = str('promptFormat', max: 12);
    if (pf != null &&
        const {'auto', 'labels', 'xml', 'markdown'}.contains(pf)) {
      s.promptFormat = pf;
    }
    final al = str('aiLength', max: 16);
    if (al != null && const {'concise_first', 'as_said'}.contains(al)) {
      s.aiLength = al;
    }
    s.hotkey = str('hotkey', max: 30) ?? s.hotkey;
    s.language = str('language', max: 10) ?? s.language;
    s.soundsOn = flag('soundsOn') ?? s.soundsOn;
    s.historyEnabled = flag('historyEnabled') ?? s.historyEnabled;
    final r = j['retentionDays'];
    if (r != null) {
      if (r is! int) {
        errors.add('"retentionDays" must be a whole number.');
      } else {
        s.retentionDays = r.clamp(1, 365);
      }
    }
    s.activePacks =
        list('activePacks', _maxPacks, itemMax: 40) ?? s.activePacks;
    s.dictionary = list('dictionary', _maxDictionary) ?? s.dictionary;
    s.corrections = map('corrections', _maxCorrections) ?? s.corrections;

    final preset = str('cloudPreset', max: 20);
    if (preset != null) {
      if (_presets.contains(preset)) {
        s.cloudPreset = preset;
      } else {
        errors.add('"cloudPreset" must be one of: ${_presets.join(', ')}.');
      }
    }
    final url = str('ollamaUrl', max: 200);
    if (url != null) {
      final u = Uri.tryParse(url);
      final local = u != null &&
          (u.scheme == 'http' || u.scheme == 'https') &&
          const {'localhost', '127.0.0.1', '::1', '[::1]'}.contains(u.host);
      if (local) {
        s.ollamaUrl = url;
      } else {
        errors.add(
            '"ollamaUrl" must be an address on this computer (localhost).');
      }
    }
    s.ollamaModel = str('ollamaModel', max: 100) ?? s.ollamaModel;

    if (errors.isNotEmpty) return SettingsImport(null, errors, const []);
    return SettingsImport(s, const [], const [
      'cloud polish switch and consent',
      'onboarding state',
      'microphone choice',
    ]);
  }
}
