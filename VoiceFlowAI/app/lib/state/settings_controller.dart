import 'package:flutter/foundation.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

/// The Settings page's brain. Mutates the one shared [Settings] object (so every part of the app
/// sees changes at once) and saves after each change.
class SettingsController extends ChangeNotifier {
  SettingsController(
    this.settings,
    this.save, {
    this.onImported,
    this.onPerAppChanged,
  });

  final Settings settings;
  final Future<void> Function() save;

  /// Called after an import so other parts (packs, profile) can re-read the settings.
  final VoidCallback? onImported;

  /// Called when the saved per-app styles changed, so a running dictation path re-reads them.
  final void Function(Map<String, String>)? onPerAppChanged;

  Future<void> _commit() async {
    notifyListeners();
    await save();
  }

  /// Turning polish on is the consent moment: the page asks first, then calls this with `true`.
  Future<void> setCloudPolish(bool on, {required bool consent}) async {
    settings.cloudPolish = on;
    settings.cloudConsent = on && consent;
    await _commit();
  }

  Future<void> setProfessionalTone(String tone) async {
    settings.professionalTone = tone == 'formal' ? 'formal' : 'neutral';
    await _commit();
  }

  Future<void> setMaskCloud(bool on) async {
    settings.maskCloud = on;
    await _commit();
  }

  Future<void> setPreset(String preset) async {
    settings.cloudPreset = preset;
    // switching to a different kind of server is a new decision: ask again
    settings.cloudConsent = false;
    settings.cloudPolish = false;
    await _commit();
  }

  Future<void> setOllama({String? url, String? model}) async {
    if (url != null) settings.ollamaUrl = url;
    if (model != null) settings.ollamaModel = model;
    await _commit();
  }

  Future<void> setSounds(bool on) async {
    settings.soundsOn = on;
    await _commit();
  }

  Future<void> setPromptFormat(String v) async {
    settings.promptFormat = v;
    await _commit();
  }

  Future<void> setAiLength(String v) async {
    settings.aiLength = v;
    await _commit();
  }

  /// Your style for one app ([profileId] null = back to automatic). [appId] is the Android package
  /// or Windows program name.
  Future<void> setAppProfile(String appId, String? profileId) async {
    final k = appId.trim().toLowerCase();
    if (k.isEmpty) return;
    final m = Map<String, String>.of(settings.perAppProfiles);
    if (profileId == null) {
      m.remove(k);
    } else {
      m[k] = profileId;
    }
    settings.perAppProfiles = m;
    onPerAppChanged?.call(m);
    await _commit();
  }

  /// JSON the person can keep. No keys and no history (there are none to leak).
  String exportJson() => settings.export();

  /// Applies an exported file. Returns the reasons it was refused (empty list = applied).
  Future<List<String>> importJson(String text) async {
    final r = SettingsImporter.importFrom(text, settings);
    if (!r.ok) return r.errors;
    final n = r.settings!;
    settings
      ..defaultProfileId = n.defaultProfileId
      ..perAppProfiles = n.perAppProfiles
      ..promptFormat = n.promptFormat
      ..aiLength = n.aiLength
      ..hotkey = n.hotkey
      ..language = n.language
      ..soundsOn = n.soundsOn
      ..historyEnabled = n.historyEnabled
      ..retentionDays = n.retentionDays
      ..activePacks = n.activePacks
      ..dictionary = n.dictionary
      ..corrections = n.corrections
      ..cloudPreset = n.cloudPreset
      ..ollamaUrl = n.ollamaUrl
      ..ollamaModel = n.ollamaModel;
    onPerAppChanged?.call(settings.perAppProfiles);
    await _commit();
    onImported?.call();
    return const [];
  }
}
