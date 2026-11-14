import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import '../engines/sherpa_stt.dart';
import '../state/assets_loader.dart';
import '../state/per_app_profiles.dart';
import '../state/settings_store.dart';

class _CaptureSink implements TextSink {
  String? text;
  @override
  Future<InsertResult> insert(String t) async {
    text = t;
    return InsertResult.ok;
  }

  @override
  Future<void> undoLast() async {}
}

/// Everything the Android keyboard (Kotlin) asks of Dart, over one MethodChannel.
/// Kotlin owns the UI, the microphone and the InputConnection; this owns the
/// shared brain (speech model, formatter, per-app profile memory).
class ImeBackend {
  ImeBackend({
    required this.assets,
    required this.store,
    required this.models,
    required this.stt,
    required this.ensureLoaded,
    required this.unloadEngine,
  });

  final AppAssets assets;
  final SettingsStore store;
  final ModelManager models;
  final SttEngine stt;
  final Future<void> Function() ensureLoaded;
  final Future<void> Function() unloadEngine;

  static Future<ImeBackend> create() async {
    final support = await getApplicationSupportDirectory();
    final spec = ModelSpec.fromJson(
      (jsonDecode(
        await rootBundle.loadString('assets/models.json'),
      ) as List).first,
    );
    final models = ModelManager(spec, Directory('${support.path}/models'));
    final engine = SherpaSttEngine();
    final cfg = SttModelConfig(
      spec.id,
      models.dir.path,
      files: const {
        'encoder': 'base.en-encoder.int8.onnx',
        'decoder': 'base.en-decoder.int8.onnx',
        'tokens': 'base.en-tokens.txt',
      },
    );
    return ImeBackend(
      assets: await AppAssets.load(),
      store: SettingsStore(support),
      models: models,
      stt: engine,
      ensureLoaded: () async {
        if (!engine.loaded) await engine.load(cfg);
      },
      unloadEngine: engine.unload,
    );
  }

  Profile _profile(String id) => assets.profiles.firstWhere(
    (p) => p.id == id,
    orElse: () => assets.profiles.first,
  );

  /// Settings are shared with the main app, which may have changed them: always re-read.
  Future<Settings> _settings() => store.load();

  Future<Map<String, Object?>> status() async {
    final s = await _settings();
    final p = _profile(s.defaultProfileId);
    return {
      'modelReady': models.installed,
      'onboardingDone': s.onboardingDone,
      'profile': {'id': p.id, 'name': p.name},
      'profiles': [
        for (final x in assets.profiles) {'id': x.id, 'name': x.name},
      ],
      'cloud': s.cloudActive,
    };
  }

  /// [args]: `pcm` (16 kHz mono 16-bit), optional `profileId`, `packageName`, `fieldKind`.
  /// Profile order: explicit choice, then what you picked for that app, then your default.
  Future<Map<String, Object?>> dictate(Map<dynamic, dynamic> args) async {
    try {
      final kind = FieldKind.values.firstWhere(
        (k) => k.name == args['fieldKind'],
        orElse: () => FieldKind.text,
      );
      if (kind == FieldKind.password) return {'status': 'passwordField'};
      if (!models.installed) return {'status': 'modelMissing'};
      final pcm = args['pcm'] as Uint8List;
      final s = await _settings();
      final pkg = args['packageName'] as String?;
      final perApp = PerAppProfiles(
        s.perAppProfiles,
        onChanged: (_) {},
        ignore: const {},
      );
      final profile = _profile(
        (args['profileId'] as String?) ??
            perApp.profileFor(pkg) ??
            s.defaultProfileId,
      );

      await ensureLoaded();
      final sink = _CaptureSink();
      final r = await DictationPipeline(assets.lang, stt, sink).run(
        pcm,
        DictationOptions(
          profile,
          packs: assets.packs,
          dictionary: s.dictionary,
          corrections: s.corrections,
          fieldKind: kind,
        ),
      );
      return {
        'status': r.status.name,
        'text': r.finalText,
        'polish': r.polishUsed,
        'hint': r.hint,
        'profile': {'id': profile.id, 'name': profile.name},
      };
    } catch (_) {
      return {'status': 'error'};
    }
  }

  /// Chip tap. With a [packageName] it is remembered for that app; always saved.
  Future<Map<String, Object?>> setProfile(
    String id,
    String? packageName,
  ) async {
    final s = await _settings();
    final p = _profile(id);
    if (packageName == null || packageName.isEmpty) {
      s.defaultProfileId = p.id;
    } else {
      s.perAppProfiles = {...s.perAppProfiles, packageName.toLowerCase(): p.id};
    }
    await store.save(s);
    return {'id': p.id, 'name': p.name};
  }

  Future<dynamic> handle(MethodCall call) async {
    final a = call.arguments is Map ? call.arguments as Map : const {};
    switch (call.method) {
      case 'ping':
        return 'pong';
      case 'status':
        return status();
      case 'dictate':
        return dictate(a);
      case 'setProfile':
        return setProfile(a['id'] as String, a['packageName'] as String?);
      case 'unload':
        await unloadEngine();
        return null;
      default:
        throw MissingPluginException();
    }
  }
}
