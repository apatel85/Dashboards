import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import 'app.dart';
import 'audio/mic.dart';
import 'engines/sherpa_stt.dart';
import 'platform/windows/hotkey_gestures.dart';
import 'platform/windows/hotkey_manager.dart';
import 'platform/windows/insertion.dart';
import 'platform/windows/keyboard_hook.dart';
import 'platform/windows/pill_window.dart';
import 'platform/windows/windows_os.dart';
import 'state/dictation_state.dart';
import 'platform/desktop_shell.dart';
import 'state/app_controller.dart';
import 'state/per_app_profiles.dart';
import 'platform/windows/system_integration.dart';
import 'state/assets_loader.dart';
import 'state/dictation_service.dart';
import 'state/onboarding_controller.dart';
import 'state/settings_store.dart';

// Keeps the keyboard's headless entrypoint (imeMain) in the compiled program;
// without this import, release builds omit the library and the IME engine
// fails with "library 'package:voiceflow_app/ime_main.dart' not found".
// ignore: unused_import
import 'ime_main.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final support = await getApplicationSupportDirectory();
  final store = SettingsStore(support);
  final settings = await store.load();
  final assets = await AppAssets.load();
  final spec = ModelSpec.fromJson(
    (jsonDecode(
      await rootBundle.loadString('assets/models.json'),
    ) as List).first,
  );
  final models = ModelManager(spec, Directory('${support.path}/models'));
  if (Platform.isWindows &&
      SingleInstance.acquire(r'Local\VoiceFlowAI-SingleInstance') == null) {
    exit(0); // another VoiceFlow is already running in this session
  }
  final controller = AppController(assets);
  if (Platform.isWindows) {
    controller.foregroundApp = foregroundAppId;
    controller.perApp = PerAppProfiles(
      settings.perAppProfiles,
      onChanged: (m) {
        settings.perAppProfiles = m;
        unawaited(store.save(settings));
      },
    );
  }

  final engine = SherpaSttEngine();
  final mic = MicAudioSource(deviceId: settings.micDeviceId);
  final cfg = SttModelConfig(
    spec.id,
    models.dir.path,
    files: const {
      'encoder': 'base.en-encoder.int8.onnx',
      'decoder': 'base.en-decoder.int8.onnx',
      'tokens': 'base.en-tokens.txt',
    },
  );
  // Shared by every dictation path, so both must be safe to call at any time.
  Future<void> loadEngine() async {
    if (!engine.loaded) await engine.load(cfg);
  }

  Future<void> unloadEngine() async {
    final s = controller.state;
    if (s == DictationUiState.listening ||
        s == DictationUiState.processing ||
        s == DictationUiState.polishing) {
      return; // someone is using it
    }
    await engine.unload();
  }

  DictationService makeService(TextSink sink) => DictationService(
    controller: controller,
    audio: mic,
    pipeline: DictationPipeline(assets.lang, engine, sink),
    options: () => DictationOptions(
      controller.profile,
      packs: assets.packs,
      dictionary: settings.dictionary,
      corrections: settings.corrections,
    ),
    modelReady: () => models.installed,
    loadEngine: loadEngine,
    unloadEngine: unloadEngine,
  );

  // In-app Record button: copy-mode (always works, no focus tricks).
  final service = makeService(ClipboardSink());

  if (Platform.isWindows) {
    // Global hotkey dictation: types into whatever app has focus.
    final sink = WindowsTextSink(WindowsOs());
    final hotkeyService = makeService(sink);
    final manager = HotkeyManager(
      gestures: HotkeyGestures(
        onStart: () => unawaited(hotkeyService.start()),
        onStop: () => unawaited(hotkeyService.stop()),
        onCancel: () => unawaited(hotkeyService.cancel()),
      ),
      onUndo: () => unawaited(sink.undoLast()),
      onCycleProfile: controller.cycleProfile,
    );
    KeyboardHook(manager).install();
    PillWindow(controller).create();
  }

  OnboardingController? onboarding;
  final finished = ValueNotifier<bool>(settings.onboardingDone);
  if (!settings.onboardingDone) {
    onboarding = OnboardingController(
      mic: RecordMicProbe(),
      installer: ManagerInstaller(models),
      initialDeviceId: settings.micDeviceId,
      onFinished: () async {
        settings
          ..onboardingDone = true
          ..micDeviceId = onboarding?.deviceId;
        mic.deviceId = settings.micDeviceId;
        await store.save(settings);
        finished.value = true;
      },
    );
  }

  await DesktopShell.init(controller); // no-op off Windows
  runApp(
    VoiceFlowApp(
      controller: controller,
      service: service,
      onboarding: onboarding,
      onboardingFinished: finished,
    ),
  );
}
