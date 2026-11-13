import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import 'app.dart';
import 'audio/mic.dart';
import 'engines/sherpa_stt.dart';
import 'platform/desktop_shell.dart';
import 'state/app_controller.dart';
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
  final controller = AppController(assets);

  final engine = SherpaSttEngine();
  final mic = MicAudioSource(deviceId: settings.micDeviceId);
  final service = DictationService(
    controller: controller,
    audio: mic,
    pipeline: DictationPipeline(assets.lang, engine, ClipboardSink()),
    options: () => DictationOptions(
      controller.profile,
      packs: assets.packs,
      dictionary: settings.dictionary,
      corrections: settings.corrections,
    ),
    modelReady: () => models.installed,
    loadEngine: () => engine.load(
      SttModelConfig(
        spec.id,
        models.dir.path,
        files: const {
          'encoder': 'base.en-encoder.int8.onnx',
          'decoder': 'base.en-decoder.int8.onnx',
          'tokens': 'base.en-tokens.txt',
        },
      ),
    ),
    unloadEngine: engine.unload,
  );

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
