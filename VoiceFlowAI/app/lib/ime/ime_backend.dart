import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import '../engines/sherpa_stt.dart';
import '../state/assets_loader.dart';
import '../state/pack_store.dart';
import '../state/polish_holder.dart';
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
    this.packsDir,
    PolishHolder? polish,
  }) : _polish = polish ?? PolishHolder(Settings());

  final AppAssets assets;
  final SettingsStore store;
  final ModelManager models;
  final SttEngine stt;
  final Future<void> Function() ensureLoaded;
  final Future<void> Function() unloadEngine;

  /// Where imported packs live (shared with the main app).
  final Directory? packsDir;
  final PolishHolder _polish;
  final Set<String> _dismissed =
      {}; // suggestions waved away until the engine restarts

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
      packsDir: Directory('${support.path}/packs'),
    );
  }

  Profile _profile(String id) => assets.profiles.firstWhere(
    (p) => p.id == id,
    orElse: () => assets.profiles.first,
  );

  /// Settings are shared with the main app, which may have changed them: always re-read.
  Future<Settings> _settings() => store.load();

  /// Packs as the main app left them. Re-read on every call: tiny files, and the app may have
  /// imported or switched packs since the keyboard last looked.
  Future<PackStore> _packStore(Settings s) =>
      PackStore.load(assets, s, () => store.save(s), userDir: packsDir);

  /// Packs worth offering for the app being typed into (never switched on here).
  Future<List<Map<String, Object?>>> suggestions(String? packageName) async {
    final s = await _settings();
    final ps = await _packStore(s);
    final found = ps.detector.suggest(
      ps.registry.all,
      DetectContext(appId: packageName),
      exclude: {...ps.registry.activeIds, ..._dismissed},
    );
    return [
      for (final x in found)
        {'id': x.pack.id, 'name': x.pack.name, 'why': x.reasons.join(', ')},
    ];
  }

  /// The person tapped the suggestion chip: turn the pack on (last priority) and save.
  Future<List<String>> activatePack(String id) async {
    final s = await _settings();
    final ps = await _packStore(s);
    await ps.setActive(id, true);
    return ps.registry.activeIds;
  }

  void dismissPack(String id) => _dismissed.add(id);

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

  /// Everything one dictation needs, or an early status (password field, model missing).
  Future<
    ({Map<String, Object?>? early, DictationOptions? options, Profile? profile})
  >
  _prepare(Map<dynamic, dynamic> args) async {
    final kind = FieldKind.values.firstWhere(
      (k) => k.name == args['fieldKind'],
      orElse: () => FieldKind.text,
    );
    if (kind == FieldKind.password) {
      return (early: {'status': 'passwordField'}, options: null, profile: null);
    }
    if (!models.installed) {
      return (early: {'status': 'modelMissing'}, options: null, profile: null);
    }
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
    final packs = (await _packStore(s)).active;
    _polish.settings = s; // keeps the chain (429 back-off, counters) while settings are unchanged
    return (
      early: null,
      options: DictationOptions(
        profile,
        packs: packs,
        dictionary: s.dictionary,
        corrections: s.corrections,
        fieldKind: kind,
        promptStyle: PromptStyle.resolve(
          promptFormat: s.promptFormat,
          aiLength: s.aiLength,
          appId: pkg,
        ),
      ),
      profile: profile,
    );
  }

  DictationPipeline _pipeline(_CaptureSink sink) => DictationPipeline(
    assets.lang,
    stt,
    sink,
    polishProvider: () => _polish.chain,
  );

  Map<String, Object?> _result(DictationResult r, Profile profile) => {
    'status': r.status.name,
    'text': r.finalText,
    'polish': r.polishUsed,
    'hint': r.hint,
    'profile': {'id': profile.id, 'name': profile.name},
  };

  /// [args]: `pcm` (16 kHz mono 16-bit), optional `profileId`, `packageName`, `fieldKind`.
  /// Profile order: explicit choice, then what you picked for that app, then your default.
  Future<Map<String, Object?>> dictate(Map<dynamic, dynamic> args) async {
    try {
      final p = await _prepare(args);
      if (p.early != null) return p.early!;
      await ensureLoaded();
      final r = await _pipeline(_CaptureSink())
          .run(args['pcm'] as Uint8List, p.options!);
      return _result(r, p.profile!);
    } catch (_) {
      return {'status': 'error'};
    }
  }

  // ---- streaming dictation: no length limit. Audio arrives in small chunks while the person
  // talks; the core session cuts it at pauses and transcribes as it goes.
  LongDictationSession? _stream;
  Future<void> _streamChain = Future.value();
  Future<void>? _streamLoad;
  Map<String, Object?>? _streamEarly;
  DictationOptions? _streamOptions;
  Profile? _streamProfile;

  /// [args]: `profileId`, `packageName`, `fieldKind`. Returns right away; chunks may follow
  /// immediately and are queued behind the preparation.
  void streamStart(Map<dynamic, dynamic> args) {
    _stream?.cancel();
    _stream = null;
    _streamEarly = null;
    _streamOptions = null;
    _streamProfile = null;
    _streamLoad = null;
    _streamChain = _prepare(args)
        .then((p) {
          if (p.early != null) {
            _streamEarly = p.early;
            return;
          }
          _streamOptions = p.options;
          _streamProfile = p.profile;
          final o = p.options!;
          _stream = _pipeline(_CaptureSink()).startSession(
            hints: {
              ...o.dictionary,
              for (final k in o.packs) ...k.vocabulary,
            }.toList(),
          );
          // Load the speech model while the person is still talking.
          _streamLoad = ensureLoaded().then<void>(
            (_) {},
            onError: (Object e) {
              throw e;
            },
          );
        })
        .catchError((Object _) {
          _streamEarly = {'status': 'error'};
        });
  }

  void streamChunk(Uint8List pcm) {
    _streamChain = _streamChain.then((_) => _stream?.add(pcm));
  }

  void streamCancel() {
    _streamChain = _streamChain.then((_) {
      _stream?.cancel();
      _stream = null;
    });
  }

  Future<Map<String, Object?>> streamEnd() async {
    try {
      await _streamChain;
      final early = _streamEarly;
      if (early != null) return early;
      final session = _stream;
      if (session == null) return {'status': 'error'};
      _stream = null;
      await _streamLoad;
      final r = await _pipeline(_CaptureSink())
          .runSession(session, _streamOptions!);
      return _result(r, _streamProfile!);
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
      case 'streamStart':
        streamStart(a);
        return null;
      case 'streamChunk':
        streamChunk(a['pcm'] as Uint8List);
        return null;
      case 'streamCancel':
        streamCancel();
        return null;
      case 'streamEnd':
        return streamEnd();
      case 'setProfile':
        return setProfile(a['id'] as String, a['packageName'] as String?);
      case 'suggestions':
        return suggestions(a['packageName'] as String?);
      case 'activatePack':
        return activatePack(a['id'] as String);
      case 'dismissPack':
        dismissPack(a['id'] as String);
        return null;
      case 'unload':
        await unloadEngine();
        return null;
      default:
        throw MissingPluginException();
    }
  }
}
